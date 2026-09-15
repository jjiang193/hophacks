# Wiring

## Pin map

| Part | Signal | ESP32 pin | Notes |
|---|---|---|---|
| DS18B20 | data (yellow) | **GPIO4** | 4.7 kΩ pull-up to 3.3 V — without it you get -127 °C |
| DS18B20 | Vcc (red) | 3.3 V | |
| DS18B20 | GND (black) | GND | |
| Gravity EC V2 | analog out | **GPIO35** | see the ADC2 warning below |
| Gravity EC V2 | V+ | **3.3 V** | see the voltage warning below |
| Gravity EC V2 | GND | GND | |
| MPU-6050 | SDA | GPIO21 | I²C address 0x68 (0x69 with AD0 high) |
| MPU-6050 | SCL | GPIO22 | |
| ADS1115 *(optional)* | SDA / SCL | GPIO21 / GPIO22 | shares the bus, address 0x48 |

## Three things that will bite you

### 1. ADC2 does not work while WiFi is on

The ESP32 has two ADCs, and **ADC2 is claimed by the WiFi radio.** `analogRead()`
on an ADC2 pin returns garbage or blocks whenever WiFi is active. Since this
project streams telemetry over WiFi, ADC2 is permanently unavailable.

**Use an ADC1 pin: GPIO 32–39.** The firmware defaults to GPIO35, which is also
input-only, so there is no way to accidentally drive it.

This one costs people hours because the symptom — EC readings that were fine on
the bench and go insane once the network comes up — looks like a sensor fault.

### 2. Power the EC board from 3.3 V, not 5 V

The Gravity EC V2 accepts 3.3–5 V. Driven at 5 V its analog output can swing
above 3.3 V, which is over the ESP32's absolute maximum on an input pin. Either
power it at 3.3 V (simplest) or add a divider. Do not connect a 5 V-powered
board's output straight to a GPIO.

### 3. Check the EC probe's temperature rating before you dunk it

The DS18B20 is happy to 125 °C. **The EC probe is not.** Confirm the maximum
operating temperature on the [DFR0300 wiki](https://wiki.dfrobot.com/dfr0300/)
before putting it in soup straight off the stove — the plastic-bodied K=1 probes
are typically rated well below boiling.

If it is rated below serving temperature, that is not a project-killer. Measure
at eating temperature instead, which is the more honest use case anyway: nobody
eats 90 °C soup, and the sodium number is about what you consume.

## Sanity checks before writing any code

1. **I²C scan** — an `i2c_scanner` sketch should report 0x68 (MPU-6050) and,
   if fitted, 0x48 (ADS1115). Nothing found means a wiring or power fault.
2. **DS18B20 alone** — the Random Nerd Tutorials sketch should report room
   temperature. `-127` means the pull-up resistor is missing or the data line is
   on the wrong pin.
3. **EC in air** — should read near 0 mS/cm. A large nonzero reading in air means
   the probe is still wet or the analog line is floating.

Do these three before flashing `spoon.ino`. Debugging three sensors at once is
much harder than debugging them one at a time.
