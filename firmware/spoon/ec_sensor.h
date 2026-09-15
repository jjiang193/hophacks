#pragma once
#include <Arduino.h>
#include "config.h"

// ---------------------------------------------------------------------------
// EC front-end.
//
// Wraps the two possible analog paths behind one interface so swapping in the
// ADS1115 is a one-line change in config.h rather than a rewrite:
//
//   internal ESP32 ADC  - noisy and nonlinear, fine for first light
//   ADS1115 (16-bit)    - what you want before quoting a number to a judge
//
// Uses GreenPonik's ESP32 port of the DFRobot EC library, which keeps the
// familiar enterec / calec / exitec serial calibration commands and stores the
// result in EEPROM.
// ---------------------------------------------------------------------------

#include "DFRobot_ESP_EC.h"
#include <EEPROM.h>

#ifdef USE_ADS1115
  #include <Adafruit_ADS1X15.h>
#endif

class ECSensor {
 public:
  void begin() {
    EEPROM.begin(32);
    _ec.begin();

#ifdef USE_ADS1115
    if (!_ads.begin(ADS1115_ADDR)) {
      Serial.println("[ec] ADS1115 not found - check I2C wiring");
      _adcOk = false;
    } else {
      // +/-4.096V range: comfortably covers the 0-3.4V sensor output.
      _ads.setGain(GAIN_ONE);
      _adcOk = true;
    }
#else
    analogReadResolution(12);
    // 11 dB attenuation gives roughly the full 0-3.3V input span.
    analogSetPinAttenuation(PIN_EC_ADC, ADC_11db);
    _adcOk = true;
#endif
  }

  // Median-of-N. A mean would let a single ADC spike drag the reading; a
  // median throws the spike away entirely.
  float readVoltageMv() {
    float samples[EC_MEDIAN_SAMPLES];
    for (int i = 0; i < EC_MEDIAN_SAMPLES; i++) {
      samples[i] = rawToMillivolts(readRaw());
      delayMicroseconds(200);
    }
    // Insertion sort - N is 15, anything fancier is wasted code.
    for (int i = 1; i < EC_MEDIAN_SAMPLES; i++) {
      float key = samples[i];
      int j = i - 1;
      while (j >= 0 && samples[j] > key) { samples[j + 1] = samples[j]; j--; }
      samples[j + 1] = key;
    }
    return samples[EC_MEDIAN_SAMPLES / 2];
  }

  // Returns EC compensated to 25 C, in mS/cm.
  // The library does the temperature compensation internally, which is exactly
  // why the DS18B20 is not optional.
  float readEC25(float voltageMv, float tempC) {
    float ec = _ec.readEC(voltageMv, tempC);
    if (ec < 0.0f) ec = 0.0f;
    return ec;
  }

  // Undo the compensation to recover the reading at the actual temperature.
  // Standard 2%/degC linear model, same one the library applies.
  float toRawAtTemp(float ec25, float tempC) {
    return ec25 * (1.0f + 0.02f * (tempC - 25.0f));
  }

  // Call from loop(). Types enterec / calec / exitec in the Serial Monitor
  // drive the library's built-in 2-point calibration; it recognises the
  // 1413 uS/cm and 12.88 mS/cm standards on its own.
  void serviceCalibration(float voltageMv, float tempC) {
    _ec.calibration(voltageMv, tempC);
  }

  bool adcOk() const { return _adcOk; }
  bool overRange(float ec25) const { return ec25 >= EC_SENSOR_MAX_MS * 0.95f; }

 private:
  int32_t readRaw() {
#ifdef USE_ADS1115
    return _ads.readADC_SingleEnded(ADS1115_CHAN);
#else
    return analogRead(PIN_EC_ADC);
#endif
  }

  float rawToMillivolts(int32_t raw) {
#ifdef USE_ADS1115
    return _ads.computeVolts((int16_t)raw) * 1000.0f;
#else
    return ((float)raw / ADC_MAX_COUNTS) * ADC_REF_MV;
#endif
  }

  DFRobot_ESP_EC _ec;
  bool _adcOk = false;

#ifdef USE_ADS1115
  Adafruit_ADS1115 _ads;
#endif
};
