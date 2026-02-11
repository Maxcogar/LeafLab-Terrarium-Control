#pragma once

// -- FIRMWARE VERSION --
#define FIRMWARE_VERSION "1.1.0"

// -- CONTROL CONFIGURATION --
#define OVERRIDE_TIMEOUT_MS 300000 // 5 minutes auto-release

// -- PINOUT CONFIGURATION --

// I2C Pins (SHT31-D, VEML7700)
#define PIN_I2C_SDA 21
#define PIN_I2C_SCL 22

// 1-Wire Bus (DS18B20 soil temp)
#define PIN_ONE_WIRE_BUS 4

// ADC Inputs (use ADC1 pins only - ADC2 conflicts with WiFi)
#define PIN_SOIL_MOISTURE_1 32
#define PIN_SOIL_MOISTURE_2 33
#define PIN_TDS 34
#define PIN_PH 35
#define PIN_HEATER_THERMISTOR 36

// PWM Outputs (MOSFET controlled)
#define PIN_FANS 16
#define PIN_HEATER 17

// Servo Outputs (direct PWM)
#define PIN_SERVO_VENT_1 18
#define PIN_SERVO_VENT_2 19

// SSR Outputs (digital on/off)
#define PIN_GROW_LIGHTS 23
#define PIN_WATER_PUMP 25
#define PIN_HUMIDIFIER_1 26
#define PIN_HUMIDIFIER_2 27

// -- NETWORK & MQTT CONFIGURATION --

#define MQTT_SERVER "104.197.45.54"
#define MQTT_PORT 8883
#define MQTT_BASE_TOPIC "leaflab"

// -- MQTT TLS CONFIGURATION --
#define MQTT_USE_TLS true

// -- MQTT AUTHENTICATION --
#define MQTT_USERNAME "leaflab_esp32"
#define MQTT_PASSWORD "leaflab-terrarium-esp32"

// Root CA Certificate (from broker VM: leaflab-mqtt-prod)
// Retrieved from: sudo cat /etc/mosquitto/ca.pem
// REGENERATED: 2025-12-25 (with IP SAN support)
const char *MQTT_CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFFTCCAv2gAwIBAgIUHkKRsj0qtLjFlWRXG7HAUc8xfiEwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPTGVhZkxhYiBNUVRUIENBMB4XDTI1MTIyNTA0MDI0OFoX
DTMwMTIyNDA0MDI0OFowGjEYMBYGA1UEAwwPTGVhZkxhYiBNUVRUIENBMIICIjAN
BgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAgQy0OUzILdLVnJFAn25lHYr/K3F3
eRyeNWL4VBzy4eTW5YgcZe5NJHmXG51nQr84BkJqe7/I1kMYXebqiOYs+ufvRV/9
4K0bDWkC28mAlSKxmUGfNHJ2jsS+cuGloSek2JyZ/0wdZ9jhFyxInYkjfp48yYtm
XBluN3yfDqxURbTMfCiueZzhR1BqAboIGMENfk7Ih4s9rDSrGK55EFqdMVIsXh9m
Yn9cVleZcw9UzMhRv9uAFJHCjHUwirtGdKIGjLdrHGljOtfJv/i7Ai5pLnKn10he
ArAyf8Yub68yN0W2ZNEndlScC/ZmtgLjKD4KV25DuNnlQruaAXjGUdxVZPVcO45w
TJ9sxoIHJM4jpWkuFfx14VSVXQrvLSg99LBIOSf+UgrVRgqMDd+hLvHqYe5Xae9T
h8S8yzDooQzjfHTu4C6jwkve4e/Z7yygPg7ld9tJAF0E2Md4yhin06wFQ+9MKUnC
kGBNeVWNeobwvaofqXI8txw7+wTFtmYg7znLzu0LrcsvP9D7hHKcSkN1VkrO2XD/
bdFcEerr3TD9j95SsMmWETdXjfWbGEarLi4FH/DBiSdIHuKd0U7lgKL6r6dCcm+6
U6cbI6zAbxhGHUiduFzbOk75NZH0F8OoxT7HpCjXRMJhA0hb3k4oGFAHkPPXSIrM
Dn9N8R2KvTL4X7UCAwEAAaNTMFEwHQYDVR0OBBYEFJQ06cs9QxkfPH45FcKTHAK4
kZXNMB8GA1UdIwQYMBaAFJQ06cs9QxkfPH45FcKTHAK4kZXNMA8GA1UdEwEB/wQF
MAMBAf8wDQYJKoZIhvcNAQELBQADggIBACWLE+RKhBE3P0aTiWs6Y2Nfq8mAdg58
BgEfGPvHr5EQlMpXZy9YYCTsPKgPf0CqmMxHPl2ao5vFobYuz0utz9xGPs3u180h
6tM4aeJdmzcyoM7/IXTwt29H+qrxHQrI/INy3E11ma08HzE0JzNF7sEKEPARsXj3
DKmh+FZCdfaCmPMY+ZUTiy7rNe5xFMAJVAjAAipZ48jaOPJQO1xinPqnm33A0pVy
6sbwOoEnNNeDXl6Pe3+PqTOH2WZzsVQW/MU162r84OlPK/tTVWhLYPAUiJicvomE
q4zD/EQ7Tjo4qiGKGLOgDzfWFjIg2tTf7aFjcx+bj1UzAUVfybgBwAE/nKJ44SSb
QJH8zqDkPffF/KyIMD23sT02zMYdEGDFyATvBKqXfaGfnsDxiCIcqPrhSa58Gjp6
O1qno5GdmNnx1kQaqLnHsT1i0ZhV26ZxURxrCcVbWj2lupR9SfD24BIGBeOY5JPw
i4Py8gfP0/Enz+jwEp1nhZdDMjIFR56734LpgBiHQiet75D3RAUJnGr/1eM009rv
C91gfpbiPneUT71PB89INhlnF6kCaEDz0nt5DjiPkCMpyyhSHyfWbAKL80os7XME
ubDU65Bvsu32/rDq6m1D6QECO2Jm0gDXqgO2J6tNJMEFKW3hmsh1quzX4UeGrcUD
o5pppVidjn6B
-----END CERTIFICATE-----
)EOF";

// -- BLE PROVISIONING CONFIGURATION --
#define BLE_DEVICE_NAME_PREFIX "Terrarium-Setup"
#define BLE_SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHAR_SSID_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define BLE_CHAR_PASSWORD_UUID "1099e769-1215-4945-8122-345291f938fb"

// -- NVS CONFIGURATION --
#define NVS_NAMESPACE "wifi_creds"
#define NVS_KEY_SSID "ssid"
#define NVS_KEY_PASSWORD "password"

// -- CONNECTION SETTINGS --
#define WIFI_CONNECTION_RETRIES 3
#define WIFI_CONNECTION_RETRY_DELAY_MS 5000
#define MQTT_CONNECTION_RETRIES 3
#define MQTT_CONNECTION_RETRY_DELAY_MS 5000

// -- I2C ADDRESSES --
#define SHT31_ADDRESS 0x44
#define VEML7700_ADDRESS 0x10

// -- SENSOR CALIBRATION --
// Soil moisture (raw ADC values - calibrate with your sensors)
#define SOIL_MOISTURE_DRY 4095
#define SOIL_MOISTURE_WET 1500

// pH sensor calibration (adjust after calibration)
#define PH_OFFSET 0.0
#define PH_SLOPE 1.0

// TDS calibration
#define TDS_FACTOR 0.5

// Thermistor (NTC 10K - adjust if different)
#define THERMISTOR_NOMINAL 10000
#define THERMISTOR_B_COEFFICIENT 3950
#define THERMISTOR_SERIES_RESISTOR 10000

// -- PWM CONFIGURATION --
#define PWM_FREQUENCY 25000
#define PWM_RESOLUTION 8 // 0-255

// -- SERVO CONFIGURATION --
#define SERVO_MIN_US 500
#define SERVO_MAX_US 2400
#define SERVO_CLOSED 0
#define SERVO_OPEN 40

// -- CONTROL SETPOINTS (all temperatures in Fahrenheit) --

// Heater (soil temperature)
#define HEATER_TARGET_TEMP 80.0 // Target soil temp in °F
#define HEATER_HYSTERESIS 2.0   // +/- 2°F deadband

// Humidity (air)
#define HUMIDITY_TARGET_LOW 80.0  // Turn humidifiers ON below this
#define HUMIDITY_TARGET_HIGH 85.0 // Trigger vent mode above this
#define HUMIDITY_RETURN 83.0      // Return to normal below this

// Temperature vent trigger (air)
#define TEMP_VENT_TRIGGER 80.0 // Open vents above this (°F)
#define TEMP_VENT_RETURN 78.0  // Close vents below this (°F)

// Fan speeds (0-255)
#define FAN_SPEED_CIRCULATION 150 // Normal recirculation speed
#define FAN_SPEED_VENT 200        // Vent mode speed

// Soil moisture (pump control)
#define SOIL_MOISTURE_LOW 40  // Turn pump ON at or below this %
#define SOIL_MOISTURE_HIGH 80 // Turn pump OFF at or above this %

// Grow lights schedule
#define LIGHTS_ON_HOUR 7   // 7:00 AM
#define LIGHTS_OFF_HOUR 19 // 7:00 PM (12 hours)

// NTP Configuration
#define NTP_SERVER "pool.ntp.org"
#define GMT_OFFSET_SEC -18000    // EST (UTC-5) - adjust for your timezone
#define DAYLIGHT_OFFSET_SEC 3600 // DST offset

// -- DS18B20 CONFIGURATION --
// Address will be auto-discovered at runtime
