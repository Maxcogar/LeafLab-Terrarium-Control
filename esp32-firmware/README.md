# Terrarium Controller Firmware

ESP32 WROOM-based controller for tropical carnivorous plant terrariums. Monitors environmental conditions and controls climate systems automatically, while reporting telemetry to LeafLab.

## Hardware

### Microcontroller

- **ESP32 WROOM** on Freenove Universal Breakout Board

### Sensors

| Sensor                        | Interface  | Purpose                           |
| ----------------------------- | ---------- | --------------------------------- |
| SHT31-D                       | I2C (0x44) | Air temperature & humidity        |
| VEML7700                      | I2C (0x10) | Light level (lux)                 |
| DS18B20                       | 1-Wire     | Soil temperature                  |
| Capacitive Soil Moisture (x2) | Analog     | Soil moisture levels              |
| TDS Meter                     | Analog     | Water quality (local only)        |
| pH Sensor                     | Analog     | Water acidity (local only)        |
| NTC Thermistor                | Analog     | Heater plate temperature feedback |

### Outputs

| Device                          | Control Method | Purpose                       |
| ------------------------------- | -------------- | ----------------------------- |
| Circulation Fans (x2, parallel) | MOSFET + PWM   | Air circulation / ventilation |
| Heating Plate                   | MOSFET + PWM   | Substrate heating             |
| SG90 Servos (x2)                | PWM direct     | Vent flaps (0-40°)            |
| Grow Lights                     | SSR (on/off)   | 12-hour light cycle           |
| Water Pump                      | SSR (on/off)   | Automated watering            |
| Humidifier Modules (x2)         | SSR (on/off)   | Humidity control              |

### Wiring

#### MOSFET Circuit (IRLZ44N) - For Fans & Heater

```
ESP32 GPIO → 100-220Ω resistor → Gate
Gate → 10kΩ resistor → GND (pull-down)
Source → GND
Drain → Load negative
Load positive → 12V
```

The pull-down resistor keeps outputs off during ESP32 boot when GPIOs float.

## Pin Assignments

```
I2C:
  GPIO21 → SDA (SHT31-D, VEML7700)
  GPIO22 → SCL

1-Wire:
  GPIO4  → DS18B20 soil temp

Analog Inputs (ADC1 only - ADC2 conflicts with WiFi):
  GPIO32 → Soil moisture 1
  GPIO33 → Soil moisture 2
  GPIO34 → TDS meter
  GPIO35 → pH sensor
  GPIO36 → Heater thermistor

PWM Outputs:
  GPIO16 → Fans (MOSFET)
  GPIO17 → Heater (MOSFET)
  GPIO18 → Servo 1 (vent)
  GPIO19 → Servo 2 (vent)

SSR Outputs:
  GPIO23 → Grow lights
  GPIO25 → Water pump
  GPIO26 → Humidifier 1
  GPIO27 → Humidifier 2
```

## Control Logic

### Heater (Soil Temperature)

- **Target:** 24°C (75°F)
- **Deadband:** ±1°C
- Turns ON when soil temp drops below 23°C
- Turns OFF when soil temp rises above 25°C

### Fan & Vent System

The terrarium has two fan modules on top, each with a fan and servo-controlled flap.

**Normal Mode (Recirculation):**

- Fans run at 60% speed (PWM 150)
- Flaps closed (servo 0°)
- Air circulates internally through U-shaped path

**Vent Mode (Air Exchange):**

- Fans run at 80% speed (PWM 200)
- Flaps open (servo 40°)
- One module pulls in outside air, other exhausts

**Triggers:**

- Enter vent mode when: Air temp > 27°C (80°F) OR Humidity > 85%
- Exit vent mode when: Air temp < 25.5°C (78°F) AND Humidity < 83%

The hysteresis prevents rapid on/off cycling.

### Humidifiers

- **Target range:** 80-85%
- Turn ON when humidity drops below 80%
- Turn OFF when humidity rises above 85%
- Maintain current state in the 80-85% deadband

### Water Pump

- Uses average of both soil moisture sensors
- **Turn ON:** When moisture ≤ 40%
- **Turn OFF:** When moisture ≥ 80%
- Hysteresis prevents short cycling

### Grow Lights

- **Schedule:** 7:00 AM to 7:00 PM (12 hours)
- Uses NTP for accurate timekeeping
- Falls back to manual control if NTP sync fails

## LeafLab Integration

The controller publishes telemetry to LeafLab via MQTT using the standard topic format:

```
Topic: leaflab/telemetry/{MAC_ADDRESS}/{sensor_type}

Payload:
{
  "mac": "AA:BB:CC:DD:EE:FF",
  "probeIndex": 0,
  "sensorType": "soil_moisture",
  "value": 2450,
  "timestamp": "2024-12-10T14:30:00Z"
}
```

### Sensors Published to LeafLab

| Probe Index | Sensor Type   | Source              |
| ----------- | ------------- | ------------------- |
| 0           | soil_moisture | Capacitive sensor 1 |
| 1           | soil_moisture | Capacitive sensor 2 |
| 2           | temperature   | SHT31-D (air)       |
| 3           | humidity      | SHT31-D (air)       |
| 4           | light         | VEML7700            |

### Local-Only Sensors (Not Published)

- Soil temperature (DS18B20) - used for heater control
- TDS meter - water quality monitoring
- pH sensor - water acidity monitoring
- Heater thermistor - safety feedback

## Configuration

All setpoints are defined in `config.h`:

```cpp
// Temperature & Humidity
HEATER_TARGET_TEMP    24.0   // Soil temp target (°C)
HUMIDITY_TARGET_LOW   80.0   // Humidifiers ON below this
HUMIDITY_TARGET_HIGH  85.0   // Vent mode above this
TEMP_VENT_TRIGGER     27.0   // Open vents above this (°C)

// Fan Speeds (0-255)
FAN_SPEED_CIRCULATION 150    // Normal mode
FAN_SPEED_VENT        200    // Vent mode

// Pump Thresholds (%)
SOIL_MOISTURE_LOW     40     // Pump ON
SOIL_MOISTURE_HIGH    80     // Pump OFF

// Light Schedule
LIGHTS_ON_HOUR        7      // 7:00 AM
LIGHTS_OFF_HOUR       19     // 7:00 PM

// Timezone
GMT_OFFSET_SEC        -18000 // EST (UTC-5)
DAYLIGHT_OFFSET_SEC   3600   // DST adjustment
```

## Setup

### 1. Install PlatformIO

Install [PlatformIO](https://platformio.org/) in VS Code or as CLI.

### 2. Configure DS18B20 Address

Run the discovery sketch to find your DS18B20's unique address:

```bash
pio run -e discovery -t upload
pio device monitor
```

Copy the address and update `config.h`:

```cpp
DeviceAddress soilTempAddress = { 0x28, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX, 0xXX };
```

### 3. Configure Network

Update `config.h` with your MQTT broker:

```cpp
#define MQTT_SERVER "192.168.1.100"
#define MQTT_PORT 1883
```

### 4. Set Timezone

Adjust `GMT_OFFSET_SEC` for your location:

- EST (UTC-5): -18000
- CST (UTC-6): -21600
- MST (UTC-7): -25200
- PST (UTC-8): -28800

### 5. Upload Firmware

```bash
pio run -t upload
pio device monitor
```

### 6. WiFi Provisioning

On first boot (or if no credentials saved), the ESP32 enters BLE provisioning mode:

1. Device advertises as "Terrarium-Setup-XXXX"
2. Connect with a BLE app (e.g., nRF Connect)
3. Write SSID to characteristic `beb5483e-36e1-4688-b7f5-ea07361b26a8`
4. Write password to characteristic `1099e769-1215-4945-8122-345291f938fb`
5. Device saves credentials and reboots

## Calibration

### Soil Moisture Sensors

The default values in `config.h` are estimates. Calibrate by:

1. Read sensor in completely dry soil → `SOIL_MOISTURE_DRY`
2. Read sensor in saturated soil → `SOIL_MOISTURE_WET`

```cpp
#define SOIL_MOISTURE_DRY 4095   // Raw ADC when dry
#define SOIL_MOISTURE_WET 1500   // Raw ADC when wet
```

### Thermistor

If using a different NTC thermistor, update:

```cpp
#define THERMISTOR_NOMINAL 10000        // Resistance at 25°C
#define THERMISTOR_B_COEFFICIENT 3950   // B value from datasheet
#define THERMISTOR_SERIES_RESISTOR 10000 // Your voltage divider resistor
```

## Serial Output

The controller logs status every 10 seconds:

```
=== Terrarium Controller Starting ===
Device ID: A1B2C3D4E5F6
MAC Address: AA:BB:CC:DD:EE:FF
Initializing pins...
Initializing sensors...
SHT31 initialized.
VEML7700 initialized.
DS18B20 initialized.
Initializing outputs...
WiFi credentials loaded from NVS.
--- Connecting to WiFi ---
Connected! IP: 192.168.1.50
Initializing NTP...
NTP synced: 2024-12-10 14:30:00
MQTT connected!
=== Setup Complete ===

--- Reading Sensors ---
Soil Moisture 1: 2450
Soil Moisture 2: 2380
Air Temp: 25.50 C
Air Humidity: 82.30 %
Light: 1250.00 lux
Soil Temp: 23.80 C
TDS: 520
pH: 2100
Heater Temp: 24.20 C
--- Sensors Read ---

--- Running Control Logic ---
State: Heater=255 Fan=150 Vents=CLOSED Humid=ON Pump=OFF Lights=ON
Publishing telemetry...
Telemetry published.
```

## Troubleshooting

### Sensor Not Found

- Check I2C wiring (SDA/SCL)
- Verify I2C address matches `config.h`
- Use I2C scanner sketch to detect devices

### NTP Sync Failed

- Ensure WiFi is connected
- Check firewall allows UDP port 123
- Lights will not auto-switch until time syncs

### MQTT Not Connecting

- Verify broker IP and port
- Check broker is running and accepting connections
- Review credentials if authentication required

### Outputs Not Working

- Check MOSFET wiring (gate resistor, pull-down)
- Verify 12V supply for fans/heater
- Test SSR with multimeter

## Files

```
firmware-terrarium/
├── platformio.ini          # Build configuration
├── README.md               # This file
└── src/
    ├── config.h            # Pin mappings & setpoints
    └── main.cpp            # Main firmware
```

## Dependencies

Managed by PlatformIO:

- PubSubClient (MQTT)
- OneWire + DallasTemperature (DS18B20)
- ArduinoJson
- Adafruit SHT31 Library
- Adafruit VEML7700 Library
- ESP32Servo
