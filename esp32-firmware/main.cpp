#include "config.h"
#include "nvs.h"
#include "nvs_flash.h"
#include <Adafruit_SHT31.h>
#include <Adafruit_VEML7700.h>
#include <Arduino.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <DallasTemperature.h>
#include <ESP32Servo.h>
#include <OneWire.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>
#include <esp_task_wdt.h>
#include <time.h>

// -- Timing --
#define LOOP_INTERVAL_MS 10000 // 10 seconds

// -- Serial Protocol --
#define DBG(msg) Serial.printf("DBG: %s\n", msg)
#define DBGF(fmt, ...) Serial.printf("DBG: " fmt "\n", ##__VA_ARGS__)

// -- Data Structures --
struct SensorData {
  // Sensors sent to LeafLab
  int soilMoisture1;
  int soilMoisture2;
  float airTemp;
  float airHumidity;
  float lightLux;

  // Local-only sensors
  float soilTemp;
  int tds;
  int ph;
  float heaterTemp;

  // Validity flags
  bool soilMoisture1Ok;
  bool soilMoisture2Ok;
  bool airTempOk;
  bool airHumidityOk;
  bool lightOk;
  bool soilTempOk;
  bool tdsOk;
  bool phOk;
  bool heaterTempOk;
};

struct OutputState {
  uint8_t fanSpeed;    // 0-255 PWM
  uint8_t heaterPower; // 0-255 PWM
  uint8_t servo1Angle; // 0-180 degrees
  uint8_t servo2Angle; // 0-180 degrees
  bool growLights;
  bool waterPump;
  bool humidifier1;
  bool humidifier2;
};

// -- Global Objects --
OneWire oneWire(PIN_ONE_WIRE_BUS);
DallasTemperature soilTempSensor(&oneWire);
Adafruit_SHT31 sht31 = Adafruit_SHT31();
Adafruit_VEML7700 veml = Adafruit_VEML7700();
Servo servo1;
Servo servo2;

WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);

SensorData sensors;
OutputState outputs;

String deviceId = "";
String macAddress = "";
std::string wifiSsid;
std::string wifiPassword;
unsigned long lastLoopTime = 0;
bool ventMode = false;    // Current vent state
bool pumpRunning = false; // Track pump state for hysteresis
bool ntpSynced = false;   // NTP sync status

// Sensor availability flags (prevents crashes when sensors missing)
bool sht31Available = false;
bool veml7700Available = false;

// Statistics tracking
unsigned long bootTime = 0;
unsigned long mqttLastPublish = 0;
unsigned long mqttSuccessCount = 0;
unsigned long mqttFailCount = 0;
unsigned long controlLoopCount = 0;
int i2cDevicesFound = 0;

// Manual override
bool manualOverrideActive = false;
unsigned long manualOverrideStartTime = 0;
OutputState manualOverrides;

unsigned long lastMqttReconnectAttempt = 0;

// DS18B20 split-phase state machine (runs in loop, not readAllSensors)
static unsigned long ds18b20RequestTime = 0;
static bool ds18b20Requested = false;
static float ds18b20LastReading = DEVICE_DISCONNECTED_F;
static bool ds18b20LastOk = false;
char serialInputBuffer[512];
int serialInputIdx = 0;

// -- Function Prototypes --
void initializePins();
void initializeSensors();
void initializeOutputs();
void readAllSensors();
void updateOutputs();
void connectToWifi();
bool connectToMqtt();
void publishTelemetry();
bool publishSensorReading(int probeIndex, const char *sensorType, float value);
String getDeviceId();
String getMacAddress();
bool loadWifiCredentials();
void saveWifiCredentials(const std::string &ssid, const std::string &password);
void startBleProvisioning();
float readThermistor(int pin);
void runControlLogic();
void initializeNTP();
int getCurrentHour();
String getISOTimestamp();
float convertToMoisturePercent(int raw);
void configureTLS();
void publishStatus(const char *status);
void checkSerialCommands();
void serialPublishTelemetry();

/**
 * Configure WiFiClientSecure for TLS connection
 */
void configureTLS() {
  // Set the CA certificate for server verification
  wifiClient.setCACert(MQTT_CA_CERT);

  // Optional: For debugging, you can disable certificate verification
  // wifiClient.setInsecure(); // DON'T USE IN PRODUCTION!

  DBG("TLS configured with CA certificate");
}

// -- Setup --
void setup() {
  Serial.begin(115200);
  while (!Serial) {
    delay(10);
  }

  DBG("\n=== Terrarium Controller Starting ===");

  // Initialize NVS
  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES ||
      ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ret = nvs_flash_init();
  }
  ESP_ERROR_CHECK(ret);

  // Get device identifiers
  deviceId = getDeviceId();
  macAddress = getMacAddress();
  DBGF("Device ID: %s", deviceId.c_str());
  DBGF("MAC Address: %s", macAddress.c_str());

  // Initialize hardware
  initializePins();
  initializeSensors();
  initializeOutputs();

  // Check for WiFi credentials
  if (!loadWifiCredentials()) {
    // TEMPORARY: Hardcode WiFi credentials for testing
    // TODO: Remove this and restore BLE provisioning before production
    // deployment
    DBG("No saved credentials, using hardcoded WiFi");

    // ⚠️ SECURITY WARNING: Replace these with your actual WiFi credentials
    // ⚠️ DO NOT commit these credentials to version control
    wifiSsid = "AJA-G";
    wifiPassword = "@CardinalBurg25";

    saveWifiCredentials(wifiSsid, wifiPassword);
    DBG("WiFi credentials saved, rebooting...");
    ESP.restart();
  }

  // Connect to WiFi (STA mode)
  configureTLS();
  connectToWifi();

  // Initialize NTP (configTime sets SNTP params, doesn't need active
  // connection)
  initializeNTP();

  // Start Internet-dependent services if Station connected
  if (WiFi.status() == WL_CONNECTED) {
    connectToMqtt();
  } else {
    DBG("Running in Offline Mode");
  }

  bootTime = millis();
  DBG("Terrarium controller started");

  // Hardware watchdog (30s timeout)
  // Increased to 30s to allow for MQTT connection timeout (15s) without
  // rebooting
esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 30000,
    .idle_core_mask = (1 << 0),
    .trigger_panic = true
};
esp_task_wdt_init(&wdt_config);
esp_task_wdt_add(NULL);

  DBG("Watchdog enabled (30s)");

  DBG("=== Setup Complete ===\n");
}

// -- Main Loop --
void loop() {
  esp_task_wdt_reset();
  unsigned long now = millis();

  // Process serial commands from RPi companion
  checkSerialCommands();

  // WiFi reconnect with backoff
  static unsigned long lastWifiCheck = 0;
  if (WiFi.status() != WL_CONNECTED && (now - lastWifiCheck > 30000)) {
    lastWifiCheck = now;
    DBG("WiFi disconnected, attempting reconnect...");
    WiFi.reconnect();
  }

  // Check NTP sync status
  if (!ntpSynced) {
    struct tm timeinfo;
    if (getLocalTime(&timeinfo, 0)) { // 0 = non-blocking
      ntpSynced = true;
      DBGF("NTP synced: %04d-%02d-%02d %02d:%02d", timeinfo.tm_year + 1900,
           timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour,
           timeinfo.tm_min);
    }
  }

  // Maintain MQTT connection (Non-blocking retry) - Only if Station is
  // connected
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      if (now - lastMqttReconnectAttempt > 5000) {
        lastMqttReconnectAttempt = now;
        if (connectToMqtt()) {
          lastMqttReconnectAttempt = 0;
        }
      }
    }
    mqttClient.loop();
  }

  // Check manual override timeout
  if (manualOverrideActive &&
      (millis() - manualOverrideStartTime > OVERRIDE_TIMEOUT_MS)) {
    manualOverrideActive = false;
    manualOverrideStartTime = 0;
    DBG("Manual override timed out");
  }

  // DS18B20 split-phase non-blocking read (runs every loop iteration)
  if (!ds18b20Requested) {
    soilTempSensor.requestTemperatures();
    ds18b20RequestTime = millis();
    ds18b20Requested = true;
  } else if (millis() - ds18b20RequestTime > 800) {
    float temp = soilTempSensor.getTempFByIndex(0);
    ds18b20LastOk = (temp != DEVICE_DISCONNECTED_F);
    if (ds18b20LastOk) {
      ds18b20LastReading = temp;
    }
    ds18b20Requested = false;
  }

  // Run sensor/publish cycle every LOOP_INTERVAL_MS
  if (now - lastLoopTime >= LOOP_INTERVAL_MS) {
    lastLoopTime = now;

    readAllSensors();
    runControlLogic();
    updateOutputs();

    // Broadcast telemetry to RPi companion via Serial
    serialPublishTelemetry();

    DBGF("[HEARTBEAT] Loop running. Free Heap: %d bytes", ESP.getFreeHeap());

    if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
      publishTelemetry();
    }
  }
}

// -- Initialization Functions --
void initializePins() {
  DBG("Initializing pins...");

  // ADC inputs (no pinMode needed for analog)

  // PWM outputs
  pinMode(PIN_FANS, OUTPUT);
  pinMode(PIN_HEATER, OUTPUT);

  // SSR outputs
  pinMode(PIN_GROW_LIGHTS, OUTPUT);
  pinMode(PIN_WATER_PUMP, OUTPUT);
  pinMode(PIN_HUMIDIFIER_1, OUTPUT);
  pinMode(PIN_HUMIDIFIER_2, OUTPUT);

  // Set initial states (all off)
  digitalWrite(PIN_GROW_LIGHTS, LOW);
  digitalWrite(PIN_WATER_PUMP, LOW);
  digitalWrite(PIN_HUMIDIFIER_1, LOW);
  digitalWrite(PIN_HUMIDIFIER_2, LOW);
  analogWrite(PIN_FANS, 0);
  analogWrite(PIN_HEATER, 0);

  DBG("Pins initialized.");
}

void initializeSensors() {
  DBG("Initializing sensors...");

  // I2C - Standard initialization without manual pinMode
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000); // Enforce 100kHz for compatibility
  Wire.setTimeOut(100);  // 100ms timeout for I2C operations
  delay(100);            // Allow bus to stabilize

  // I2C Scanner - diagnose what's connected
  DBG("Scanning I2C bus...");
  i2cDevicesFound = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      DBGF("  Found device at 0x%02X", addr);
      i2cDevicesFound++;
    }
  }
  if (i2cDevicesFound == 0) {
    DBG("  NO I2C DEVICES FOUND! Check wiring/pull-ups.");
  } else {
    DBGF("  %d device(s) found.", i2cDevicesFound);
  }

  // SHT31 (air temp/humidity)
  // Try default address 0x44, then fallback to 0x45
  if (sht31.begin(0x44)) {
    DBG("SHT31 initialized at 0x44.");
    sht31Available = true;
  } else if (sht31.begin(0x45)) {
    DBG("SHT31 initialized at 0x45 (fallback).");
    sht31Available = true;
  } else {
    DBG("ERROR: SHT31 not found at 0x44 or 0x45!");
    sht31Available = false;
  }

  // VEML7700 (light)
  if (!veml.begin()) {
    DBG("ERROR: VEML7700 not found!");
    veml7700Available = false;
  } else {
    veml.setGain(VEML7700_GAIN_1);
    veml.setIntegrationTime(VEML7700_IT_100MS);
    DBG("VEML7700 initialized.");
    veml7700Available = true;
  }

  // DS18B20 (soil temp) - auto-discover first sensor on bus
  soilTempSensor.begin();
  soilTempSensor.setWaitForConversion(false);
  int ds18b20Count = soilTempSensor.getDeviceCount();
  if (ds18b20Count > 0) {
    soilTempSensor.setResolution(12);
    DBGF("DS18B20 initialized (%d sensor(s) found).", ds18b20Count);
  } else {
    DBG("WARNING: No DS18B20 sensors found on OneWire bus!");
  }

  DBG("Sensors initialized.");
}

void initializeOutputs() {
  DBG("Initializing outputs...");

  // Servos
  servo1.attach(PIN_SERVO_VENT_1, SERVO_MIN_US, SERVO_MAX_US);
  servo2.attach(PIN_SERVO_VENT_2, SERVO_MIN_US, SERVO_MAX_US);
  servo1.write(0);
  servo2.write(0);

  // Initialize output state
  outputs.fanSpeed = 0;
  outputs.heaterPower = 0;
  outputs.servo1Angle = 0;
  outputs.servo2Angle = 0;
  outputs.growLights = false;
  outputs.waterPump = false;
  outputs.humidifier1 = false;
  outputs.humidifier2 = false;

  DBG("Outputs initialized.");
}

// -- Sensor Reading --
void readAllSensors() {
  DBG("\n--- Reading Sensors ---");

  // Soil moisture 1
  sensors.soilMoisture1 = analogRead(PIN_SOIL_MOISTURE_1);
  sensors.soilMoisture1Ok = (sensors.soilMoisture1 > 0);
  DBGF("Soil Moisture 1: %d", sensors.soilMoisture1);

  // Soil moisture 2
  sensors.soilMoisture2 = analogRead(PIN_SOIL_MOISTURE_2);
  sensors.soilMoisture2Ok = (sensors.soilMoisture2 > 0);
  DBGF("Soil Moisture 2: %d", sensors.soilMoisture2);

  // Air temp/humidity (SHT31) - convert to Fahrenheit
  if (sht31Available) {
    float tempC = sht31.readTemperature();
    sensors.airTemp = (tempC * 9.0 / 5.0) + 32.0; // Convert to °F
    sensors.airHumidity = sht31.readHumidity();
    sensors.airTempOk = !isnan(tempC);
    sensors.airHumidityOk = !isnan(sensors.airHumidity);
    if (sensors.airTempOk)
      DBGF("Air Temp: %.2f F", sensors.airTemp);
    if (sensors.airHumidityOk)
      DBGF("Air Humidity: %.2f %%", sensors.airHumidity);
  } else {
    sensors.airTempOk = false;
    sensors.airHumidityOk = false;
  }

  // Light (VEML7700)
  if (veml7700Available) {
    sensors.lightLux = veml.readLux();
    sensors.lightOk = !isnan(sensors.lightLux);
    if (sensors.lightOk)
      DBGF("Light: %.2f lux", sensors.lightLux);
  } else {
    sensors.lightOk = false;
  }

  // Soil temp (DS18B20) - use latest reading from loop() state machine
  sensors.soilTemp = ds18b20LastReading;
  sensors.soilTempOk = ds18b20LastOk;
  if (sensors.soilTempOk)
    DBGF("Soil Temp: %.2f F", sensors.soilTemp);

  // TDS
  sensors.tds = analogRead(PIN_TDS);
  sensors.tdsOk = (sensors.tds > 0);
  DBGF("TDS: %d", sensors.tds);

  // pH
  sensors.ph = analogRead(PIN_PH);
  sensors.phOk = (sensors.ph > 0);
  DBGF("pH: %d", sensors.ph);

  // Heater thermistor - convert to Fahrenheit
  float heaterTempC = readThermistor(PIN_HEATER_THERMISTOR);
  sensors.heaterTemp = (heaterTempC * 9.0 / 5.0) + 32.0; // Convert to °F
  sensors.heaterTempOk = (heaterTempC > -40 && heaterTempC < 150);
  if (sensors.heaterTempOk)
    DBGF("Heater Temp: %.2f F", sensors.heaterTemp);

  DBG("--- Sensors Read ---\n");
}

float readThermistor(int pin) {
  int raw = analogRead(pin);
  if (raw == 0)
    return -127.0;

  float resistance = THERMISTOR_SERIES_RESISTOR / ((4095.0 / raw) - 1.0);
  float steinhart =
      log(resistance / THERMISTOR_NOMINAL) / THERMISTOR_B_COEFFICIENT;
  steinhart += 1.0 / (25.0 + 273.15);
  steinhart = 1.0 / steinhart;
  steinhart -= 273.15;

  return steinhart;
}

// -- Control Logic --
void runControlLogic() {
  DBG("--- Running Control Logic ---");
  controlLoopCount++;

  // Skip automatic control when manual override is active
  if (manualOverrideActive) {
    DBG("Manual override active - skipping automatic control");
    return;
  }

  // === SAFETY FAILSAFES (run before all control logic) ===

  // Heater thermistor fail → kill heater immediately
  if (!sensors.heaterTempOk) {
    outputs.heaterPower = 0;
    // Log once per transition, not every loop
  }

  // Both soil moisture sensors fail → kill pump
  if (!sensors.soilMoisture1Ok && !sensors.soilMoisture2Ok) {
    outputs.waterPump = false;
    pumpRunning = false;
  }

  // Air sensor fail → close vents, kill humidifiers (passive safe state)
  if (!sensors.airTempOk && !sensors.airHumidityOk) {
    ventMode = false;
    outputs.humidifier1 = false;
    outputs.humidifier2 = false;
  }

  // === HEATER CONTROL (soil temp) ===
  if (sensors.soilTempOk) {
    if (sensors.soilTemp < (HEATER_TARGET_TEMP - HEATER_HYSTERESIS)) {
      outputs.heaterPower = 255; // Full on
    } else if (sensors.soilTemp > (HEATER_TARGET_TEMP + HEATER_HYSTERESIS)) {
      outputs.heaterPower = 0; // Off
    }
    // else: maintain current state (deadband)
  }

  // === VENT MODE LOGIC (temp and humidity) ===
  if (sensors.airTempOk && sensors.airHumidityOk) {
    // Enter vent mode if temp OR humidity too high
    if (!ventMode) {
      if (sensors.airTemp > TEMP_VENT_TRIGGER ||
          sensors.airHumidity > HUMIDITY_TARGET_HIGH) {
        ventMode = true;
        DBG("VENT MODE: ON");
      }
    }
    // Exit vent mode only when BOTH are in acceptable range
    else {
      if (sensors.airTemp < TEMP_VENT_RETURN &&
          sensors.airHumidity < HUMIDITY_RETURN) {
        ventMode = false;
        DBG("VENT MODE: OFF");
      }
    }
  }

  // Apply fan/vent state
  if (ventMode) {
    outputs.fanSpeed = FAN_SPEED_VENT;
    outputs.servo1Angle = SERVO_OPEN;
    outputs.servo2Angle = SERVO_OPEN;
  } else {
    outputs.fanSpeed = FAN_SPEED_CIRCULATION;
    outputs.servo1Angle = SERVO_CLOSED;
    outputs.servo2Angle = SERVO_CLOSED;
  }

  // === HUMIDIFIER CONTROL ===
  if (sensors.airHumidityOk) {
    if (sensors.airHumidity < HUMIDITY_TARGET_LOW) {
      outputs.humidifier1 = true;
      outputs.humidifier2 = true;
    } else if (sensors.airHumidity > HUMIDITY_TARGET_HIGH) {
      outputs.humidifier1 = false;
      outputs.humidifier2 = false;
    }
    // else: maintain current state (deadband between 80-85%)
  }

  // === WATER PUMP CONTROL (soil moisture with hysteresis) ===
  float moisture1Pct = convertToMoisturePercent(sensors.soilMoisture1);
  float moisture2Pct = convertToMoisturePercent(sensors.soilMoisture2);
  float avgMoisture = (moisture1Pct + moisture2Pct) / 2.0;

  if (sensors.soilMoisture1Ok && sensors.soilMoisture2Ok) {
    if (!pumpRunning && avgMoisture <= SOIL_MOISTURE_LOW) {
      pumpRunning = true;
      outputs.waterPump = true;
      DBGF("PUMP ON: Moisture %.1f%% <= %d%%", avgMoisture, SOIL_MOISTURE_LOW);

    } else if (pumpRunning && avgMoisture >= SOIL_MOISTURE_HIGH) {
      pumpRunning = false;
      outputs.waterPump = false;
      DBGF("PUMP OFF: Moisture %.1f%% >= %d%%", avgMoisture,
           SOIL_MOISTURE_HIGH);
    }
  }

  // === GROW LIGHTS SCHEDULE ===
  int hour = getCurrentHour();
  if (hour >= 0) { // Valid time
    bool shouldBeOn = (hour >= LIGHTS_ON_HOUR && hour < LIGHTS_OFF_HOUR);
    if (outputs.growLights != shouldBeOn) {
      outputs.growLights = shouldBeOn;
      DBGF("LIGHTS %s (hour=%d)", shouldBeOn ? "ON" : "OFF", hour);
    }
  }

  DBGF("State: Heater=%d Fan=%d Vents=%s Humid=%s Pump=%s Lights=%s",
       outputs.heaterPower, outputs.fanSpeed, ventMode ? "OPEN" : "CLOSED",
       outputs.humidifier1 ? "ON" : "OFF", outputs.waterPump ? "ON" : "OFF",
       outputs.growLights ? "ON" : "OFF");
}

float convertToMoisturePercent(int raw) {
  // Convert raw ADC to percentage (calibrate these values)
  float pct = 100.0 * (SOIL_MOISTURE_DRY - raw) /
              (SOIL_MOISTURE_DRY - SOIL_MOISTURE_WET);
  return constrain(pct, 0.0, 100.0);
}

// -- Output Control --
void updateOutputs() {
  // Apply PWM outputs
  analogWrite(PIN_FANS, outputs.fanSpeed);
  analogWrite(PIN_HEATER, outputs.heaterPower);

  // Apply servo positions
  servo1.write(outputs.servo1Angle);
  servo2.write(outputs.servo2Angle);

  // Apply SSR outputs
  digitalWrite(PIN_GROW_LIGHTS, outputs.growLights ? HIGH : LOW);
  digitalWrite(PIN_WATER_PUMP, outputs.waterPump ? HIGH : LOW);
  digitalWrite(PIN_HUMIDIFIER_1, outputs.humidifier1 ? HIGH : LOW);
  digitalWrite(PIN_HUMIDIFIER_2, outputs.humidifier2 ? HIGH : LOW);
}

// -- NTP Functions --
void initializeNTP() {
  DBG("Initializing NTP...");
  configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  DBG("NTP config sent (sync in background)");
}

int getCurrentHour() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return -1; // Invalid
  }
  return timeinfo.tm_hour;
}

String getISOTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return String(millis()); // Fallback
  }
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// -- MQTT Publishing --

/**
 * Publish a single sensor reading to MQTT
 * Each sensor gets its own unique probeIndex and topic
 *
 * @param probeIndex Unique index for this sensor (0-8)
 * @param sensorType Key name for the sensor value (e.g., "soilMoisture",
 * "temperature")
 * @param value The sensor reading value
 * @return true if publish succeeded, false otherwise
 */
bool publishSensorReading(int probeIndex, const char *sensorType, float value) {
  StaticJsonDocument<256> doc;
  doc["mac"] = macAddress;
  doc["probeIndex"] = probeIndex;
  doc["timestamp"] = getISOTimestamp();
  doc[sensorType] = value;
  doc["signalStrengthDbm"] = WiFi.RSSI();

  String payload;
  serializeJson(doc, payload);

  // Topic format: leaflab/telemetry/{mac}/plant/{probeIndex}
  char topic[128];
  snprintf(topic, sizeof(topic), "%s/telemetry/%s/plant/%d", MQTT_BASE_TOPIC,
           macAddress.c_str(), probeIndex);

  bool success = mqttClient.publish(topic, payload.c_str());

  if (success) {
    DBGF("  [%d] %s: %.2f -> %s", probeIndex, sensorType, value, topic);
  } else {
    DBGF("  [%d] FAILED: %s", probeIndex, sensorType);
  }

  return success;
}

/**
 * Publish telemetry for all valid sensors
 * Each sensor is published separately with its own unique probeIndex:
 *   0 = soilMoisture (from soilMoisture1)
 *   1 = soilMoisture (from soilMoisture2)
 *   2 = temperature (air temp, converted F->C)
 *   3 = humidity (air humidity)
 *   4 = light (lux)
 *   5 = soilTemp (converted F->C)
 *   6 = tds
 *   7 = ph
 *   8 = thermistor (heater temp, converted F->C)
 */
void publishTelemetry() {
  DBG("Publishing telemetry (individual sensors)...");

  int successCount = 0;
  int failCount = 0;

  // probeIndex 0: Soil Moisture 1
  if (sensors.soilMoisture1Ok) {
    if (publishSensorReading(0, "soilMoisture", (float)sensors.soilMoisture1)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 1: Soil Moisture 2
  if (sensors.soilMoisture2Ok) {
    if (publishSensorReading(1, "soilMoisture", (float)sensors.soilMoisture2)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 2: Air Temperature (convert F -> C for wire)
  if (sensors.airTempOk) {
    float tempC = (sensors.airTemp - 32.0) * 5.0 / 9.0;
    if (publishSensorReading(2, "temperature", tempC)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 3: Air Humidity
  if (sensors.airHumidityOk) {
    if (publishSensorReading(3, "humidity", sensors.airHumidity)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 4: Light (lux)
  if (sensors.lightOk) {
    if (publishSensorReading(4, "light", sensors.lightLux)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 5: Soil Temperature (convert F -> C for wire)
  if (sensors.soilTempOk) {
    float soilTempC = (sensors.soilTemp - 32.0) * 5.0 / 9.0;
    if (publishSensorReading(5, "soilTemp", soilTempC)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 6: TDS
  if (sensors.tdsOk) {
    if (publishSensorReading(6, "tds", (float)sensors.tds)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 7: pH
  if (sensors.phOk) {
    if (publishSensorReading(7, "ph", (float)sensors.ph)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // probeIndex 8: Heater Temperature / Thermistor (convert F -> C for wire)
  if (sensors.heaterTempOk) {
    float heaterTempC = (sensors.heaterTemp - 32.0) * 5.0 / 9.0;
    if (publishSensorReading(8, "thermistor", heaterTempC)) {
      successCount++;
    } else {
      failCount++;
    }
  }

  // Update global MQTT statistics
  mqttSuccessCount += successCount;
  mqttFailCount += failCount;
  mqttLastPublish = millis() / 1000;

  DBGF("Telemetry complete: %d success, %d failed", successCount, failCount);
}

/**
 * Publish module status to backend (online/offline)
 * Backend expects: leaflab/status/{macAddress}
 * Message format: { mac, status, timestamp, firmwareVersion }
 */
void publishStatus(const char *status) {
  DBGF("Publishing status: %s", status);

  String timestamp = getISOTimestamp();

  StaticJsonDocument<256> doc;
  doc["mac"] = macAddress;
  doc["status"] = status;
  doc["timestamp"] = timestamp;
  doc["firmwareVersion"] = FIRMWARE_VERSION;

  String topic = String(MQTT_BASE_TOPIC) + "/status/" + macAddress;
  String payload;
  serializeJson(doc, payload);

  if (mqttClient.publish(topic.c_str(), payload.c_str())) {
    DBG("Status published successfully.");
  } else {
    DBG("Failed to publish status.");
  }
}

// -- Network Functions --
String getDeviceId() {
  char macStr[13];
  uint64_t mac = ESP.getEfuseMac();
  sprintf(macStr, "%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(macStr);
}

String getMacAddress() {
  uint64_t efuseMac = ESP.getEfuseMac();
  uint8_t mac[6];
  // ESP32 stores MAC in reverse byte order
  mac[0] = (efuseMac >> 0) & 0xFF;
  mac[1] = (efuseMac >> 8) & 0xFF;
  mac[2] = (efuseMac >> 16) & 0xFF;
  mac[3] = (efuseMac >> 24) & 0xFF;
  mac[4] = (efuseMac >> 32) & 0xFF;
  mac[5] = (efuseMac >> 40) & 0xFF;
  char macStr[18];
  sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X", mac[5], mac[4], mac[3],
          mac[2], mac[1], mac[0]);
  return String(macStr);
}

void connectToWifi() {
  DBG("\n--- Connecting to WiFi (STA Mode) ---");

  // Debug: Print credentials being used
  DBGF("SSID: [%s]", wifiSsid.c_str());

  // Station mode only (web server removed)
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());
  WiFi.setSleep(false);
  DBG("WiFi connection initiated (non-blocking)");

  // Brief wait for initial connection (non-blocking style)
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - wifiStart < 10000)) {
    delay(100);
  }

  if (WiFi.status() == WL_CONNECTED) {
    DBGF("Station Connected! IP: %s", WiFi.localIP().toString().c_str());
    DBG("WiFi connected (STA)");
  } else {
    DBG("ERROR: WiFi STA Failed (will keep trying in background)");
  }
}

bool connectToMqtt() {
  DBG("Attempting MQTT connection...");
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setBufferSize(512);

  if (mqttClient.connect(deviceId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
    DBG("MQTT connected");
    // Tell backend we're online
    publishStatus("online");
    return true;
  }

  DBGF("MQTT failed, rc=%d (will retry via loop)", mqttClient.state());
  return false;
}

// -- NVS and BLE Provisioning --
bool loadWifiCredentials() {
  nvs_handle_t nvsHandle;
  esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &nvsHandle);
  if (err != ESP_OK)
    return false;

  size_t required_size;

  err = nvs_get_str(nvsHandle, NVS_KEY_SSID, NULL, &required_size);
  if (err != ESP_OK) {
    nvs_close(nvsHandle);
    return false;
  }
  char *ssid_buf = new char[required_size];
  err = nvs_get_str(nvsHandle, NVS_KEY_SSID, ssid_buf, &required_size);
  if (err != ESP_OK) {
    delete[] ssid_buf;
    nvs_close(nvsHandle);
    return false;
  }
  wifiSsid = ssid_buf;
  delete[] ssid_buf;

  err = nvs_get_str(nvsHandle, NVS_KEY_PASSWORD, NULL, &required_size);
  if (err != ESP_OK) {
    nvs_close(nvsHandle);
    return false;
  }
  char *pass_buf = new char[required_size];
  err = nvs_get_str(nvsHandle, NVS_KEY_PASSWORD, pass_buf, &required_size);
  if (err != ESP_OK) {
    delete[] pass_buf;
    nvs_close(nvsHandle);
    return false;
  }
  wifiPassword = pass_buf;
  delete[] pass_buf;

  nvs_close(nvsHandle);
  DBG("WiFi credentials loaded from NVS.");
  return true;
}

void saveWifiCredentials(const std::string &ssid, const std::string &password) {
  nvs_handle_t nvsHandle;
  esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvsHandle);
  if (err != ESP_OK)
    return;

  nvs_set_str(nvsHandle, NVS_KEY_SSID, ssid.c_str());
  nvs_set_str(nvsHandle, NVS_KEY_PASSWORD, password.c_str());
  nvs_commit(nvsHandle);
  nvs_close(nvsHandle);
  DBG("WiFi credentials saved to NVS.");
}

// =================================================================
// SECTION: Serial Telemetry (RPi Companion)
// =================================================================

/**
 * Publish telemetry as CTX:{json} line for RPi companion
 * Format matches RPi spec: SerialService reads CTX:{json} stream
 */
void serialPublishTelemetry() {
  StaticJsonDocument<1536> doc;

  // Sensors
  JsonObject sens = doc.createNestedObject("sensors");

  JsonObject soil1 = sens.createNestedObject("soilMoisture1");
  soil1["raw"] = sensors.soilMoisture1;
  soil1["percent"] = convertToMoisturePercent(sensors.soilMoisture1);
  soil1["ok"] = sensors.soilMoisture1Ok;

  JsonObject soil2 = sens.createNestedObject("soilMoisture2");
  soil2["raw"] = sensors.soilMoisture2;
  soil2["percent"] = convertToMoisturePercent(sensors.soilMoisture2);
  soil2["ok"] = sensors.soilMoisture2Ok;

  JsonObject airT = sens.createNestedObject("airTemp");
  airT["value"] = sensors.airTemp;
  airT["ok"] = sensors.airTempOk;

  JsonObject airH = sens.createNestedObject("airHumidity");
  airH["value"] = sensors.airHumidity;
  airH["ok"] = sensors.airHumidityOk;

  JsonObject light = sens.createNestedObject("light");
  light["value"] = sensors.lightLux;
  light["ok"] = sensors.lightOk;

  JsonObject soilT = sens.createNestedObject("soilTemp");
  soilT["value"] = sensors.soilTemp;
  soilT["ok"] = sensors.soilTempOk;

  JsonObject tds = sens.createNestedObject("tds");
  tds["raw"] = sensors.tds;
  tds["ok"] = sensors.tdsOk;

  JsonObject ph = sens.createNestedObject("ph");
  ph["raw"] = sensors.ph;
  ph["ok"] = sensors.phOk;

  JsonObject heaterT = sens.createNestedObject("heaterTemp");
  heaterT["value"] = sensors.heaterTemp;
  heaterT["ok"] = sensors.heaterTempOk;

  // Outputs
  JsonObject out = doc.createNestedObject("outputs");
  out["fanSpeed"] = outputs.fanSpeed;
  out["heaterPower"] = outputs.heaterPower;
  out["servo1Angle"] = outputs.servo1Angle;
  out["servo2Angle"] = outputs.servo2Angle;
  out["growLights"] = outputs.growLights;
  out["waterPump"] = outputs.waterPump;
  out["humidifier1"] = outputs.humidifier1;
  out["humidifier2"] = outputs.humidifier2;

  // System
  JsonObject sys = doc.createNestedObject("system");
  sys["uptime"] = millis();
  sys["freeHeap"] = ESP.getFreeHeap();
  sys["wifiRssi"] = WiFi.RSSI();
  sys["wifiConnected"] = (WiFi.status() == WL_CONNECTED);
  sys["mqttConnected"] = mqttClient.connected();
  sys["ntpSynced"] = ntpSynced;
  sys["currentHour"] = getCurrentHour();
  sys["firmwareVersion"] = FIRMWARE_VERSION;

  // Control state
  JsonObject ctrl = doc.createNestedObject("control");
  ctrl["ventMode"] = ventMode;
  ctrl["pumpRunning"] = pumpRunning;
  ctrl["manualOverride"] = manualOverrideActive;
  ctrl["loopCount"] = controlLoopCount;

  // Config setpoints
  JsonObject cfg = doc.createNestedObject("config");
  cfg["heaterTarget"] = HEATER_TARGET_TEMP;
  cfg["heaterHysteresis"] = HEATER_HYSTERESIS;
  cfg["humidityLow"] = HUMIDITY_TARGET_LOW;
  cfg["humidityHigh"] = HUMIDITY_TARGET_HIGH;
  cfg["humidityReturn"] = HUMIDITY_RETURN;
  cfg["tempVentTrigger"] = TEMP_VENT_TRIGGER;
  cfg["tempVentReturn"] = TEMP_VENT_RETURN;
  cfg["soilMoistureLow"] = SOIL_MOISTURE_LOW;
  cfg["soilMoistureHigh"] = SOIL_MOISTURE_HIGH;
  cfg["lightsOnHour"] = LIGHTS_ON_HOUR;
  cfg["lightsOffHour"] = LIGHTS_OFF_HOUR;
  cfg["overrideTimeoutMs"] = OVERRIDE_TIMEOUT_MS;
  cfg["loopIntervalMs"] = LOOP_INTERVAL_MS;

  // Print as CTX:{json} line
  Serial.print("CTX:");
  serializeJson(doc, Serial);
  Serial.println();
}

// =================================================================
// SECTION: Serial Command Handler
// =================================================================

/**
 * Process JSON commands from Serial (RPi companion or USB debug)
 * Expected format: JSON object terminated by newline
 * Commands:
 *   {"action":"set","output":"fanSpeed","value":128}
 *   {"action":"release"}
 *   {"action":"reboot"}
 */
void checkSerialCommands() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialInputIdx == 0)
        continue;
      serialInputBuffer[serialInputIdx] = '\0';

      // Trim whitespace
      char *trimmed = serialInputBuffer;
      while (*trimmed == ' ')
        trimmed++;

      StaticJsonDocument<256> doc;
      DeserializationError error = deserializeJson(doc, trimmed);
      serialInputIdx = 0;

      if (error) {
        Serial.println("RSP:{\"ok\":false,\"error\":\"Invalid JSON\"}");
        continue;
      }

      const char *action = doc["action"] | "";

      if (strcmp(action, "release") == 0) {
        manualOverrideActive = false;
        manualOverrideStartTime = 0;
        Serial.println("RSP:{\"action\":\"release\",\"ok\":true}");
        continue;
      }

      if (strcmp(action, "set") == 0) {
        const char *output = doc["output"] | "";

        if (!manualOverrideActive) {
          manualOverrideActive = true;
          manualOverrideStartTime = millis();
          manualOverrides = outputs; // Copy current state
          DBG("Serial override activated");
        }

        // Apply override with range validation
        if (strcmp(output, "fanSpeed") == 0) {
          outputs.fanSpeed = constrain(doc["value"] | 0, 0, 255);
        } else if (strcmp(output, "heaterPower") == 0) {
          outputs.heaterPower = constrain(doc["value"] | 0, 0, 255);
        } else if (strcmp(output, "servo1Angle") == 0) {
          outputs.servo1Angle = constrain(doc["value"] | 0, 0, 180);
        } else if (strcmp(output, "servo2Angle") == 0) {
          outputs.servo2Angle = constrain(doc["value"] | 0, 0, 180);
        } else if (strcmp(output, "growLights") == 0) {
          outputs.growLights = doc["value"] | false;
        } else if (strcmp(output, "waterPump") == 0) {
          outputs.waterPump = doc["value"] | false;
        } else if (strcmp(output, "humidifier1") == 0) {
          outputs.humidifier1 = doc["value"] | false;
        } else if (strcmp(output, "humidifier2") == 0) {
          outputs.humidifier2 = doc["value"] | false;
        }

        updateOutputs(); // Apply immediately
        Serial.printf("RSP:{\"action\":\"set\",\"output\":\"%s\",\"value\":%d,"
                      "\"ok\":true}\n",
                      output, (int)doc["value"]);
        continue;
      }

      if (strcmp(action, "reboot") == 0) {
        Serial.println("RSP:{\"action\":\"reboot\",\"ok\":true}");
        Serial.flush();
        delay(100);
        ESP.restart();
        return;
      }

      if (strcmp(action, "status") == 0) {
        serialPublishTelemetry();
        continue;
      }

      Serial.printf("RSP:{\"ok\":false,\"error\":\"Unknown action '%s'\"}\n",
                    action);
    } else {
      if (serialInputIdx < (int)sizeof(serialInputBuffer) - 1) {
        serialInputBuffer[serialInputIdx++] = c;
      } else {
        // Buffer overflow — discard
        serialInputIdx = 0;
      }
    }
  }
}

// =================================================================
// SECTION: BLE Provisioning
// =================================================================

class ProvisioningCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    std::string uuid = pCharacteristic->getUUID().toString().c_str();
    std::string value = pCharacteristic->getValue().c_str();

    if (uuid == BLE_CHAR_SSID_UUID) {
      wifiSsid = value;
      DBGF("Received SSID: %s", wifiSsid.c_str());
    }

    if (uuid == BLE_CHAR_PASSWORD_UUID) {
      wifiPassword = value;
      DBG("Received Password.");
    }

    if (!wifiSsid.empty() && !wifiPassword.empty()) {
      saveWifiCredentials(wifiSsid, wifiPassword);
    }
  }
};

void startBleProvisioning() {
  DBG("\n--- Starting BLE Provisioning ---");

  String bleDeviceName = String(BLE_DEVICE_NAME_PREFIX) + "-" +
                         deviceId.substring(deviceId.length() - 4);
  BLEDevice::init(bleDeviceName.c_str());

  BLEServer *pServer = BLEDevice::createServer();
  BLEService *pService = pServer->createService(BLE_SERVICE_UUID);

  BLECharacteristic *pSsidChar = pService->createCharacteristic(
      BLE_CHAR_SSID_UUID, BLECharacteristic::PROPERTY_WRITE);
  pSsidChar->setCallbacks(new ProvisioningCallbacks());

  BLECharacteristic *pPassChar = pService->createCharacteristic(
      BLE_CHAR_PASSWORD_UUID, BLECharacteristic::PROPERTY_WRITE);
  pPassChar->setCallbacks(new ProvisioningCallbacks());

  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  BLEDevice::startAdvertising();

  DBGF("BLE Advertising: %s", bleDeviceName.c_str());
  DBG("Waiting for credentials...");
}
