# LeafLab RPi Companion

Local-first touchscreen companion for the LeafLab Terrarium Controller.

## Prerequisites
- Node.js v20+
- `npm`

## Installation
```bash
npm install
npm install --prefix server
npm install --prefix client
```

## Development

### Mock Mode (No Hardware)
Run the full stack with simulated telemetry:
```bash
npm run dev:mock
```
- Frontend: http://localhost:3000
- Backend: http://localhost:3333
- Mock Script: Injects data every 10s.

### Real Hardware
Connect ESP32 via USB and run:
```bash
npm run dev
```

## Deployment
1. Configure `scripts/deploy.sh` with your RPi IP and User.
2. Run:
```bash
npm run deploy
```

## Architecture
- **Server**: Node.js/Express + SerialPort + Better-SQLite3. Handles hardware comms and persistence.
- **Client**: React + Zustand + Recharts. Kiosk UI.
- **Protocol**: Custom JSON-over-Serial (see PRD).
