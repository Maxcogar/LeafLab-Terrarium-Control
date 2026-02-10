# 🌱 LeafLab RPi Companion — Product Requirements Document

| Field | Value |
|-------|-------|
| Version | 1.0 |
| Date | February 2026 |
| Author | Max (LeafLab) |
| Status | Draft |
| Hardware Target | Raspberry Pi 4/5 + 5" Touch Display (800×480) |
| Controller | ESP32 (custom firmware, USB serial) |

---

## 1. Product Overview

### 1.1 Purpose

The LeafLab RPi Companion is a local-first touchscreen application that provides real-time monitoring, historical charting, and manual override control for the LeafLab Terrarium Controller (ESP32-based). It runs on a Raspberry Pi with a 5-inch touch display in kiosk mode and communicates with the ESP32 over USB serial.

### 1.2 Goals

1. Provide real-time sensor visibility with less than 50ms display latency from serial ingest to UI update.
2. Store 7 days of sensor history locally with minimal SD card wear (batched writes, WAL-mode SQLite).
3. Allow manual override of all terrarium outputs (fans, heater, lights, pump, humidifiers, vents) from the touchscreen.
4. Operate fully offline once deployed. No cloud dependency for core functionality.
5. Support forward-compatible serial protocol parsing so firmware updates do not break the companion app.

### 1.3 Non-Goals

- Cloud connectivity, remote access, or multi-user accounts (the RPi is local-only).
- Firmware updates or OTA provisioning (handled separately via PlatformIO).
- Camera or image-based plant analysis.
- Modifying ESP32 control logic setpoints from the UI (read-only config display for now).

---

## 2. System Architecture

### 2.1 High-Level Data Flow

The system follows a three-tier local architecture with the ESP32 as the sensor/actuator layer, the RPi backend as the data pipeline, and the React frontend as the presentation layer.

| Stage | Component | Description |
|-------|-----------|-------------|
| Ingest | SerialManager | Reads line-based protocol from /dev/ttyUSB0 at 115200 baud. Parses CTX:/RSP:/DBG: prefixed lines. |
| Broadcast | Socket.io | Valid telemetry packets are emitted to all connected frontends within 50ms of receipt. |
| Buffer | In-Memory Array | Sensor readings are buffered in memory, not written to disk on every packet. |
| Persist | StorageManager | Every 60 seconds, the buffer is flushed to SQLite in a single transaction. Reduces SD write amplification by ~60x. |
| Serve | Express REST API | History queries, status checks, and command relay available over HTTP. |
| Display | React + Zustand | Frontend receives telemetry via WebSocket, maintains sparkline buffers, renders at 800×480. |

### 2.2 Architectural Principles

- **Local-first:** The RPi is the brain of the UI. No internet required for operation.
- **Graceful degradation:** If serial is lost, the UI shows a disconnected overlay. If sensors fail, individual cards show error state. No crashes.
- **SD card preservation:** Batched writes, WAL mode, and 7-day auto-pruning prevent SD wear-out.
- **Forward compatibility:** Serial parser validates packet structure but ignores unknown fields, so firmware changes don't break the companion.

---

## 3. Serial Communication Protocol

### 3.1 Physical Layer

| Parameter | Value |
|-----------|-------|
| Interface | USB Serial (CDC/ACM) |
| Baud Rate | 115200 |
| Data Bits / Stop Bits / Parity | 8 / 1 / None |
| Line Terminator | `\n` (newline) |
| Default Device Path | /dev/ttyUSB0 (configurable via SERIAL_PORT env var) |

### 3.2 Message Types

All messages are line-based (newline-terminated). Direction is relative to the RPi.

| Direction | Prefix | Format | Description |
|-----------|--------|--------|-------------|
| ESP32 → RPi | `CTX:` | `CTX:{json}\n` | Telemetry packet, emitted every 10 seconds. Contains sensors, outputs, system, control, and config blocks. |
| ESP32 → RPi | `RSP:` | `RSP:{json}\n` | Response to a command. Contains action, ok status, and optional error message. |
| ESP32 → RPi | `DBG:` | `DBG: {text}\n` | Debug/log output. Must be ignored by the companion (not parsed, not stored). |
| RPi → ESP32 | (none) | `{json}\n` | JSON command object terminated by newline. |

### 3.3 Command Schema

Commands sent from the RPi to the ESP32 are JSON objects with an "action" field.

| Action | Fields | Example | Behavior |
|--------|--------|---------|----------|
| set | output (string), value (number\|bool) | `{"action":"set","output":"fanSpeed","value":128}` | Activates manual override and sets the specified output. Override has a firmware-defined timeout. |
| release | (none) | `{"action":"release"}` | Deactivates manual override, returns to automatic control logic. |
| status | (none) | `{"action":"status"}` | Requests an immediate CTX telemetry packet (outside normal 10s interval). |
| reboot | (none) | `{"action":"reboot"}` | Restarts the ESP32. Serial connection will drop and reconnect. |

### 3.4 Controllable Outputs

| Output Name | Type | Range | Hardware |
|-------------|------|-------|----------|
| fanSpeed | PWM | 0–255 | DC fans via MOSFET |
| heaterPower | PWM | 0–255 | Heating element via MOSFET |
| servo1Angle | Servo | 0–180° | Vent flap servo 1 |
| servo2Angle | Servo | 0–180° | Vent flap servo 2 |
| growLights | Boolean | true/false | Grow light SSR |
| waterPump | Boolean | true/false | Water pump SSR |
| humidifier1 | Boolean | true/false | Humidifier 1 SSR |
| humidifier2 | Boolean | true/false | Humidifier 2 SSR |

### 3.5 Telemetry Packet Structure (CTX)

Each CTX packet contains five top-level blocks. All sensor readings include an "ok" boolean validity flag.

#### 3.5.1 Sensors Block

| Sensor Key | Fields | Unit | Source |
|------------|--------|------|--------|
| soilMoisture1 | raw (int), percent (float), ok | ADC / % | Capacitive soil moisture probe 1 |
| soilMoisture2 | raw (int), percent (float), ok | ADC / % | Capacitive soil moisture probe 2 |
| airTemp | value (float), ok | °F | SHT31 (I2C, 0x44/0x45) |
| airHumidity | value (float), ok | %RH | SHT31 (I2C, 0x44/0x45) |
| light | value (float), ok | lux | VEML7700 (I2C) |
| soilTemp | value (float), ok | °F | DS18B20 (OneWire, non-blocking) |
| tds | raw (int), ok | ADC | TDS analog sensor |
| ph | raw (int), ok | ADC | pH analog sensor |
| heaterTemp | value (float), ok | °F | NTC thermistor (Steinhart-Hart) |

#### 3.5.2 Other Blocks

| Block | Key Fields | Purpose |
|-------|------------|---------|
| outputs | fanSpeed, heaterPower, servo1Angle, servo2Angle, growLights, waterPump, humidifier1, humidifier2 | Current actuator states |
| system | uptime (ms), freeHeap, wifiRssi, wifiConnected, mqttConnected, ntpSynced, currentHour, firmwareVersion | ESP32 health and connectivity |
| control | ventMode, pumpRunning, manualOverride, loopCount | Control logic state flags |
| config | heaterTarget, heaterHysteresis, humidityLow/High/Return, tempVentTrigger/Return, soilMoistureLow/High, lightsOnHour/OffHour, overrideTimeoutMs, loopIntervalMs | Firmware setpoints (read-only from RPi) |

### 3.6 Reconnection Strategy

| Event | Behavior |
|-------|----------|
| Serial port not found | Retry with exponential backoff: 2s → 3s → 4.5s → ... → 30s max. |
| Serial port closed (USB unplug) | Enter RECONNECTING state. Retry on same schedule. Frontend shows blocking overlay. |
| Serial port error | Log error, close port, schedule reconnect. No crash. |
| WebSocket disconnect | Socket.io auto-reconnects (1s–10s). Frontend shows disconnected indicator. |

---

## 4. Backend Specification

### 4.1 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 20+ | Server process |
| Framework | Express 4 | REST API |
| Realtime | Socket.io 4 | WebSocket broadcast |
| Serial | serialport (npm) | USB serial communication |
| Database | better-sqlite3 (WAL mode) | Local sensor history storage |
| Language | TypeScript | Type safety across server and shared types |
| Process Runner | tsx (dev) / tsc + node (prod) | Development and production execution |

### 4.2 Services

#### 4.2.1 SerialManager

Manages the USB serial connection to the ESP32. Emits events: **telemetry** (parsed CTX packet), **response** (parsed RSP), **status** (connection state change), **debug** (DBG lines). Supports mock injection for development without hardware.

#### 4.2.2 StorageManager

Manages SQLite database with WAL mode enabled. Buffers incoming readings in memory and flushes every 60 seconds in a single transaction. Runs daily pruning to delete records older than 7 days. Provides downsampled history queries for chart rendering.

### 4.3 Database Schema

| Table | Columns | Indexes | Purpose |
|-------|---------|---------|---------|
| readings | id (PK), timestamp (int, unix sec), sensor_key (text), value (real) | idx_time_key (timestamp, sensor_key) | Time-series sensor data |
| events | id (PK), timestamp (int), message (text), severity (int) | idx_events_time (timestamp) | System event log |

### 4.4 Sensor Keys for Storage

Telemetry packets are flattened into individual key-value readings for storage:

| sensor_key | Source | Unit |
|------------|--------|------|
| airTempF | sensors.airTemp.value | °F |
| airHumidity | sensors.airHumidity.value | %RH |
| lightLux | sensors.light.value | lux |
| soilMoisture1Pct | sensors.soilMoisture1.percent | % |
| soilMoisture2Pct | sensors.soilMoisture2.percent | % |
| soilMoisture1Raw | sensors.soilMoisture1.raw | ADC |
| soilMoisture2Raw | sensors.soilMoisture2.raw | ADC |
| soilTempF | sensors.soilTemp.value | °F |
| tds | sensors.tds.raw | ADC |
| ph | sensors.ph.raw | ADC |
| heaterTempF | sensors.heaterTemp.value | °F |

### 4.5 REST API Endpoints

| Method | Path | Parameters | Response |
|--------|------|-----------|----------|
| GET | /api/status | (none) | `{ serialConnected, serialPort, lastPacketAt, bufferSize, uptime }` |
| GET | /api/telemetry | (none) | Latest full telemetry packet (or 204 if none received) |
| GET | /api/history | keys (csv), start (unix), end (unix), points (int, default 200) | `{ [key]: [{t, v}, ...] }` with nth-point downsampling |
| GET | /api/events | limit (int, default 50) | Array of `{ id, timestamp, message, severity }` |
| POST | /api/command | Body: `{ action, output?, value? }` | `{ sent: boolean, cmd }` |
| POST | /api/_mock/telemetry | Body: full telemetry packet | `{ ok: true }` — dev/test only |

---

## 5. Frontend Specification

### 5.1 Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | React 18 |
| Build Tool | Vite 5 |
| State Management | Zustand 5 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 2 |
| Realtime | Socket.io Client 4 |

### 5.2 Display Target

| Parameter | Value |
|-----------|-------|
| Resolution | 800 × 480 pixels |
| Display | 5-inch capacitive touchscreen |
| Mode | Kiosk (fullscreen Chromium, no OS chrome) |
| Orientation | Landscape |
| Input | Touch only (no keyboard/mouse expected) |

### 5.3 Functional Requirements

The frontend must provide the following functional areas. Exact visual design, layout, styling, and component structure are at the discretion of the implementer, provided the functional requirements below are met and the UI is optimized for the 800×480 touch display.

#### 5.3.1 Dashboard

The primary monitoring view. Must display at a glance:

- Current value, unit, and validity status for all key sensors: Air Temp, Humidity, Light, Soil Moisture (both probes), Soil Temp, and Heater Temp.
- A short rolling sparkline (approximately 30 data points) per sensor showing recent trend.
- Current state of all outputs: fan speed, grow lights, water pump, humidifiers, and vent mode.

#### 5.3.2 Charts

Historical data visualization. Must support:

- Selectable sensor groups: Climate (temp + humidity), Soil (moisture probes), Environment (light + soil temp).
- Selectable time ranges: 1 hour, 6 hours, 24 hours, and 7 days.
- Data sourced from GET /api/history with downsampling to a maximum of 200 points.
- Auto-refresh on a reasonable interval (e.g. 30 seconds).

#### 5.3.3 Controls

Manual override interface. Must support:

- Toggle controls for boolean outputs: Grow Lights, Water Pump, Humidifier 1, Humidifier 2.
- Slider or equivalent controls for ranged outputs: Fan Speed (0–255), Heater Power (0–255), Vent 1 angle (0–180°), Vent 2 angle (0–180°).
- Visible indicator when manual override is active, with a way to release back to automatic control.
- System actions: Reboot Controller (with confirmation) and Request Status.
- All controls send commands via Socket.io using the serial command schema defined in Section 3.3.

#### 5.3.4 Settings

Read-only informational view. Must display:

- All firmware config setpoints from the config block (heater target, humidity thresholds, vent triggers, soil moisture thresholds, light schedule, override timeout, loop interval).
- System health info: firmware version, free heap, uptime, WiFi RSSI, WiFi/MQTT/NTP connection status.
- Recent system events from GET /api/events (serial connects/disconnects, errors).

### 5.4 Connection Status

The UI must clearly communicate connection health:

- If the Socket.io connection to the backend is lost, the UI should show a prominent disconnected indicator.
- If the backend reports serial disconnected (no ESP32), the UI should show a blocking or prominent overlay indicating the controller is unreachable.
- Stale data (no new telemetry received for more than ~15 seconds) should be visually indicated.

### 5.5 State Management

A single Zustand store manages all global state:

| State Key | Type | Purpose |
|-----------|------|---------|
| telemetry | TelemetryPacket \| null | Latest full packet from ESP32 |
| lastPacketAt | number \| null | Timestamp of last received packet (for staleness detection) |
| serialConnected | boolean | USB serial connection status |
| backendConnected | boolean | Socket.io connection status |
| sparklines | Record\<key, number[]\> | Ring buffers (30 points each) for dashboard sparklines |
| activeTab | enum | Current navigation tab |

### 5.6 UI Design

Visual design, color palette, typography, component layout, and styling are at the discretion of the implementer. The design should be appropriate for an always-on kiosk display: high contrast, dark theme preferred (to reduce light bleed in a terrarium environment), and touch-friendly target sizes (minimum 44px tap targets). The 800×480 resolution is fixed and the UI must not scroll on the primary views.

---

## 6. Deployment

### 6.1 RPi Setup

| Requirement | Detail |
|-------------|--------|
| Hardware | Raspberry Pi 4 or 5, 5" touchscreen (800×480), USB cable to ESP32 |
| OS | Raspberry Pi OS (Bookworm or later) with desktop environment |
| Node.js | v20+ (installed via NodeSource or nvm) |
| Serial Access | User must be in dialout group: `sudo usermod -aG dialout pi` |

### 6.2 Deployment Process

1. Build the React client on the development machine (`npm run build` in client/).
2. Rsync the project to the RPi (excluding node_modules and source files).
3. Install production dependencies on the RPi (`npm install --production` in server/).
4. Create a systemd service (leaflab.service) for auto-start on boot.
5. Configure Chromium kiosk autostart (desktop entry pointing to http://localhost:3333).

### 6.3 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3333 | HTTP server port |
| SERIAL_PORT | /dev/ttyUSB0 | ESP32 serial device path |
| SERIAL_BAUD | 115200 | Serial baud rate |
| DB_PATH | ./leaflab.db | SQLite database file path |

---

## 7. Development

### 7.1 Project Structure

| Path | Purpose |
|------|---------|
| package.json | Monorepo root. Scripts: dev, dev:mock, build, deploy. |
| server/src/index.ts | Entry point. Express + Socket.io + serial bridge. |
| server/src/serial.ts | SerialManager class. USB serial with reconnect. |
| server/src/db.ts | StorageManager class. SQLite with buffered writes. |
| server/src/types.ts | Shared TypeScript interfaces matching ESP32 packet format. |
| client/src/ | React frontend application (structure at implementer's discretion). |
| scripts/mock_esp32.mjs | Mock data generator. Injects via HTTP, no hardware needed. |
| scripts/deploy.sh | Build + rsync + systemd setup for RPi. |

### 7.2 Development Modes

| Command | Mode | Use Case |
|---------|------|----------|
| npm run dev | Real serial | ESP32 connected via USB. Full live data pipeline. |
| npm run dev:mock | Mock data | No hardware. Simulated telemetry injected via HTTP every 10s. For UI development on any PC. |
| npm run build | Production build | Compiles React to static files. Served by Express in production. |

### 7.3 Mock ESP32 Simulator

The mock script generates realistic telemetry with random-walk sensor values. It injects data via POST /api/_mock/telemetry, bypassing the serial layer entirely. This allows full-stack UI development on any machine without an ESP32 connected.

---

## 8. Future Considerations

The following items are explicitly out of scope for v1.0 but are anticipated for future iterations:

| Feature | Priority | Notes |
|---------|----------|-------|
| Editable setpoints | High | Allow changing heater target, humidity thresholds, light schedule from the UI. Requires new serial command type and firmware support. |
| Alert/notification system | High | Visual and audible alerts when sensors go out of range. Could trigger a buzzer via GPIO. |
| Camera integration | Medium | Pi Camera or USB webcam for periodic plant snapshots. Time-lapse generation. |
| Multi-zone support | Medium | Support multiple ESP32 controllers from a single RPi (multiple serial ports or network). |
| Remote access | Low | Tailscale or Cloudflare Tunnel for secure remote monitoring. Opt-in only. |
| Data export | Low | Export historical data as CSV or JSON from the Settings tab. |
| OTA firmware updates | Low | Push firmware updates to the ESP32 from the RPi UI. |