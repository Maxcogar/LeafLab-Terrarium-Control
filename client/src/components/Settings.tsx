import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { DBEvent } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { Wifi, Server, Cpu, Clock, Activity, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

export function Settings() {
  const { telemetry } = useStore();
  const [events, setEvents] = useState<DBEvent[]>([]);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events?limit=20');
      const data = await res.json();
      setEvents(data);
    } catch (e) { console.error(e); }
  };

  if (!telemetry) return <div className="p-10 text-center text-muted text-glow-sm">Waiting for telemetry...</div>;

  const { config, system } = telemetry;

  return (
    <div className="grid grid-cols-2 gap-6 h-full">
      {/* Config Setpoints */}
      <div className="glass-surface rounded-2xl p-6 overflow-y-auto">
        <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-6 flex items-center gap-2 text-glow-sm">
          <Activity size={14} /> Firmware Configuration
        </h3>
        
        <div className="space-y-4">
          <ConfigGroup title="Climate Control">
            <ConfigRow label="Heater Target" value={`${config.heaterTarget}°F`} />
            <ConfigRow label="Heater Hysteresis" value={`${config.heaterHysteresis}°F`} />
            <ConfigRow label="Humidity Target" value={`${config.humidityLow}% - ${config.humidityHigh}%`} />
            <ConfigRow label="Vent Triggers" value={`${config.tempVentTrigger}°F / ${config.tempVentReturn}°F`} />
          </ConfigGroup>

          <ConfigGroup title="Irrigation">
            <ConfigRow label="Soil Moisture Range" value={`${config.soilMoistureLow}% - ${config.soilMoistureHigh}%`} />
            <ConfigRow label="Loop Interval" value={`${config.loopIntervalMs}ms`} />
          </ConfigGroup>

          <ConfigGroup title="Lighting">
            <ConfigRow label="Schedule" value={`${config.lightsOnHour}:00 - ${config.lightsOffHour}:00`} />
            <ConfigRow label="Current Hour" value={system.currentHour} />
          </ConfigGroup>
        </div>
      </div>

      <div className="flex flex-col gap-6 h-full overflow-hidden">
        {/* System Health */}
        <div className="glass-surface rounded-2xl p-6 shrink-0">
          <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-4 text-glow-sm">System Health</h3>
          <div className="grid grid-cols-2 gap-4">
             <HealthItem icon={<Clock size={18} />} label="Uptime" value={formatUptime(system.uptime)} />
             <HealthItem icon={<Cpu size={18} />} label="Free Heap" value={`${(system.freeHeap / 1024).toFixed(1)} KB`} />
             <HealthItem icon={<Wifi size={18} />} label="WiFi RSSI" value={`${system.wifiRssi} dBm`} color={system.wifiConnected ? "text-primary" : "text-danger"} />
             <HealthItem icon={<Server size={18} />} label="Firmware" value={system.firmwareVersion} />
          </div>
        </div>

        {/* Event Log */}
        <div className="glass-surface rounded-2xl p-6 flex-1 min-h-0 flex flex-col">
          <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-4 text-glow-sm">Event Log</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {events.map(e => (
              <div key={e.id} className="flex gap-3 text-sm p-2 rounded-lg bg-black/20">
                <div className="mt-1">
                  <AlertTriangle size={14} className={e.severity > 1 ? "text-warning" : "text-muted"} />
                </div>
                <div>
                  <div className="text-white text-glow">{e.message}</div>
                  <div className="text-xs text-muted text-glow-sm">{new Date(e.timestamp * 1000).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {events.length === 0 && <div className="text-muted text-sm italic text-glow-sm">No recent events</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigGroup({ title, children }: any) {
  return (
    <div className="border-b border-white/5 pb-4 last:border-0">
      <h4 className="font-bold text-sm text-secondary mb-3 text-glow-sm">{title}</h4>
      <div className="grid grid-cols-1 gap-2">
        {children}
      </div>
    </div>
  )
}

function ConfigRow({ label, value }: any) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted text-glow-sm">{label}</span>
      <span className="font-mono text-white text-glow">{value}</span>
    </div>
  )
}

function HealthItem({ icon, label, value, color }: any) {
  return (
    <div className="flex items-center gap-3 bg-black/20 p-3 rounded-lg">
      <div className="text-muted">{icon}</div>
      <div>
        <div className="text-xs text-muted text-glow-sm">{label}</div>
        <div className={clsx("font-mono font-medium text-glow", color || "text-white")}>{value}</div>
      </div>
    </div>
  )
}

function formatUptime(ms: number) {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  
  if (day > 0) return `${day}d ${hr % 24}h`;
  if (hr > 0) return `${hr}h ${min % 60}m`;
  return `${min}m ${sec % 60}s`;
}
