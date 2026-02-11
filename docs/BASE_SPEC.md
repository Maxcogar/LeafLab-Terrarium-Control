# LeafLab Base Firmware Specification

**Version:** 1.0.0
**Status:** DRAFT

## 1. Description
This specification defines the **BASE FIRMWARE** functionality common to all LeafLab ESP32 modules. It serves as the immutable foundation for any specific module variant.

## 2. Functional Requirements

### 2.1 Connectivity & Provisioning
- **[B-FR-1]** The firmware SHALL store WiFi credentials in non-volatile storage (NVS).
- **[B-FR-2]** The firmware SHALL attempt to load WiFi credentials from NVS on boot and connect to the configured network.
- **[B-FR-3]** If no credentials exist or connection fails repeatedly, the firmware SHALL enter **BLE Provisioning Mode** to receive new credentials.
- **[B-FR-4]** The firmware SHALL connect to the configured MQTT broker using TLS 1.2+ with server certificate validation.
- **[B-FR-10]** The firmware SHALL synchronize system time via NTP when internet-connected.

### 2.2 Telemetry & Communication
- **[B-FR-5]** The firmware SHALL publish sensor telemetry to MQTT on a configurable interval.
- **[B-FR-7]** The firmware SHALL track sensor validity and only publish reading for sensors that are detected and functional.
- **[B-FR-8]** The firmware SHALL provide a Serial interface (UART) outputting JSON telemetry for optional Companion Device integration.
- **[B-FR-9]** The firmware SHALL accept Serial JSON commands from a Companion Device (e.g., Raspberry Pi).
- **[B-FR-11]** The firmware SHALL include unique device identifiers (MAC Address, Device ID) in all telemetry payloads.

### 2.3 Sensor Support (Base Driver Set)
The base firmware SHALL include drivers and auto-discovery logic for the following standard sensors:
- **[B-FR-6.1]** Soil Moisture (ADC-based capacitive) - Support for up to 2 instances.
- **[B-FR-6.2]** SHT31 (I2C) - Air Temperature & Humidity.
- **[B-FR-6.3]** VEML7700 (I2C) - Ambient Light.
- **[B-FR-6.4]** DS18B20 (1-Wire) - Soil Temperature.
- **[B-FR-6.5]** TDS & pH (ADC-based) - Water quality sensors.

## 3. Non-Functional Requirements

### 3.1 Performance & Timing
- **[NFR-P1]** **Non-Blocking Operation:** No single operation in the main loop SHALL block for more than **250ms**.
- **[NFR-P2]** **Sensor Cycle:** The total time to read all sensors SHOULD NOT exceed 2 seconds.
- **[NFR-P3]** **Telemetry Latency:** MQTT messages SHOULD be queued/sent within 500ms of reading completion.

### 3.2 Reliability & Recovery
- **[NFR-R1]** **Graceful Degradation:** The system SHALL continue to operate if individual sensors fail or are missing (auto-discovery).
- **[NFR-R2]** **Auto-Reconnect:** The firmware SHALL automatically attempt to reconnect to WiFi and MQTT if connections are lost.
- **[NFR-R4]** **Watchdog:** The firmware SHOULD enable the hardware Watchdog Timer (WDT) in production builds to recover from hangs.

### 3.3 Security
- **[NFR-S1]** **No Hardcoded Secrets:** Production firmware SHALL NOT contain hardcoded WiFi passwords or keys in source code.
  - *Exception:* Development builds MAY use hardcoded credentials for testing, but these MUST be removed before release.
- **[NFR-S4]** **Secure Provisioning:** BLE Provisioning is the authorized method for setting initial credentials.

## 4. Edge Cases & Error Handling

| Scenario | Expected Behavior |
|----------|-------------------|
| **No WiFi Creds** | Enter BLE Provisioning Mode; do not boot loop. |
| **WiFi Down** | Retry connection with backoff strategy; continue running local loops. |
| **MQTT Down** | Retry connection; local control logic MUST continue unaffected. |
| **NTP Fail** | Fall back to `millis()` relative timestamps; log warning. |
| **Sensor Missing** | Log error once; mark sensor as `unavailable`; do not block or crash. |

## 5. Scope Boundaries

### IN SCOPE
- Core networking (WiFi, MQTT, TLS, NTP)
- NVS and BLE Credential Management
- Sensor Auto-discovery framework
- Serial JSON Interface

### OUT OF SCOPE
- **Access Point (AP) Mode** (Obsolete/Removed)
- **Local Web Server** (Obsolete/Removed)
- **HTML/Dashboard Hosting** (Moved to Companion Device)
- **Cloud-side Control Logic** (Handled by Backend)
