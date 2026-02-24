import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SerialManager } from './serial.js';
import { StorageManager } from './db.js';
import { TelemetryPacket, SerialCommand, TimedOverrideInfo, Outputs } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3333;
const SERIAL_PORT = process.env.SERIAL_PORT || '/dev/ttyUSB0';
const MOCK_MODE = process.env.MOCK_MODE === 'true';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' } // Allow all for dev/local
});

const db = new StorageManager();
let serial: SerialManager | null = null;
if (!MOCK_MODE) {
  serial = new SerialManager(SERIAL_PORT);
  serial.start();
} else {
  console.log('[System] Starting in MOCK MODE (Serial disabled)');
}

let lastPacket: TelemetryPacket | null = null;
let lastPacketAt = 0;

// ── Timed Override Management ──────────────────────────────────────
// Server-side per-output timers that keep ESP32 override alive and
// auto-release individual outputs when their timer expires.

const NUMERIC_OUTPUTS: (keyof Outputs)[] = ['fanSpeed', 'heaterPower', 'servo1Angle', 'servo2Angle'];
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000; // 4 min (ESP32 timeout is 5 min)

interface ActiveTimer extends TimedOverrideInfo {
  timerId: ReturnType<typeof setTimeout>;
}

const activeTimers = new Map<string, ActiveTimer>();
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

function broadcastOverrides() {
  const overrides: TimedOverrideInfo[] = Array.from(activeTimers.values()).map(
    ({ timerId, ...info }) => info
  );
  io.emit('overrides', overrides);
}

function sendToEsp(cmd: SerialCommand): boolean {
  if (MOCK_MODE) {
    console.log('[Mock] Timer command:', cmd);
    return true;
  }
  return !!(serial && serial.sendCommand(cmd));
}

function startKeepalive() {
  if (keepaliveInterval) return;
  keepaliveInterval = setInterval(() => {
    if (activeTimers.size === 0) return;
    // Re-send any active output's current value to reset ESP32's 5-min override timeout
    const first = activeTimers.values().next().value!;
    sendToEsp({ action: 'set', output: first.output, value: first.value });
  }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

function clearAllTimers() {
  for (const timer of activeTimers.values()) {
    clearTimeout(timer.timerId);
  }
  activeTimers.clear();
  stopKeepalive();
  broadcastOverrides();
}

function handleTimerExpiry(output: keyof Outputs) {
  activeTimers.delete(output);
  console.log(`[Timer] Override expired for ${output}`);

  // Turn the output off
  const offValue = NUMERIC_OUTPUTS.includes(output) ? 0 : false;
  sendToEsp({ action: 'set', output, value: offValue });

  if (activeTimers.size === 0) {
    // All timed overrides done — release back to automatic
    sendToEsp({ action: 'release' });
    stopKeepalive();
    console.log('[Timer] All timers expired — released to auto');
  }

  broadcastOverrides();
}

// ── Event handling ─────────────────────────────────────────────────

const handleTelemetry = (packet: TelemetryPacket) => {
  lastPacket = packet;
  lastPacketAt = Date.now();
  io.emit('telemetry', packet);
  db.bufferPacket(packet);
};

if (serial) {
  serial.on('telemetry', handleTelemetry);
  serial.on('status', (status) => io.emit('serialStatus', status));
  serial.on('response', (res) => console.log('[Serial] RSP:', res));
}

// ── API Routes ─────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    serialConnected: MOCK_MODE ? true : (serial ? serial.getStatus().connected : false),
    serialPort: SERIAL_PORT,
    lastPacketAt,
    uptime: process.uptime(),
    mockMode: MOCK_MODE
  });
});

app.get('/api/telemetry', (req, res) => {
  if (lastPacket) {
    res.json(lastPacket);
  } else {
    res.status(204).send();
  }
});

app.get('/api/history', (req, res) => {
  const keys = (req.query.keys as string || '').split(',').filter(k => k);
  const start = parseInt(req.query.start as string) || (Date.now() / 1000 - 3600);
  const end = parseInt(req.query.end as string) || (Date.now() / 1000);
  const points = parseInt(req.query.points as string) || 200;

  const data = db.getHistory(keys, start, end, points);
  res.json(data);
});

app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(db.getEvents(limit));
});

app.get('/api/overrides', (_req, res) => {
  const overrides: TimedOverrideInfo[] = Array.from(activeTimers.values()).map(
    ({ timerId, ...info }) => info
  );
  res.json(overrides);
});

app.delete('/api/overrides/:output', (req, res) => {
  const output = req.params.output as keyof Outputs;
  const timer = activeTimers.get(output);
  if (!timer) {
    res.status(404).json({ ok: false, error: 'No active timer for this output' });
    return;
  }

  clearTimeout(timer.timerId);
  activeTimers.delete(output);

  // Turn off the output that was being held
  const offValue = NUMERIC_OUTPUTS.includes(output) ? 0 : false;
  sendToEsp({ action: 'set', output, value: offValue });

  if (activeTimers.size === 0) {
    sendToEsp({ action: 'release' });
    stopKeepalive();
  }

  broadcastOverrides();
  res.json({ ok: true, cancelled: output });
});

app.post('/api/command', (req, res) => {
  const cmd: SerialCommand = req.body;

  // ── Handle release: also clear all server-side timers
  if (cmd.action === 'release') {
    clearAllTimers();
  }

  // ── Handle timed set: register server-side timer
  if (cmd.action === 'set' && cmd.duration && cmd.output) {
    const now = Date.now();

    // Cancel existing timer for this output if any
    const existing = activeTimers.get(cmd.output);
    if (existing) clearTimeout(existing.timerId);

    const timerId = setTimeout(
      () => handleTimerExpiry(cmd.output as keyof Outputs),
      cmd.duration
    );

    activeTimers.set(cmd.output, {
      output: cmd.output,
      value: cmd.value!,
      duration: cmd.duration,
      startedAt: now,
      expiresAt: now + cmd.duration,
      timerId,
    });

    startKeepalive();
    broadcastOverrides();
    console.log(`[Timer] Started ${cmd.duration / 60000}m timer for ${cmd.output}`);
  }

  // ── Regular (non-timed) set on an output that has an active timer → cancel timer
  if (cmd.action === 'set' && !cmd.duration && cmd.output && activeTimers.has(cmd.output)) {
    const existing = activeTimers.get(cmd.output)!;
    clearTimeout(existing.timerId);
    activeTimers.delete(cmd.output);
    if (activeTimers.size === 0) stopKeepalive();
    broadcastOverrides();
    console.log(`[Timer] Cancelled timer for ${cmd.output} (manual override)`);
  }

  // ── Forward to ESP32 (strip duration — firmware doesn't know about it)
  const serialCmd: SerialCommand = { action: cmd.action };
  if (cmd.output) serialCmd.output = cmd.output;
  if (cmd.value !== undefined) serialCmd.value = cmd.value;

  if (MOCK_MODE) {
    console.log('[Mock] Command received:', serialCmd);
    res.json({ sent: true, cmd: serialCmd, mock: true });
    return;
  }

  if (serial && serial.sendCommand(serialCmd)) {
    res.json({ sent: true, cmd: serialCmd });
  } else {
    res.status(503).json({ sent: false, error: 'Serial not connected' });
  }
});

app.post('/api/_mock/telemetry', (req, res) => {
  const packet: TelemetryPacket = req.body;
  handleTelemetry(packet);
  res.json({ ok: true });
});

// Serve client build in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('[Socket] Client connected');
  if (lastPacket) socket.emit('telemetry', lastPacket);
  if (MOCK_MODE) {
    socket.emit('serialStatus', { connected: true, path: 'MOCK_ESP32' });
  } else if (serial) {
    socket.emit('serialStatus', serial.getStatus());
  }
  // Send current override timers to new connections
  const overrides: TimedOverrideInfo[] = Array.from(activeTimers.values()).map(
    ({ timerId, ...info }) => info
  );
  socket.emit('overrides', overrides);
});

httpServer.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
