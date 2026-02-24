export interface SensorReading<T = number> {
  value?: T;
  raw?: number;
  percent?: number;
  ok: boolean;
}

export interface Sensors {
  soilMoisture1: SensorReading<number>;
  soilMoisture2: SensorReading<number>;
  airTemp: SensorReading<number>;
  airHumidity: SensorReading<number>;
  light: SensorReading<number>;
  soilTemp: SensorReading<number>;
  tds: SensorReading<number>;
  ph: SensorReading<number>;
  heaterTemp: SensorReading<number>;
}

export interface Outputs {
  fanSpeed: number;
  heaterPower: number;
  servo1Angle: number;
  servo2Angle: number;
  growLights: boolean;
  waterPump: boolean;
  humidifier1: boolean;
  humidifier2: boolean;
}

export interface System {
  uptime: number;
  freeHeap: number;
  wifiRssi: number;
  wifiConnected: boolean;
  mqttConnected: boolean;
  ntpSynced: boolean;
  currentHour: number;
  firmwareVersion: string;
}

export interface Control {
  ventMode: number; // Assuming enum/int
  pumpRunning: boolean;
  manualOverride: boolean;
  loopCount: number;
}

export interface Config {
  heaterTarget: number;
  heaterHysteresis: number;
  humidityLow: number;
  humidityHigh: number;
  humidityReturn: number;
  tempVentTrigger: number;
  tempVentReturn: number;
  soilMoistureLow: number;
  soilMoistureHigh: number;
  lightsOnHour: number;
  lightsOffHour: number;
  overrideTimeoutMs: number;
  loopIntervalMs: number;
}

export interface TelemetryPacket {
  sensors: Sensors;
  outputs: Outputs;
  system: System;
  control: Control;
  config: Config;
}

export interface SerialCommand {
  action: 'set' | 'release' | 'status' | 'reboot';
  output?: keyof Outputs;
  value?: number | boolean;
  duration?: number; // ms - for timed overrides (server-managed)
}

export interface TimedOverrideInfo {
  output: keyof Outputs;
  value: number | boolean;
  duration: number;
  startedAt: number;
  expiresAt: number;
}

export interface SerialResponse {
  action: string;
  ok: boolean;
  message?: string;
  error?: string;
}

// Database types
export interface DBReading {
  id: number;
  timestamp: number;
  sensor_key: string;
  value: number;
}

export interface DBEvent {
  id: number;
  timestamp: number;
  message: string;
  severity: number;
}
