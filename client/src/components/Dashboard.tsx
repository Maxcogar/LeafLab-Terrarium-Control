import React from 'react';
import { useStore } from '../store';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import clsx from 'clsx';
import { Fan, Droplets, Lightbulb, Thermometer, Wind } from 'lucide-react';

export function Dashboard() {
  const { telemetry, sparklines } = useStore();

  if (!telemetry) return <div className="p-10 text-center text-muted">Waiting for data...</div>;

  const { sensors, outputs } = telemetry;

  return (
    <div className="grid grid-cols-3 gap-6 h-full">
      {/* Column 1: Primary Climate */}
      <div className="space-y-6">
        <SensorCard 
          label="Air Temp" 
          value={sensors.airTemp.value?.toFixed(1)} 
          unit="°F" 
          icon={<Thermometer size={20} />} 
          data={sparklines.airTemp} 
          color="#f472b6"
        />
        <SensorCard 
          label="Humidity" 
          value={sensors.airHumidity.value?.toFixed(1)} 
          unit="%" 
          icon={<Droplets size={20} />} 
          data={sparklines.airHumidity} 
          color="#60a5fa"
        />
        <SensorCard 
          label="VPD" 
          value="1.2" // Calculated field example, or derived
          unit="kPa" 
          icon={<Wind size={20} />} 
          color="#a78bfa"
          status="calculated"
        />
      </div>

      {/* Column 2: Soil & Light */}
      <div className="space-y-6">
        <SensorCard 
          label="Soil Moisture 1" 
          value={sensors.soilMoisture1.percent?.toFixed(0)} 
          unit="%" 
          data={sparklines.soilMoisture1} 
          color="#4ade80"
        />
        <SensorCard 
          label="Soil Moisture 2" 
          value={sensors.soilMoisture2.percent?.toFixed(0)} 
          unit="%" 
          data={sparklines.soilMoisture2} 
          color="#4ade80"
        />
        <SensorCard 
          label="Light" 
          value={sensors.light.value?.toFixed(0)} 
          unit="lux" 
          icon={<Lightbulb size={20} />} 
          data={sparklines.light} 
          color="#facc15"
        />
      </div>

      {/* Column 3: Status & Outputs */}
      <div className="bg-surface rounded-2xl p-6 border border-white/5 flex flex-col gap-4">
        <h3 className="text-muted uppercase text-xs font-bold tracking-wider mb-2">Active Outputs</h3>
        
        <OutputRow label="Grow Lights" active={outputs.growLights} icon={<Lightbulb size={18} />} />
        <OutputRow label="Water Pump" active={outputs.waterPump} icon={<Droplets size={18} />} />
        <OutputRow label="Humidifier 1" active={outputs.humidifier1} icon={<Wind size={18} />} />
        <OutputRow label="Humidifier 2" active={outputs.humidifier2} icon={<Wind size={18} />} />
        
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex justify-between items-center mb-2">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Fan size={16} /> Fan Speed
            </span>
            <span className="font-mono text-primary">{Math.round((outputs.fanSpeed / 255) * 100)}%</span>
          </div>
          <div className="h-2 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${(outputs.fanSpeed / 255) * 100}%` }} />
          </div>
        </div>

        <div className="mt-2">
           <div className="flex justify-between items-center mb-2">
            <span className="flex items-center gap-2 text-sm text-muted">
              <Thermometer size={16} /> Heater
            </span>
            <span className="font-mono text-danger">{Math.round((outputs.heaterPower / 255) * 100)}%</span>
          </div>
          <div className="h-2 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full bg-danger transition-all duration-300" style={{ width: `${(outputs.heaterPower / 255) * 100}%` }} />
          </div>
        </div>

      </div>
    </div>
  );
}

function SensorCard({ label, value, unit, icon, data, color, status }: any) {
  const chartData = data?.map((v: number, i: number) => ({ i, v })) || [];
  
  return (
    <div className="bg-surface rounded-2xl p-5 border border-white/5 relative overflow-hidden h-32 flex flex-col justify-between group">
      <div className="flex justify-between items-start z-10">
        <div className="flex items-center gap-2 text-muted text-sm font-medium">
          {icon}
          {label}
        </div>
        {status && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-muted">{status}</span>}
      </div>
      
      <div className="flex items-baseline gap-1 z-10">
        <span className="text-4xl font-bold tracking-tight text-white">{value ?? '--'}</span>
        <span className="text-muted font-medium">{unit}</span>
      </div>

      {/* Sparkline Background */}
      <div className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none translate-y-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line 
              type="monotone" 
              dataKey="v" 
              stroke={color || "#fff"} 
              strokeWidth={3} 
              dot={false} 
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function OutputRow({ label, active, icon }: any) {
  return (
    <div className={clsx(
      "flex items-center justify-between p-3 rounded-xl transition-all",
      active ? "bg-white/10 text-white" : "bg-black/20 text-muted"
    )}>
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className={clsx(
        "w-2.5 h-2.5 rounded-full",
        active ? "bg-primary shadow-[0_0_8px_rgba(74,222,128,0.6)]" : "bg-white/10"
      )} />
    </div>
  )
}
