RPi Companion - Technical Implementation Specification
Executive Summary
This document serves as the absolute blueprint for the construction of the LeafLab RPi Companion software. Code will be written strictly according to these specifications.
Hardware Target: Raspberry Pi 4/5 with 5" Touch Display (800x480 resolution).
Operating Mode: Kiosk Mode (Full screen, no OS interaction).
Architecture: Local-First. The RPi is the "Brain" of the UI, the ESP32 is the "Nervous System".
Design Language: "LeafLab Dark" (High contrast, deep slate backgrounds, neon accelerators).
2. System Architecture & Data Flow
2.1 The Data Pipeline
Ingest: SerialService reads CTX:{json} stream from /dev/ttyUSB0 (Baud 115200).
Parse: Validate JSON schema. Invalid packets are discarded immediately.
Broadcast: Valid telemetry is immediately emitted via Socket.io (event: 'telemetry') to React Frontend for "Real-time" display ( < 50ms latency).
Persist: Telemetry is pushed to an In-Memory Buffer.
Batch Strategy: Every 60 seconds, the buffer is flushed to SQLite.
Constraint: Reduces SD Write Amplification factor by ~60x.
2.2 Reconnection Strategy
Serial: If USB is unplugged (close event), Backend enters RECONNECTING state.
Retry Interval: 2s (Exponential Backoff enabled up to 30s).
Frontend: Displays "Controller Disconnected" Overlay (Blocking).
Socket: If Frontend loses WS connection, it displays "Server Disconnected" Badge.
3. Backend Specification (Node.js)
3.1 Services Classes
SerialManager:
constructor(port: string)
write(cmd: object): Stringifies JSON + \n.
events:
on('data')
,
on('status')
.
StorageManager:
buffer: Reading[]
flush(): Transactional Bulk Insert.
prune(): Deletes records > 7 days old (Run daily).
WebServer
: Express + HTTP Server + Socket.io instance.
3.2 Database Schema (SQLite)
File: leaflab.db (WAL Mode Enabled)
Table readings:
sql
CREATE TABLE IF NOT EXISTS readings (
id INTEGER PRIMARY KEY AUTOINCREMENT,
timestamp INTEGER NOT NULL,  -- Unix Epoch (Seconds)
sensor_key TEXT NOT NULL,    -- 'airTempF', 'humidity', 'soil1'...
value REAL NOT NULL
);
CREATE INDEX idx_time_key ON readings(timestamp, sensor_key);
Table events (System Logs):
sql
CREATE TABLE IF NOT EXISTS events (
id INTEGER PRIMARY KEY AUTOINCREMENT,
timestamp INTEGER NOT NULL,
message TEXT NOT NULL,
severity INTEGER DEFAULT 0
);
3.3 API Endpoints
GET /api/history
Query: keys (comma-sep),
start
,
end
(unix timestamps).
Response: { "airTempF": [{t: 123, v: 75.0}, ...], ... }
GET /api/status
Response: { serialConnected: true, lastPacket: 123456789, bufferSize: 12 }
4. Frontend Specification (React/Vite)
4.1 UI Layout Strategy (5" Screen Optimized)
Vertical space is expensive on 800x480. We reject Sidebar Navigation. Solution: Bottom Tab Bar Navigation.
Height: 60px fixed.
Tabs: [Dashboard] [Charts] [Settings].
4.2 Component Architecture
AppLayout.tsx: Contains StatusBar (Top, 30px) and NavBar (Bottom, 60px).
DashboardView.tsx: CSS Grid (2 cols x 3 rows).
SensorCard.tsx:
Displays: Label, Huge Value, Unit, Sparkline (SVG).
Props: type: 'temp'|'humid'|'water', data: TelemetryPoint.
ControlDock.tsx (Overlay):
Triggered by "Controls" FAB (Floating Action Button).
Contains: ToggleSwitch components for Overrides.
4.3 State Management (Zustand)
Store: useSystemStore
telemetry: (Latest JSON packet).
status
: { serial: boolean, backend: boolean }.
config
: { heaterTarget: 75 ... }.
4.4 Theme Palette (Tailwind)
Background: bg-slate-950 (#020617)
Surface: bg-slate-900 (#0f172a)
Border: border-slate-800
Primary: text-emerald-400 (Status OK / Values)
Accent: text-violet-400 (Charts/Active Tabs)
Danger: text-rose-500 (Errors/Alerts)
5. File Structure
text
LeafLab-Companion/
├── package.json         # Concurrently runs server + client
├── server/
│   ├── src/
│   │   ├── index.ts        # Entry point
│   │   ├── serial.ts       # SerialManager
│   │   ├── db.ts           # StorageManager
│   │   └── types.ts        # Shared Interfaces
│   └── tsconfig.json
├── client/              # Vite Project
│   ├── src/
│   │   ├── components/
│   │   │   ├── layouts/    # AppLayout
│   │   │   ├── widgets/    # SensorCard, Sparkline
│   │   │   └── controls/   # Toggle, Slider
│   │   ├── services/       # Socket.io, API fetchers
│   │   ├── hooks/          # useTelemetry, useHistory
│   │   └── App.tsx
│   └── tailwind.config.js
└── scripts/
└── deploy.sh        # Rsync script for RPi
6. Development Stages
Project Skeleton: Setup Monorepo structure and shared types.
Mock Data Engine: Create mock_esp32.js to simulate Serial stream (Crucial for dev on PC).
Backend Core: Implement Serial reader -> WebSocket broadcast -> DB Write loop.
Frontend Layout: Implement the 800x480 layout and Sparkline component.
Integration: Connect real ESP32 and Verify latency.
