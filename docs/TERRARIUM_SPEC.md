# LeafLab Terrarium Firmware Specification

**Version:** 1.0.0
**Status:** DRAFT
**Base Requirement:** [LeafLab Base Firmware Specification](./BASE_SPEC.md)

## 1. Description
This specification defines the **TERRARIUM VARIANT** functionality. It extends the Base Firmware with specific drivers, output controls, and closed-loop logic for managing terrarium environments.

## 2. Functional Requirements (Variant Specific)

### 2.1 Hardware Inputs (Extends Base)
- **[T-FR-1]** **Heater Thermistor:** The firmware SHALL read a NTC thermistor (via ADC) to monitor the heating plate temperature.

### 2.2 Hardware Outputs
- **[T-FR-2]** **Heating Element:** The firmware SHALL control a heating element via PWM.
- **[T-FR-3]** **Vent Servos:** The firmware SHALL control two servo motors for ventilation flaps (0-90°).
- **[T-FR-4]** **Circulation Fans:** The firmware SHALL control PWM fans for air circulation.
- **[T-FR-5]** **Humidifiers:** The firmware SHALL control humidifier units (SSR/Relay).
- **[T-FR-6]** **Water Pump:** The firmware SHALL control a water pump (SSR/Relay) for irrigation.
- **[T-FR-7]** **Grow Lights:** The firmware SHALL control grow lights (SSR/Relay).

### 2.3 Closed-Loop Control Logic
- **[T-FR-2.1]** **Heater Control:** The firmware SHALL maintain Heater Thermistor temperature at a configurable setpoint (e.g., 75°F) with hysteresis.
- **[T-FR-3.1]** **Vent Logic:** The firmware SHALL open vents if Air Temperature OR Air Humidity exceeds configured high thresholds.
- **[T-FR-4.1]** **Fan Logic:**
  - *Normal Mode:* Fans run at low speed (Circulation).
  - *Vent Mode:* Fans run at high speed to flush air.
- **[T-FR-5.1]** **Humidifier Logic:** The firmware SHALL activate humidifiers if Air Humidity falls below a configurable low threshold.
- **[T-FR-6.1]** **Pump Logic:** The firmware SHALL activate the water pump if Soil Moisture falls below a low threshold, and stop when it reaches a high threshold (hysteresis).
- **[T-FR-7.1]** **Light Schedule:** The firmware SHALL toggle grow lights based on a configurable daily schedule (e.g., ON at 07:00, OFF at 19:00).

### 2.4 Manual Override
- **[T-FR-8]** The firmware SHALL allow manual override of all outputs via Serial JSON commands (bypassing control logic).
- **[T-FR-9]** **Auto-Release:** Manual overrides SHALL automatically expire after a configurable timeout (default: 5 minutes), returning control to the automated logic.

## 3. Configuration & Tuning
All control setpoints MUST be defined in `config.h` (or NVS in future):
- `HEATER_TARGET_TEMP` / `HEATER_HYSTERESIS`
- `HUMIDITY_TARGET_LOW` / `HUMIDITY_TARGET_HIGH`
- `TEMP_VENT_TRIGGER`
- `SOIL_MOISTURE_LOW` / `SOIL_MOISTURE_HIGH`
- `LIGHTS_ON_HOUR` / `LIGHTS_OFF_HOUR`

## 4. Edge Cases (Variant Specific)

| Scenario | Expected Behavior |
|----------|-------------------|
| **Heater Thermistor Fail** | Reading out of range (-40°F or >200°F). **Action:** Disable Heater PWM immediately (Safety Failsafe). Log Error. |
| **Soil Moisture Fail** | Both sensors read 0 or unavailable. **Action:** Disable Water Pump immediately to prevent flooding. Log Error. |
| **Air Sensor Fail** | SHT31 fails. **Action:** Close Vents, Turn Off Humidifiers. Default to passive failing state. |
| **Override Disconnect** | User enables override then serial/MQTT connection dies. **Action:** Auto-release timer ensures system returns to safe auto-control. |

## 5. Scope Boundaries

### IN SCOPE
- All logic above is strictly **Local Control**. The ESP32 makes decisions based on its own sensors.

### OUT OF SCOPE
- **Cloud-based Rules:** The firmware does NOT query the cloud for "decisions" (e.g., "Should I water?"). It only accepts direct override commands or configuration updates.
- **Multi-Zone Control:** This variant controls a **single** terrarium environment.