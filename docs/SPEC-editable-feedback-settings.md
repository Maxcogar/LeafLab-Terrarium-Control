# Spec: Editable Feedback Loop Settings from RPi UI

| Field        | Value                                  |
|--------------|----------------------------------------|
| Feature      | Editable Config Setpoints              |
| Status       | Draft Spec                             |
| Date         | 2026-02-24                             |
| PRD Ref      | Section 8, "Editable setpoints" (High) |
| Scope        | ESP32 firmware, server, client         |

---

## 1. Problem Statement

The Settings page currently displays firmware configuration setpoints (heater target, humidity thresholds, vent triggers, soil moisture limits, light schedule, etc.) as **read-only text**. The user wants to modify these values from the RPi touchscreen UI without recompiling and reflashing the ESP32 firmware.

### Current Behavior (verified by reading source)

The `Settings.tsx` component renders `ConfigRow` components that are static `<span>` elements showing the value from `telemetry.config.*`. There is no input mechanism, no API endpoint for config changes, and the ESP32 firmware uses compile-time `#define` constants that cannot be changed at runtime.

**PRD Section 1.3 Non-Goals** explicitly states: *"Modifying ESP32 control logic setpoints from the UI (read-only config display for now)."*

**PRD Section 8 Future Considerations** lists this as **High priority**: *"Allow changing heater target, humidity thresholds, light schedule from the UI. Requires new serial command type and firmware support."*

---

## 2. Current Data Flow (Verified)

This section traces exactly how config values flow through the system today.

### 2.1 ESP32 Firmware: Compile-time constants

**File:** `esp32-firmware/config.h:136-161`

All control setpoints are `#define` macros:

```
HEATER_TARGET_TEMP    80.0    (line 139)
HEATER_HYSTERESIS     2.0     (line 140)
HUMIDITY_TARGET_LOW   80.0    (line 143)
HUMIDITY_TARGET_HIGH  85.0    (line 144)
HUMIDITY_RETURN       83.0    (line 145)
TEMP_VENT_TRIGGER     80.0    (line 148)
TEMP_VENT_RETURN      78.0    (line 149)
FAN_SPEED_CIRCULATION 150     (line 152)
FAN_SPEED_VENT        200     (line 153)
SOIL_MOISTURE_LOW     40      (line 156)
SOIL_MOISTURE_HIGH    80      (line 157)
LIGHTS_ON_HOUR        7       (line 160)
LIGHTS_OFF_HOUR       19      (line 161)
OVERRIDE_TIMEOUT_MS   300000  (config.h:7)
LOOP_INTERVAL_MS      10000   (main.cpp:22)
```

### 2.2 ESP32 Firmware: Control logic consumes constants directly

**File:** `esp32-firmware/main.cpp`, function `runControlLogic()` (line 511-628)

Each constant is used directly in control logic:

| Constant              | Used at line(s) | Logic                                      |
|-----------------------|-----------------|---------------------------------------------|
| HEATER_TARGET_TEMP    | 544             | Heater on/off hysteresis comparison          |
| HEATER_HYSTERESIS     | 544, 546        | Deadband around heater target                |
| TEMP_VENT_TRIGGER     | 556             | Opens vents when air temp exceeds this       |
| HUMIDITY_TARGET_HIGH  | 557, 588        | Opens vents / turns off humidifiers          |
| TEMP_VENT_RETURN      | 564             | Closes vents when air temp drops below this  |
| HUMIDITY_RETURN       | 565             | Closes vents when humidity drops below this  |
| FAN_SPEED_VENT        | 574             | Fan speed during vent mode                   |
| SERVO_OPEN            | 575-576         | Servo angle when vents open                  |
| FAN_SPEED_CIRCULATION | 578             | Fan speed during normal operation            |
| SERVO_CLOSED          | 579-580         | Servo angle when vents closed                |
| HUMIDITY_TARGET_LOW   | 585             | Turns humidifiers ON below this              |
| SOIL_MOISTURE_LOW     | 601             | Turns pump ON at or below this %             |
| SOIL_MOISTURE_HIGH    | 606             | Turns pump OFF at or above this %            |
| LIGHTS_ON_HOUR        | 617             | Grow lights ON hour                          |
| LIGHTS_OFF_HOUR       | 617             | Grow lights OFF hour                         |
| OVERRIDE_TIMEOUT_MS   | 278             | Manual override auto-release timeout         |

### 2.3 ESP32 Firmware: Config reported in telemetry

**File:** `esp32-firmware/main.cpp`, function `serialPublishTelemetry()` (lines 1062-1075)

The `config` block of the CTX JSON packet reads all `#define` constants and serializes them. This is how the RPi learns the current config values.

### 2.4 Server: Passthrough

**File:** `server/src/serial.ts:82-102` - Parses `CTX:` lines into `TelemetryPacket`
**File:** `server/src/index.ts:44-53` - Broadcasts packet via Socket.io, no config transformation
**File:** `server/src/types.ts:49-63` - `Config` interface defines all 13 fields

The server does not store, cache, or transform config values. It is a pure passthrough.

### 2.5 Client: Read-only display

**File:** `client/src/store.ts:70-83` - Stores `TelemetryPacket` in Zustand including `config`
**File:** `client/src/components/Settings.tsx:28-55` - Destructures `telemetry.config` and renders static `ConfigRow` elements

The `ConfigRow` component (line 104-111) renders:
```tsx
<span className="font-mono text-white">{value}</span>
```
No inputs, no edit state, no save mechanism.

### 2.6 Serial Command Protocol (current)

**File:** `server/src/types.ts:73-78` and `client/src/types.ts` (identical)

```ts
interface SerialCommand {
  action: 'set' | 'release' | 'status' | 'reboot';
  output?: keyof Outputs;
  value?: number | boolean;
}
```

**File:** `esp32-firmware/main.cpp:1095-1186`, function `checkSerialCommands()`

The ESP32 handles four actions: `set` (manual override of outputs), `release`, `status`, `reboot`. There is **no `config` action**.

---

## 3. Editable Config Parameters

### 3.1 Parameters to make editable

These are the parameters displayed on the current Settings page and used by the feedback control loop:

| Key                | Type  | Default | Min   | Max    | Unit | Group           | Validation Notes                              |
|--------------------|-------|---------|-------|--------|------|-----------------|-----------------------------------------------|
| heaterTarget       | float | 80.0    | 60.0  | 100.0  | F    | Climate Control | Must be reasonable for terrarium use           |
| heaterHysteresis   | float | 2.0     | 0.5   | 10.0   | F    | Climate Control | Too small = relay chatter, too large = swings  |
| humidityLow        | float | 80.0    | 20.0  | 100.0  | %    | Climate Control | Must be < humidityHigh                        |
| humidityHigh       | float | 85.0    | 20.0  | 100.0  | %    | Climate Control | Must be > humidityLow                         |
| humidityReturn     | float | 83.0    | 20.0  | 100.0  | %    | Climate Control | Should be between humidityLow and humidityHigh |
| tempVentTrigger    | float | 80.0    | 60.0  | 100.0  | F    | Climate Control | Must be > tempVentReturn                      |
| tempVentReturn     | float | 78.0    | 60.0  | 100.0  | F    | Climate Control | Must be < tempVentTrigger                     |
| soilMoistureLow    | int   | 40      | 0     | 100    | %    | Irrigation      | Must be < soilMoistureHigh                    |
| soilMoistureHigh   | int   | 80      | 0     | 100    | %    | Irrigation      | Must be > soilMoistureLow                     |
| lightsOnHour       | int   | 7       | 0     | 23     | hour | Lighting        | Must be != lightsOffHour                      |
| lightsOffHour      | int   | 19      | 0     | 23     | hour | Lighting        | Must be != lightsOnHour                       |
| loopIntervalMs     | int   | 10000   | 5000  | 60000  | ms   | Advanced        | Below 5s risks watchdog timeout               |
| overrideTimeoutMs  | int   | 300000  | 60000 | 600000 | ms   | Advanced        | 1-10 minute range                             |

### 3.2 Cross-field validation rules

| Rule                                        | Reason                                              |
|---------------------------------------------|-----------------------------------------------------|
| humidityLow < humidityReturn < humidityHigh | Prevents oscillation; return must be in the deadband |
| tempVentReturn < tempVentTrigger            | Hysteresis requires return < trigger                |
| soilMoistureLow < soilMoistureHigh          | Pump on/off thresholds must not overlap              |
| lightsOnHour != lightsOffHour               | Zero-length schedule is nonsensical                  |
| heaterHysteresis > 0                        | Zero hysteresis causes relay chatter                 |

---

## 4. Required Changes by Layer

### 4.1 ESP32 Firmware Changes

#### 4.1.1 Convert `#define` to runtime variables

**File:** `esp32-firmware/main.cpp`

Add global runtime config variables initialized from the `#define` defaults:

```cpp
// Runtime-configurable setpoints (initialized from config.h defaults)
float cfg_heaterTarget = HEATER_TARGET_TEMP;
float cfg_heaterHysteresis = HEATER_HYSTERESIS;
float cfg_humidityLow = HUMIDITY_TARGET_LOW;
float cfg_humidityHigh = HUMIDITY_TARGET_HIGH;
float cfg_humidityReturn = HUMIDITY_RETURN;
float cfg_tempVentTrigger = TEMP_VENT_TRIGGER;
float cfg_tempVentReturn = TEMP_VENT_RETURN;
int cfg_soilMoistureLow = SOIL_MOISTURE_LOW;
int cfg_soilMoistureHigh = SOIL_MOISTURE_HIGH;
int cfg_lightsOnHour = LIGHTS_ON_HOUR;
int cfg_lightsOffHour = LIGHTS_OFF_HOUR;
unsigned long cfg_overrideTimeoutMs = OVERRIDE_TIMEOUT_MS;
// Note: LOOP_INTERVAL_MS stays as #define (changing loop interval at
// runtime risks watchdog issues and is an advanced concern)
```

The `#define` constants in `config.h` remain unchanged as defaults.

#### 4.1.2 Update `runControlLogic()` to use runtime variables

**File:** `esp32-firmware/main.cpp:511-628`

Replace every `#define` reference with its `cfg_` variable equivalent. Example:

```cpp
// Before (line 544):
if (sensors.soilTemp < (HEATER_TARGET_TEMP - HEATER_HYSTERESIS)) {

// After:
if (sensors.soilTemp < (cfg_heaterTarget - cfg_heaterHysteresis)) {
```

Full replacement map:

| Old Reference          | New Reference           | Lines affected     |
|------------------------|-------------------------|--------------------|
| HEATER_TARGET_TEMP     | cfg_heaterTarget        | 544, 546           |
| HEATER_HYSTERESIS      | cfg_heaterHysteresis    | 544, 546           |
| TEMP_VENT_TRIGGER      | cfg_tempVentTrigger     | 556                |
| HUMIDITY_TARGET_HIGH   | cfg_humidityHigh        | 557, 588           |
| TEMP_VENT_RETURN       | cfg_tempVentReturn      | 564                |
| HUMIDITY_RETURN        | cfg_humidityReturn      | 565                |
| HUMIDITY_TARGET_LOW    | cfg_humidityLow         | 585                |
| SOIL_MOISTURE_LOW      | cfg_soilMoistureLow     | 601                |
| SOIL_MOISTURE_HIGH     | cfg_soilMoistureHigh    | 606                |
| LIGHTS_ON_HOUR         | cfg_lightsOnHour        | 617                |
| LIGHTS_OFF_HOUR        | cfg_lightsOffHour       | 617                |
| OVERRIDE_TIMEOUT_MS    | cfg_overrideTimeoutMs   | 278                |

#### 4.1.3 Update `serialPublishTelemetry()` to use runtime variables

**File:** `esp32-firmware/main.cpp:1062-1075`

Replace `#define` references with `cfg_` variables so the reported config always reflects the actual runtime values:

```cpp
cfg["heaterTarget"] = cfg_heaterTarget;        // was HEATER_TARGET_TEMP
cfg["heaterHysteresis"] = cfg_heaterHysteresis; // was HEATER_HYSTERESIS
// ... etc for all 13 config fields
```

#### 4.1.4 Add `config` action to serial command handler

**File:** `esp32-firmware/main.cpp:1095-1186`, function `checkSerialCommands()`

Add a new action block after the existing `set`/`release`/`reboot`/`status` handlers:

```cpp
if (strcmp(action, "config") == 0) {
    const char* key = doc["key"] | "";
    float val = doc["value"] | 0.0f;
    bool accepted = true;

    if (strcmp(key, "heaterTarget") == 0) {
        cfg_heaterTarget = constrain(val, 60.0f, 100.0f);
    } else if (strcmp(key, "heaterHysteresis") == 0) {
        cfg_heaterHysteresis = constrain(val, 0.5f, 10.0f);
    } else if (strcmp(key, "humidityLow") == 0) {
        cfg_humidityLow = constrain(val, 20.0f, 100.0f);
    } else if (strcmp(key, "humidityHigh") == 0) {
        cfg_humidityHigh = constrain(val, 20.0f, 100.0f);
    } else if (strcmp(key, "humidityReturn") == 0) {
        cfg_humidityReturn = constrain(val, 20.0f, 100.0f);
    } else if (strcmp(key, "tempVentTrigger") == 0) {
        cfg_tempVentTrigger = constrain(val, 60.0f, 100.0f);
    } else if (strcmp(key, "tempVentReturn") == 0) {
        cfg_tempVentReturn = constrain(val, 60.0f, 100.0f);
    } else if (strcmp(key, "soilMoistureLow") == 0) {
        cfg_soilMoistureLow = constrain((int)val, 0, 100);
    } else if (strcmp(key, "soilMoistureHigh") == 0) {
        cfg_soilMoistureHigh = constrain((int)val, 0, 100);
    } else if (strcmp(key, "lightsOnHour") == 0) {
        cfg_lightsOnHour = constrain((int)val, 0, 23);
    } else if (strcmp(key, "lightsOffHour") == 0) {
        cfg_lightsOffHour = constrain((int)val, 0, 23);
    } else if (strcmp(key, "overrideTimeoutMs") == 0) {
        cfg_overrideTimeoutMs = constrain((unsigned long)val, 60000UL, 600000UL);
    } else {
        accepted = false;
    }

    if (accepted) {
        // Optionally persist to NVS here (see 4.1.5)
        Serial.printf("RSP:{\"action\":\"config\",\"key\":\"%s\",\"value\":%.2f,\"ok\":true}\n", key, val);
    } else {
        Serial.printf("RSP:{\"action\":\"config\",\"key\":\"%s\",\"ok\":false,\"error\":\"Unknown config key\"}\n", key);
    }
    continue;
}
```

#### 4.1.5 NVS Persistence (optional but recommended)

Config changes should survive reboots. The firmware already has NVS infrastructure for WiFi credentials (`loadWifiCredentials`/`saveWifiCredentials` in `main.cpp:924-978`).

Add `saveConfigToNVS()` and `loadConfigFromNVS()` functions using a separate NVS namespace (e.g., `"config"`). Call `loadConfigFromNVS()` in `setup()` after NVS init. Call `saveConfigToNVS()` after each successful `config` command.

**Note:** NVS has a limited number of write cycles (~100,000). The config is expected to change infrequently (user adjustments, not per-loop), so this is safe. Do NOT save on every telemetry cycle.

#### 4.1.6 Impact on other firmware functions

| Function              | Impact | Notes                                              |
|-----------------------|--------|----------------------------------------------------|
| `setup()`             | Add    | Call `loadConfigFromNVS()` after NVS init           |
| `loop()`              | None   | No changes needed (override timeout ref is in loop) |
| `readAllSensors()`    | None   | Does not use config setpoints                       |
| `updateOutputs()`     | None   | Applies output state, doesn't use config            |
| `publishTelemetry()`  | None   | MQTT publish is independent of config               |
| `connectToWifi()`     | None   | Unrelated                                           |
| `connectToMqtt()`     | None   | Unrelated                                           |
| BLE provisioning      | None   | Separate concern                                    |

---

### 4.2 Server Changes

#### 4.2.1 Extend `SerialCommand` type

**File:** `server/src/types.ts:73-78`

```ts
// Before:
export interface SerialCommand {
  action: 'set' | 'release' | 'status' | 'reboot';
  output?: keyof Outputs;
  value?: number | boolean;
}

// After:
export interface SerialCommand {
  action: 'set' | 'release' | 'status' | 'reboot' | 'config';
  output?: keyof Outputs;
  key?: keyof Config;
  value?: number | boolean;
}
```

#### 4.2.2 Validate config commands server-side

**File:** `server/src/index.ts:97-111`

Add validation in `POST /api/command` before forwarding to serial. This provides a defense-in-depth layer (firmware also validates, but catching bad values early is better).

```ts
// Add before serial.sendCommand(cmd):
if (cmd.action === 'config') {
  if (!cmd.key || cmd.value === undefined || typeof cmd.value !== 'number') {
    return res.status(400).json({ sent: false, error: 'Config command requires key and numeric value' });
  }
  // Validate key is a known config field
  const validKeys: (keyof Config)[] = [
    'heaterTarget', 'heaterHysteresis', 'humidityLow', 'humidityHigh',
    'humidityReturn', 'tempVentTrigger', 'tempVentReturn',
    'soilMoistureLow', 'soilMoistureHigh', 'lightsOnHour', 'lightsOffHour',
    'overrideTimeoutMs'
  ];
  if (!validKeys.includes(cmd.key)) {
    return res.status(400).json({ sent: false, error: `Unknown config key: ${cmd.key}` });
  }
}
```

#### 4.2.3 Handle config commands in mock mode

**File:** `server/src/index.ts:100-104`

The existing mock handler already logs and returns success. For better mock testing, the mock mode should also update the in-memory `lastPacket.config` so the UI reflects the change immediately:

```ts
if (MOCK_MODE) {
  console.log('[Mock] Command received:', cmd);
  // Update mock config so UI reflects changes
  if (cmd.action === 'config' && lastPacket && cmd.key) {
    (lastPacket.config as any)[cmd.key] = cmd.value;
    io.emit('telemetry', lastPacket); // Broadcast updated packet
  }
  res.json({ sent: true, cmd, mock: true });
  return;
}
```

#### 4.2.4 No database changes needed

Config values are NOT stored in SQLite. They live on the ESP32 (optionally in NVS). The RPi reads them from telemetry packets. No schema changes required.

#### 4.2.5 Event logging for config changes

**File:** `server/src/index.ts`

Log config changes as events so they appear in the Settings event log:

```ts
if (cmd.action === 'config') {
  db.logEvent(`Config changed: ${cmd.key} = ${cmd.value}`, 1);
}
```

---

### 4.3 Client Changes

#### 4.3.1 Extend `SerialCommand` type

**File:** `client/src/types.ts` (mirrors server type)

Same change as server:

```ts
export interface SerialCommand {
  action: 'set' | 'release' | 'status' | 'reboot' | 'config';
  output?: keyof Outputs;
  key?: keyof Config;
  value?: number | boolean;
}
```

#### 4.3.2 Add `sendConfigUpdate` to store

**File:** `client/src/store.ts`

Add a dedicated method (optional but cleaner than raw `sendCommand`):

```ts
sendConfigUpdate: (key: keyof Config, value: number) => {
  fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'config', key, value })
  }).catch(err => console.error('Config update failed', err));
}
```

Also add to `StoreState` interface:
```ts
sendConfigUpdate: (key: keyof Config, value: number) => void;
```

#### 4.3.3 Redesign Settings page

**File:** `client/src/components/Settings.tsx`

This is the primary UI change. The current `ConfigRow` component (read-only `<span>`) must become an editable inline input.

**Design approach: Inline edit with tap-to-edit pattern**

This is a touchscreen kiosk. A full form with a save button is clunky. Instead, use a tap-to-edit pattern:

1. Each config row shows the current value (from telemetry) as text
2. Tapping a row opens an inline number input
3. The user types a new value (on-screen keyboard or touch input)
4. Pressing Enter/blur sends the config command immediately
5. The value updates on the next telemetry packet (confirmation from ESP32)

**Component structure:**

Replace `ConfigRow` with `EditableConfigRow`:

```tsx
function EditableConfigRow({
  label,
  configKey,
  value,
  unit,
  min,
  max,
  step,
}: {
  label: string;
  configKey: keyof Config;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
}) {
  const { sendConfigUpdate } = useStore();
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(value));
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with telemetry value when not editing
  useEffect(() => {
    if (!editing) setLocalValue(String(value));
  }, [value, editing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleSave = () => {
    const num = parseFloat(localValue);
    if (isNaN(num) || num < min || num > max) {
      setLocalValue(String(value)); // Reset to current
      setEditing(false);
      return;
    }
    setPending(true);
    sendConfigUpdate(configKey, num);
    setEditing(false);
    // pending clears on next telemetry update
    setTimeout(() => setPending(false), 5000);
  };

  if (editing) {
    return (
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted">{label}</span>
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            min={min}
            max={max}
            step={step || 1}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setLocalValue(String(value));
                setEditing(false);
              }
            }}
            className="w-20 bg-black/40 border border-primary/50 rounded px-2 py-1 text-right font-mono text-white text-sm"
          />
          <span className="text-muted text-xs">{unit}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex justify-between text-sm cursor-pointer hover:bg-white/5 rounded px-1 py-0.5 -mx-1 transition-colors"
      onClick={() => setEditing(true)}
    >
      <span className="text-muted">{label}</span>
      <span className={clsx("font-mono", pending ? "text-warning animate-pulse" : "text-white")}>
        {value}{unit}
      </span>
    </div>
  );
}
```

**Updated ConfigGroup sections in Settings:**

```tsx
<ConfigGroup title="Climate Control">
  <EditableConfigRow label="Heater Target" configKey="heaterTarget" value={config.heaterTarget} unit="F" min={60} max={100} step={0.5} />
  <EditableConfigRow label="Heater Hysteresis" configKey="heaterHysteresis" value={config.heaterHysteresis} unit="F" min={0.5} max={10} step={0.5} />
  <EditableConfigRow label="Humidity Low" configKey="humidityLow" value={config.humidityLow} unit="%" min={20} max={100} step={1} />
  <EditableConfigRow label="Humidity High" configKey="humidityHigh" value={config.humidityHigh} unit="%" min={20} max={100} step={1} />
  <EditableConfigRow label="Humidity Return" configKey="humidityReturn" value={config.humidityReturn} unit="%" min={20} max={100} step={1} />
  <EditableConfigRow label="Vent Trigger Temp" configKey="tempVentTrigger" value={config.tempVentTrigger} unit="F" min={60} max={100} step={0.5} />
  <EditableConfigRow label="Vent Return Temp" configKey="tempVentReturn" value={config.tempVentReturn} unit="F" min={60} max={100} step={0.5} />
</ConfigGroup>

<ConfigGroup title="Irrigation">
  <EditableConfigRow label="Moisture Low" configKey="soilMoistureLow" value={config.soilMoistureLow} unit="%" min={0} max={100} step={1} />
  <EditableConfigRow label="Moisture High" configKey="soilMoistureHigh" value={config.soilMoistureHigh} unit="%" min={0} max={100} step={1} />
</ConfigGroup>

<ConfigGroup title="Lighting">
  <EditableConfigRow label="Lights On" configKey="lightsOnHour" value={config.lightsOnHour} unit=":00" min={0} max={23} step={1} />
  <EditableConfigRow label="Lights Off" configKey="lightsOffHour" value={config.lightsOffHour} unit=":00" min={0} max={23} step={1} />
</ConfigGroup>
```

**Note:** `loopIntervalMs` and `overrideTimeoutMs` should be placed in a collapsible "Advanced" section or omitted from the main UI to prevent accidental changes.

#### 4.3.4 Settings page layout considerations

The current Settings page uses a 2-column grid (`grid-cols-2`). The left column shows config, the right column shows system health + event log. This layout is preserved. The left column just becomes editable instead of read-only.

The column is already scrollable (`overflow-y-auto` on line 33) which is important since adding more rows or input padding could increase content height.

#### 4.3.5 No changes to other client components

| Component      | Impact | Reason                                          |
|----------------|--------|-------------------------------------------------|
| Dashboard.tsx  | None   | Reads sensors/outputs, not config                |
| Charts.tsx     | None   | Reads history API, not config                    |
| Controls.tsx   | None   | Sends `set`/`release` commands, not `config`     |
| App.tsx        | None   | Navigation/overlay logic, unrelated              |
| store.ts       | Minor  | Add `sendConfigUpdate` method                    |

---

### 4.4 Mock Script Changes

**File:** `scripts/mock_esp32.mjs`

No changes required. The mock config values in the packet (lines 43-57) are already mutable JavaScript. The server-side mock handler (section 4.2.3) will update `lastPacket.config` when config commands are received, so the UI will reflect changes.

---

## 5. Complete File Impact Matrix

| File                                      | Change Type     | Lines Affected          | Risk   |
|-------------------------------------------|-----------------|-------------------------|--------|
| `esp32-firmware/config.h`                 | None            | N/A (defaults stay)     | None   |
| `esp32-firmware/main.cpp`                 | Major           | ~40 lines changed, ~80 added | High   |
| `server/src/types.ts`                     | Minor           | 1 line (SerialCommand)  | Low    |
| `server/src/index.ts`                     | Moderate        | ~20 lines added         | Medium |
| `server/src/serial.ts`                    | None            | N/A                     | None   |
| `server/src/db.ts`                        | None            | N/A                     | None   |
| `client/src/types.ts`                     | Minor           | 1 line (SerialCommand)  | Low    |
| `client/src/store.ts`                     | Minor           | ~8 lines added          | Low    |
| `client/src/components/Settings.tsx`      | Major           | ~80 lines rewritten     | High   |
| `client/src/components/Dashboard.tsx`     | None            | N/A                     | None   |
| `client/src/components/Charts.tsx`        | None            | N/A                     | None   |
| `client/src/components/Controls.tsx`      | None            | N/A                     | None   |
| `client/src/App.tsx`                      | None            | N/A                     | None   |
| `client/src/utils/sensors.ts`            | None            | N/A                     | None   |
| `scripts/mock_esp32.mjs`                 | None            | N/A                     | None   |

---

## 6. Risk Analysis and Mitigations

### 6.1 Safety risks

| Risk                                      | Severity | Mitigation                                          |
|-------------------------------------------|----------|-----------------------------------------------------|
| User sets heater target dangerously high  | Critical | Firmware `constrain()` on all config values; the existing heater thermistor failsafe (`main.cpp:524-527`) kills heater if thermistor fails regardless of config |
| User sets hysteresis to 0                 | High     | Firmware clamps minimum to 0.5F                     |
| User sets moisture thresholds backwards   | Medium   | Cross-validation in UI; firmware still clamps        |
| Config lost on reboot (no NVS persist)    | Medium   | Implement NVS persistence; fallback to #define defaults |
| Rapid config changes flood serial buffer  | Low      | UI commits on blur/enter only (not on every keystroke); serial buffer is 512 bytes, config JSON is ~60 bytes |

### 6.2 Existing safety failsafes that are NOT affected

These safety mechanisms in `runControlLogic()` run **before** any config-dependent logic and are NOT controlled by configurable values:

| Failsafe                         | Line  | Behavior                                          |
|----------------------------------|-------|---------------------------------------------------|
| Heater thermistor fail           | 524   | `!sensors.heaterTempOk` -> `outputs.heaterPower = 0` |
| Both soil sensors fail           | 530   | Kill pump                                         |
| Air sensor fail                  | 536   | Close vents, kill humidifiers                     |
| Manual override check            | 516   | Skip all auto control if override active          |

These are hardcoded safety checks that cannot be disabled by config changes.

### 6.3 Backward compatibility

| Concern                                   | Assessment                                            |
|-------------------------------------------|-------------------------------------------------------|
| Old firmware + new RPi app                | UI will render editable fields but config commands will get "Unknown action" RSP from firmware. UI should handle this gracefully (show error toast or revert). |
| New firmware + old RPi app                | Config block in CTX now reports runtime values instead of #define values. No breaking change - values are the same types and field names. |
| Serial protocol compatibility             | New `config` action is additive. Old actions unchanged. |

---

## 7. Implementation Order

Changes should be implemented in this order to maintain a working system at each step:

### Phase 1: Server + Client types and API (RPi-only, no firmware)
1. Extend `SerialCommand` in `server/src/types.ts`
2. Extend `SerialCommand` in `client/src/types.ts`
3. Add validation + mock handler in `server/src/index.ts`
4. Add `sendConfigUpdate` to `client/src/store.ts`
5. Rewrite `Settings.tsx` with editable `EditableConfigRow`

**Test:** Run `npm run dev:mock` and verify:
- Config values display correctly
- Tapping a value opens an input
- Entering a new value sends a POST to `/api/command`
- The mock handler updates the in-memory packet
- The next telemetry broadcast shows the new value

### Phase 2: ESP32 firmware
6. Add runtime config variables to `main.cpp`
7. Replace `#define` references in `runControlLogic()`
8. Replace `#define` references in `serialPublishTelemetry()`
9. Add `config` action handler in `checkSerialCommands()`
10. (Optional) Add NVS persistence for config

**Test:** Connect ESP32 via serial, send `{"action":"config","key":"heaterTarget","value":75}`, verify RSP is `{"action":"config","key":"heaterTarget","value":75.00,"ok":true}`, and next CTX packet shows `heaterTarget: 75`.

### Phase 3: Integration
11. Run full stack with real ESP32
12. Verify config changes from UI reach firmware
13. Verify telemetry reflects new values
14. Verify control logic uses new values (check heater/pump behavior changes)
15. Test reboot persistence (if NVS implemented)

---

## 8. Verification Evidence

This spec was built by reading every source file in the repository. Here is the evidence trail:

| Claim                                          | Verified in file                           | Lines      |
|------------------------------------------------|--------------------------------------------|------------|
| Config values are #define constants            | `esp32-firmware/config.h`                  | 136-161    |
| runControlLogic uses #define directly          | `esp32-firmware/main.cpp`                  | 511-628    |
| serialPublishTelemetry reports #define values  | `esp32-firmware/main.cpp`                  | 1062-1075  |
| Serial command handler has no `config` action  | `esp32-firmware/main.cpp`                  | 1095-1186  |
| SerialCommand type lacks config support        | `server/src/types.ts`                      | 73-78      |
| Settings.tsx renders read-only ConfigRow       | `client/src/components/Settings.tsx`        | 104-111    |
| Store has sendCommand but no config method     | `client/src/store.ts`                      | 93-98      |
| Server passes commands through to serial       | `server/src/index.ts`                      | 97-111     |
| NVS infrastructure already exists in firmware  | `esp32-firmware/main.cpp`                  | 924-978    |
| Safety failsafes are hardcoded, not config     | `esp32-firmware/main.cpp`                  | 522-540    |
| PRD lists this as Non-Goal for v1             | `PRD.md`                                   | Section 1.3|
| PRD lists this as High priority future feature | `PRD.md`                                   | Section 8  |
| Dashboard/Charts/Controls are unaffected       | All component files reviewed               | N/A        |
| Database schema has no config table            | `server/src/db.ts`                         | 20-37      |
| Mock script config is already mutable JS       | `scripts/mock_esp32.mjs`                   | 43-57      |
