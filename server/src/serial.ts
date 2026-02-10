import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { EventEmitter } from 'events';
import { TelemetryPacket, SerialResponse, SerialCommand } from './types.js';

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
        const packet: TelemetryPacket = JSON.parse(json);
        this.emit('telemetry', packet);
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
