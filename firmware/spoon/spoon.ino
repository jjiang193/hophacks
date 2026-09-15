// ---------------------------------------------------------------------------
// Salinity Spoon - ESP32 firmware
//
// Reads a Gravity Analog EC probe, a DS18B20, and an MPU-6050; fuses them into
// a trust-scored salinity sample; streams JSON over a WebSocket.
//
// Required libraries (Arduino Library Manager unless noted):
//   OneWire                  Paul Stoffregen
//   DallasTemperature        Miles Burton
//   Adafruit MPU6050         (pulls in Adafruit BusIO + Unified Sensor)
//   ArduinoJson              Benoit Blanchon
//   WebSockets               Markus Sattler ("arduinoWebSockets")
//   Adafruit ADS1X15         only if USE_ADS1115 is enabled
//   DFRobot_ESP_EC           https://github.com/GreenPonik/DFRobot_ESP_EC_BY_GREENPONIK
//                            (install as ZIP - not in the Library Manager)
//
// Board: "ESP32 Dev Module". If no COM port appears, install the Silicon Labs
// CP210x VCP driver - the HiLetgo board uses a CP2102.
// ---------------------------------------------------------------------------

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

#include "config.h"
#include "salinity.h"
#include "motion_gate.h"
#include "ec_sensor.h"

// --- Globals -----------------------------------------------------------------
WebSocketsClient  ws;
OneWire           oneWire(PIN_ONEWIRE);
DallasTemperature tempSensors(&oneWire);
Adafruit_MPU6050  mpu;

ECSensor        ecSensor;
MotionGate      motionGate;
StabilityWindow ecStability;

uint32_t seq            = 0;
uint32_t lastSampleMs   = 0;
uint32_t lastTempMs     = 0;
float    lastTempC      = NAN;
float    ambientBaseline = NAN;   // running "room temperature" reference
bool     wsConnected    = false;
bool     mpuPresent     = false;
bool     tempPresent    = false;

// --- WebSocket ---------------------------------------------------------------
void onWsEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[ws] connected");
      break;
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[ws] disconnected");
      break;
    case WStype_TEXT:
      // Reserved for backend -> spoon commands (tare, start session, ...).
      Serial.printf("[ws] rx: %.*s\n", (int)length, payload);
      break;
    default:
      break;
  }
}

void connectWiFi() {
  Serial.printf("[wifi] connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] ok, ip=%s\n", WiFi.localIP().toString().c_str());
  } else {
    // Keep sampling anyway - serial output is still useful, and the WebSocket
    // client will reconnect on its own once the network comes back.
    Serial.println("[wifi] FAILED - continuing offline");
  }
}

// --- Sensors -----------------------------------------------------------------
void initSensors() {
  Wire.begin();

  tempSensors.begin();
  tempPresent = tempSensors.getDeviceCount() > 0;
  if (tempPresent) {
    tempSensors.setResolution(12);
    tempSensors.setWaitForConversion(false);  // non-blocking: request now,
    tempSensors.requestTemperatures();        // collect ~750 ms later
    Serial.println("[temp] DS18B20 found");
  } else {
    Serial.println("[temp] DS18B20 NOT found - check the 4.7k pull-up to 3.3V");
  }

  mpuPresent = mpu.begin();  // 0x68, or 0x69 with AD0 pulled high
  if (mpuPresent) {
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    Serial.println("[imu] MPU-6050 found");
  } else {
    Serial.println("[imu] MPU-6050 NOT found - readings will not be gated");
  }

  ecSensor.begin();
}

void updateTemperature() {
  if (!tempPresent) return;
  if (millis() - lastTempMs < TEMP_INTERVAL_MS) return;
  lastTempMs = millis();

  float t = tempSensors.getTempCByIndex(0);
  tempSensors.requestTemperatures();   // kick off the next conversion

  if (t == DEVICE_DISCONNECTED_C) return;
  lastTempC = t;

  // Track the coldest sustained reading as the ambient baseline, so the
  // submersion check adapts to the room instead of assuming 20 C.
  if (isnan(ambientBaseline) || t < ambientBaseline) {
    ambientBaseline = t;
  }
}

// Fuse EC floor and temperature rise. Either alone is fooled: cold soup barely
// moves the thermometer, and a wet probe on the counter still conducts a little.
bool detectSubmerged(float ec25, float tempC) {
  bool ecSaysYes = ec25 > EC_SUBMERGED_FLOOR_MS;
  bool tempSaysYes = !isnan(tempC) && !isnan(ambientBaseline) &&
                     (tempC - ambientBaseline) > TEMP_RISE_THRESHOLD_C;
  return ecSaysYes || tempSaysYes;
}

// 0..1 trust score. Three independent ways a reading can be wrong, folded into
// one number the dashboard can threshold on.
float computeQuality(bool submerged, float ec25) {
  if (!submerged) return 0.0f;

  float settle = mpuPresent ? motionGate.settleFraction() : 1.0f;
  if (settle > 1.0f) settle = 1.0f;

  float stability = 1.0f;
  if (ecStability.ready()) {
    float sd = ecStability.stdDev();
    // 0.05 mS/cm of jitter is fine; 0.5 is meaningless.
    stability = 1.0f - constrain((sd - 0.05f) / 0.45f, 0.0f, 1.0f);
  } else {
    stability = 0.5f;   // not enough history to judge yet
  }

  float q = settle * 0.5f + stability * 0.5f;

  // An over-range reading is not trustworthy no matter how still the spoon is.
  if (ecSensor.overRange(ec25)) q *= 0.3f;

  return constrain(q, 0.0f, 1.0f);
}

// --- Main loop ---------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Salinity Spoon ===");

  initSensors();
  connectWiFi();

  ws.begin(BACKEND_HOST, BACKEND_PORT, BACKEND_PATH);
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(3000);

  Serial.println("Calibration: type enterec, then calec, then exitec");
}

void loop() {
  ws.loop();
  updateTemperature();

  if (millis() - lastSampleMs < SAMPLE_INTERVAL_MS) return;
  lastSampleMs = millis();

  float tempC     = isnan(lastTempC) ? 25.0f : lastTempC;  // 25 C fallback so
                                                           // EC still resolves
  float voltageMv = ecSensor.readVoltageMv();
  float ec25      = ecSensor.readEC25(voltageMv, tempC);
  float ecRaw     = ecSensor.toRawAtTemp(ec25, tempC);

  ecSensor.serviceCalibration(voltageMv, tempC);

  sensors_event_t a, g, temp;
  if (mpuPresent) {
    mpu.getEvent(&a, &g, &temp);
    motionGate.update(g.gyro.x, g.gyro.y, g.gyro.z);
  }

  bool submerged = detectSubmerged(ec25, lastTempC);
  if (submerged) ecStability.push(ec25);
  else           ecStability.reset();

  float quality = computeQuality(submerged, ec25);
  float gPerL   = salinity::ecToGramsPerLitre(ec25);

  // --- Serialise ---
  StaticJsonDocument<512> doc;
  doc["v"]         = SCHEMA_VERSION;
  doc["device_id"] = DEVICE_ID;
  doc["seq"]       = seq++;
  doc["uptime_ms"] = millis();

  if (isnan(lastTempC)) doc["temp_c"] = nullptr;
  else                  doc["temp_c"] = lastTempC;

  doc["ec_raw_ms"]           = ecRaw;
  doc["ec25_ms"]             = ec25;
  doc["salinity_g_l"]        = gPerL;
  doc["salt_pct"]            = salinity::gramsPerLitreToSaltPercent(gPerL);
  doc["sodium_mg_per_100ml"] = salinity::gramsPerLitreToSodiumMgPer100ml(gPerL);

  JsonObject imu = doc.createNestedObject("imu");
  imu["ax"] = mpuPresent ? a.acceleration.x : 0.0f;
  imu["ay"] = mpuPresent ? a.acceleration.y : 0.0f;
  imu["az"] = mpuPresent ? a.acceleration.z : 0.0f;
  imu["gx"] = mpuPresent ? g.gyro.x : 0.0f;
  imu["gy"] = mpuPresent ? g.gyro.y : 0.0f;
  imu["gz"] = mpuPresent ? g.gyro.z : 0.0f;

  doc["motion"]     = mpuPresent ? motionGate.stateName() : "unknown";
  doc["submerged"]  = submerged;
  doc["quality"]    = quality;
  doc["calibrated"] = true;   // TODO: read the real flag out of EEPROM

  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));

  if (wsConnected) ws.sendTXT(buf, n);
  Serial.println(buf);   // always echo, so a dead network never blinds you
}
