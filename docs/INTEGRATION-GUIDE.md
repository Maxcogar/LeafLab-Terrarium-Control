# Firmware Integration Guide

**Current Version:** 1.0.0

## Overview
This repository contains the firmware for the **LeafLab Terrarium Module**. It is built upon a reusable **Base Firmware** architecture designed to be portable to future LeafLab sensor modules.

## Specifications
Formal specifications for the system behavior are located in the `specs/` directory:

1. **[Base Firmware Specification](specs/BASE_SPEC.md)**
   - Defines the immutable core: WiFi, MQTT, BLE Provisioning, and Base Sensor Drivers.
   - **For new modules:** Copy the logic defined here first.

2. **[Terrarium Variant Specification](specs/TERRARIUM_SPEC.md)**
   - Defines the specific behavior for this module: Closed-loop control (Heater, Vents, Pumps), specific I/O mapping, and fail-safes.
   - **For new modules:** Replace this with your specific variant spec.

## Development Workflow
1. **Read the Specs:** Before modifying code, verify the change against `specs/BASE_SPEC.md` or `specs/TERRARIUM_SPEC.md`.
2. **Review:** All changes must adhere to the **Functional** and **Non-Functional** requirements listed in the specs.
3. **Extend:** To create a new module type:
   - Fork the Base Firmware logic.
   - Create a new `[VARIANT]_SPEC.md`.
   - Implement only the variant-specific drivers and logic.

## Architecture Notes
- **Initialization:** Follows a strict sequence: Hardware Init -> NVS Load -> Provisioning (if needed) -> Network Connect -> Main Loop.
- **Timing:** Main loop must remain non-blocking (<250ms per iteration). usage of `delay()` is strictly prohibited in the main loop.
- **Configuration:** All setpoints and pin definitions must reside in `config.h`.
