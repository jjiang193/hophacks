#pragma once
#include <Arduino.h>
#include <math.h>
#include "config.h"

// ---------------------------------------------------------------------------
// The MPU-6050's job: decide which EC readings are allowed to count.
//
// A probe being swirled through soup reads turbulence and bubbles, not
// salinity. This class watches the gyroscope, waits for the spoon to settle,
// and only then declares a sample trustworthy.
// ---------------------------------------------------------------------------

enum MotionState { MOTION_UNKNOWN, MOTION_STILL, MOTION_MOVING, MOTION_STIRRING };

class MotionGate {
 public:
  void update(float gx, float gy, float gz) {
    float mag = sqrtf(gx * gx + gy * gy + gz * gz);
    _gyroMag = mag;

    if (mag > GYRO_STIR_THRESHOLD) {
      _state = MOTION_STIRRING;
      _stillCount = 0;
    } else if (mag > GYRO_STILL_THRESHOLD) {
      _state = MOTION_MOVING;
      _stillCount = 0;
    } else {
      _state = MOTION_STILL;
      if (_stillCount < STILL_SAMPLES_REQUIRED) _stillCount++;
    }
  }

  bool settled() const { return _stillCount >= STILL_SAMPLES_REQUIRED; }
  MotionState state() const { return _state; }
  float gyroMagnitude() const { return _gyroMag; }

  const char* stateName() const {
    switch (_state) {
      case MOTION_STILL:    return "still";
      case MOTION_MOVING:   return "moving";
      case MOTION_STIRRING: return "stirring";
      default:              return "unknown";
    }
  }

  // How settled are we, as a 0..1 ramp rather than a cliff edge? A cliff makes
  // the dashboard's quality bar flicker at the threshold.
  float settleFraction() const {
    return (float)_stillCount / (float)STILL_SAMPLES_REQUIRED;
  }

 private:
  MotionState _state = MOTION_UNKNOWN;
  int   _stillCount  = 0;
  float _gyroMag     = 0.0f;
};

// ---------------------------------------------------------------------------
// Rolling stability of the EC signal itself. Even a perfectly still spoon in a
// settling soup drifts; this catches that.
// ---------------------------------------------------------------------------
class StabilityWindow {
 public:
  void push(float v) {
    _buf[_idx] = v;
    _idx = (_idx + 1) % WINDOW;
    if (_count < WINDOW) _count++;
  }

  float stdDev() const {
    if (_count < 2) return INFINITY;
    float mean = 0.0f;
    for (int i = 0; i < _count; i++) mean += _buf[i];
    mean /= _count;
    float ss = 0.0f;
    for (int i = 0; i < _count; i++) ss += (_buf[i] - mean) * (_buf[i] - mean);
    return sqrtf(ss / (_count - 1));
  }

  bool ready() const { return _count >= WINDOW; }
  void reset() { _count = 0; _idx = 0; }

 private:
  static const int WINDOW = 10;
  float _buf[WINDOW];
  int   _idx   = 0;
  int   _count = 0;
};
