import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { SerialManager } from './serial.js';
import { StorageManager } from './db.js';
import { TelemetryPacket, SerialCommand } from './types.js';

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
// Only start serial if NOT in mock mode, or maybe always start and let it fail?
// PRD says mock mode injects via HTTP. But `dev:mock` command in PRD doesn't explicitly disable serial. 
// However, running on a dev machine without serial port would cause reconnect loops.
// I'll skip serial start if MOCK_MODE is true.
let serial: SerialManager | null = null;
if (!MOCK_MODE) {
  serial = new SerialManager(SERIAL_PORT);
  serial.start();
} else {
  console.log('[System] Starting in MOCK MODE (Serial disabled)');
}

let lastPacket: TelemetryPacket | null = null;
let lastPacketAt = 0;

// Event handling
const handleTelemetry = (packet: TelemetryPacket) => {
  lastPacket = packet;
  lastPacketAt = Date.now();
  
  // Broadcast to frontend
  io.emit('telemetry', packet);
  
  // Buffer for storage
  db.bufferPacket(packet);
};

if (serial) {
  serial.on('telemetry', handleTelemetry);
  serial.on('status', (status) => io.emit('serialStatus', status));
  serial.on('response', (res) => console.log('[Serial] RSP:', res)); // Forward to UI if needed? PRD doesn't strictly say, but UI needs 'sent' confirmation usually.
  // Ideally command responses should be correlated, but for now we just log or maybe emit generic 'response'
}

// API Routes

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

app.post('/api/command', (req, res) => {
  const cmd: SerialCommand = req.body;
  
  if (MOCK_MODE) {
    console.log('[Mock] Command received:', cmd);
    res.json({ sent: true, cmd, mock: true });
    return;
  }

  if (serial && serial.sendCommand(cmd)) {
    res.json({ sent: true, cmd });
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
});

httpServer.listen(PORT, () => {
  console.log(`[Server] Listening on port ${PORT}`);
});
