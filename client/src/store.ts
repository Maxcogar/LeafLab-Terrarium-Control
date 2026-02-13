import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { TelemetryPacket, SerialCommand, Outputs } from './types';
import { calculateTDS, calculatePH } from './utils/sensors';

interface StoreState {
  telemetry: TelemetryPacket | null;
  lastPacketAt: number | null;
  serialConnected: boolean;
  backendConnected: boolean;
  sparklines: Record<string, number[]>; // key -> array of values
  activeTab: 'dashboard' | 'charts' | 'controls' | 'settings';
  
  socket: Socket | null;
  connect: () => void;
  sendCommand: (cmd: SerialCommand) => void;
  setActiveTab: (tab: StoreState['activeTab']) => void;
}

const SPARKLINE_LENGTH = 30;

// Helper to update sparklines
const updateSparklines = (current: Record<string, number[]>, packet: TelemetryPacket) => {
  const next = { ...current };
  const s = packet.sensors;
  
  const push = (key: string, val: number | undefined) => {
    if (val === undefined) return;
    if (!next[key]) next[key] = [];
    next[key] = [...next[key], val].slice(-SPARKLINE_LENGTH);
  };

  if (s.airTemp.ok) push('airTemp', s.airTemp.value);
  if (s.airHumidity.ok) push('airHumidity', s.airHumidity.value);
  if (s.light.ok) push('light', s.light.value);
  if (s.soilMoisture1.ok) push('soilMoisture1', s.soilMoisture1.percent);
  if (s.soilMoisture2.ok) push('soilMoisture2', s.soilMoisture2.percent);
  if (s.heaterTemp.ok) push('heaterTemp', s.heaterTemp.value);
  if (s.soilTemp.ok) push('soilTemp', s.soilTemp.value);

  // Converted values
  if (s.tds.ok) push('tds', s.tds.value);
  if (s.ph.ok) push('ph', s.ph.value);

  return next;
};

export const useStore = create<StoreState>((set, get) => ({
  telemetry: null,
  lastPacketAt: null,
  serialConnected: false,
  backendConnected: false,
  sparklines: {},
  activeTab: 'dashboard',
  socket: null,

  connect: () => {
    if (get().socket) return;

    const socket = io('/', { path: '/socket.io' }); // Proxy handles request to backend

    socket.on('connect', () => {
      set({ backendConnected: true });
    });

    socket.on('disconnect', () => {
      set({ backendConnected: false });
    });

    socket.on('telemetry', (packet: TelemetryPacket) => {
      // Apply conversions before storing/sparklining
      if (packet.sensors.tds.ok && packet.sensors.tds.raw !== undefined) {
        packet.sensors.tds.value = calculateTDS(packet.sensors.tds.raw);
      }
      if (packet.sensors.ph.ok && packet.sensors.ph.raw !== undefined) {
        packet.sensors.ph.value = calculatePH(packet.sensors.ph.raw);
      }

      set((state) => ({
        telemetry: packet,
        lastPacketAt: Date.now(),
        sparklines: updateSparklines(state.sparklines, packet)
      }));
    });

    socket.on('serialStatus', (status: { connected: boolean }) => {
      set({ serialConnected: status.connected });
    });

    set({ socket });
  },

  sendCommand: (cmd: SerialCommand) => {
    fetch('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd)
    }).catch(err => console.error('Command failed', err));
  },

  setActiveTab: (tab) => set({ activeTab: tab })
}));
