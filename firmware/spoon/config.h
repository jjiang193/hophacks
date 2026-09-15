#pragma once

// ---------------------------------------------------------------------------
// Salinity Spoon - build configuration
// ---------------------------------------------------------------------------

#define SCHEMA_VERSION 1
#define DEVICE_ID      "spoon-01"

// --- Network -----------------------------------------------------------------
// Conference WiFi is hostile. If it fails, run the laptop as a hotspot and
// point these at it.
#define WIFI_SSID      "CHANGE_ME"
#define WIFI_PASSWORD  "CHANGE_ME"

#define BACKEND_HOST   "192.168.1.100"   // laptop running the FastAPI backend
#define BACKEND_PORT   8000
#define BACKEND_PATH   "/ws/ingest"

// --- Pins --------------------------------------------------------------------
// IMPORTANT: the EC sensor MUST live on an ADC1 pin (GPIO 32-39).
// ADC2 is claimed by the WiFi radio on ESP32; analogRead() on an ADC2 pin
// returns garbage (or blocks) whenever WiFi is active. Since we stream over
// WiFi, ADC2 is permanently off-limits here. GPIO35 is input-only and safe.
#define PIN_EC_ADC     35
#define PIN_ONEWIRE    4     // DS18B20 data, with a 4.7k pull-up to 3.3V
// MPU-6050 and ADS1115 share the default I2C bus: SDA=21, SCL=22

// --- ADC path ----------------------------------------------------------------
// The DFRobot EC library was written for a 5V 10-bit Arduino ADC. The ESP32's
// internal ADC is noisier and nonlinear, so EC readings drift.
// Leave this commented out for a first-light demo; uncomment once the ADS1115
// is wired in for readings you can actually defend.
// #define USE_ADS1115

#define ADS1115_ADDR   0x48
#define ADS1115_CHAN   0

// Power the Gravity EC board from 3.3V so its analog output stays inside the
// ESP32's input range. At 5V the output can exceed 3.3V and damage the pin.
#define ADC_REF_MV     3300.0f
#define ADC_MAX_COUNTS 4095.0f

// --- Timing ------------------------------------------------------------------
#define SAMPLE_INTERVAL_MS   200   // 5 Hz: fast enough to see a stir, slow
                                   // enough that the DS18B20 keeps up
#define TEMP_INTERVAL_MS    1000   // DS18B20 12-bit conversion takes ~750 ms
#define EC_MEDIAN_SAMPLES     15   // median-of-N kills ADC spikes

// --- Motion gating -----------------------------------------------------------
// Tuned by watching the serial plotter while holding / stirring the spoon.
#define GYRO_STILL_THRESHOLD    0.15f  // rad/s, below this we call it still
#define GYRO_STIR_THRESHOLD     1.20f  // rad/s, above this it's an active stir
#define STILL_SAMPLES_REQUIRED  10     // ~2 s at 5 Hz before a reading counts

// --- Submersion detection ----------------------------------------------------
// An EC probe in air reads ~0. A probe in soup reads volumes. Combine that
// with the temperature rise for a fusion that survives cold soup.
#define EC_SUBMERGED_FLOOR_MS   0.30f  // mS/cm
#define TEMP_RISE_THRESHOLD_C   3.0f   // above the running ambient baseline

// --- Salinity model ----------------------------------------------------------
// g/L NaCl = A * ec25 + B * ec25^2
// Defaults are fitted to reference NaCl conductivity at 25 C. REPLACE THESE
// with your own fit - see docs/calibration.md. Do not ship the defaults.
#define SALINITY_COEFF_A   0.49078f
#define SALINITY_COEFF_B   0.004608f

#define SODIUM_FRACTION_OF_NACL  0.3934f

// The DFR0300 probe tops out at 20 mS/cm, which a 1% soup will brush against.
#define EC_SENSOR_MAX_MS   20.0f
