import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';
import { TelemetryPacket, SerialResponse, SerialCommand } from './types.js';

const REQUIRED_SENSOR_KEYS = [
  'soilMoisture1', 'soilMoisture2', 'airTemp', 'airHumidity',
  'light', 'soilTemp', 'tds', 'ph', 'heaterTemp'
];

const REQUIRED_OUTPUT_FIELDS: [string, string][] = [
  ['fanSpeed', 'number'], ['heaterPower', 'number'],
  ['servo1Angle', 'number'], ['servo2Angle', 'number'],
  ['growLights', 'boolean'], ['waterPump', 'boolean'],
  ['humidifier1', 'boolean'], ['humidifier2', 'boolean'],
];

const REQUIRED_SYSTEM_FIELDS: [string, string][] = [
  ['uptime', 'number'], ['freeHeap', 'number'],
  ['wifiRssi', 'number'], ['wifiConnected', 'boolean'],
  ['mqttConnected', 'boolean'], ['ntpSynced', 'boolean'],
  ['currentHour', 'number'], ['firmwareVersion', 'string'],
];

const REQUIRED_CONTROL_FIELDS: [string, string][] = [
  ['ventMode', 'number'], ['pumpRunning', 'boolean'],
  ['manualOverride', 'boolean'], ['loopCount', 'number'],
];

const REQUIRED_CONFIG_FIELDS: [string, string][] = [
  ['heaterTarget', 'number'], ['heaterHysteresis', 'number'],
  ['humidityLow', 'number'], ['humidityHigh', 'number'],
  ['humidityReturn', 'number'], ['tempVentTrigger', 'number'],
  ['tempVentReturn', 'number'], ['soilMoistureLow', 'number'],
  ['soilMoistureHigh', 'number'], ['lightsOnHour', 'number'],
  ['lightsOffHour', 'number'], ['overrideTimeoutMs', 'number'],
  ['loopIntervalMs', 'number'],
];

function checkFields(section: Record<string, any>, fields: [string, string][], sectionName: string): string | null {
  for (const [key, expectedType] of fields) {
    if (typeof section[key] !== expectedType) {
      return `${sectionName}.${key}: expected ${expectedType}, got ${typeof section[key]}`;
    }
  }
  return null;
}

/**
 * Validate that a parsed JSON object has the shape of a complete TelemetryPacket.
 * Returns null if valid, or a string describing what's missing.
 */
export function validatePacket(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return 'not an object';

  for (const section of ['sensors', 'outputs', 'system', 'control', 'config'] as const) {
    if (!obj[section] || typeof obj[section] !== 'object') return `missing "${section}"`;
  }

  for (const key of REQUIRED_SENSOR_KEYS) {
    const reading = obj.sensors[key];
    if (!reading || typeof reading !== 'object' || typeof reading.ok !== 'boolean') {
      return `missing or malformed sensor "${key}"`;
    }
  }

  let err: string | null;
  if ((err = checkFields(obj.outputs, REQUIRED_OUTPUT_FIELDS, 'outputs'))) return err;
  if ((err = checkFields(obj.system, REQUIRED_SYSTEM_FIELDS, 'system'))) return err;
  if ((err = checkFields(obj.control, REQUIRED_CONTROL_FIELDS, 'control'))) return err;
  if ((err = checkFields(obj.config, REQUIRED_CONFIG_FIELDS, 'config'))) return err;

  return null;
}

export class SerialManager extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private path: string;
  private baudRate: number;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay = 2000;
  private isConnected = false;
  private isClosing = false; // Flag to prevent reconnect loop during intentional close

  constructor(path: string = '/dev/ttyUSB0', baudRate: number = 115200) {
    super();
    this.path = path;
    this.baudRate = baudRate;
  }

  public start() {
    this.isClosing = false;
    this.connect();
  }

  public stop() {
    this.isClosing = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
  }

  private connect() {
    if (this.isClosing) return;

    console.log(`[Serial] Connecting to ${this.path}...`);
    this.port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

    this.port.open((err) => {
      if (err) {
        console.error(`[Serial] Error opening port: ${err.message}`);
        this.scheduleReconnect();
        return;
      }
      console.log(`[Serial] Connected to ${this.path}`);
      this.isConnected = true;
      this.reconnectDelay = 2000; // Reset backoff
      this.emit('status', { connected: true, path: this.path });
    });

    this.port.on('close', () => {
      console.log('[Serial] Port closed');
      this.isConnected = false;
      this.emit('status', { connected: false, path: this.path });
      if (!this.isClosing) this.scheduleReconnect();
    });

    this.port.on('error', (err) => {
      console.error(`[Serial] Port error: ${err.message}`);
      if (this.port?.isOpen) this.port.close();
    });

    this.parser.on('data', (line: string) => {
      this.handleLine(line.trim());
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    console.log(`[Serial] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff capped at 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
  }

  private handleLine(line: string) {
    if (line.startsWith('CTX:')) {
      try {
        const json = line.substring(4);
        const packet = JSON.parse(json);
        const error = validatePacket(packet);
        if (error) {
          console.warn(`[Serial] Dropping incomplete CTX packet: ${error}`);
          return;
        }
        this.emit('telemetry', packet as TelemetryPacket);
      } catch (e) {
        console.error('[Serial] Failed to parse CTX:', e);
      }
    } else if (line.startsWith('RSP:')) {
      try {
        const json = line.substring(4);
        const response: SerialResponse = JSON.parse(json);
        this.emit('response', response);
      } catch (e) {
        console.error('[Serial] Failed to parse RSP:', e);
      }
    } else if (line.startsWith('DBG:')) {
      const msg = line.substring(4).trim();
      this.emit('debug', msg);
    }
  }

  public sendCommand(cmd: SerialCommand): boolean {
    if (!this.port || !this.port.isOpen) {
      console.warn('[Serial] Cannot send command: Port closed');
      return false;
    }
    try {
      const line = JSON.stringify(cmd) + '\n';
      this.port.write(line);
      return true;
    } catch (e) {
      console.error('[Serial] Send command failed:', e);
      return false;
    }
  }
  
  public getStatus() {
    return {
        connected: this.isConnected,
        path: this.path
    }
  }
}
