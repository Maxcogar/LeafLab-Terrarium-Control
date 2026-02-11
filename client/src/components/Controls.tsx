import React, { useState } from 'react';
import { useStore } from '../store';
import { Power, RotateCcw, Activity, Lock, Unlock } from 'lucide-react';
import clsx from 'clsx';
import { Outputs } from '../types';

export function Controls() {
  const { telemetry, sendCommand } = useStore();

  if (!telemetry) return <div className="p-10 text-center text-muted">Waiting for telemetry...</div>;

  const { outputs, control } = telemetry;

  if (!outputs || !control) return <div className="p-10 text-center text-muted">Waiting for full telemetry...</div>;

  const isOverride = control.manualOverride;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header / System Controls */}
      <div className="flex justify-between items-center bg-surface p-4 rounded-2xl border border-white/5">
        <div className="flex items-center gap-3">
          <div className={clsx("p-2 rounded-lg", isOverride ? "bg-warning/20 text-warning" : "bg-white/5 text-muted")}>
            {isOverride ? <Lock size={20} /> : <Unlock size={20} />}
          </div>
          <div>
            <h2 className="font-bold">Manual Override</h2>
            <p className="text-xs text-muted">{isOverride ? 'Active - Auto logic suspended' : 'Inactive - System is automatic'}</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {isOverride && (
            <button 
              onClick={() => sendCommand({ action: 'release' })}
              className="bg-primary/20 hover:bg-primary/30 text-primary px-4 py-2 rounded-lg font-bold text-sm transition-colors"
            >
              Release Control
            </button>
          )}
          <button 
            onClick={() => sendCommand({ action: 'status' })}
            className="bg-white/5 hover:bg-white/10 text-text px-3 py-2 rounded-lg"
          >
            <Activity size={20} />
          </button>
          <button 
            onClick={() => {
              if (confirm('Reboot ESP32 controller?')) sendCommand({ action: 'reboot' });
            }}
            className="bg-danger/20 hover:bg-danger/30 text-danger px-3 py-2 rounded-lg"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 flex-1 overflow-y-auto">
        {/* Toggles */}
        <div className="bg-surface rounded-2xl p-6 border border-white/5 space-y-4">
          <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-4">Switches</h3>
          <Toggle 
            label="Grow Lights" 
            checked={outputs.growLights} 
            onChange={(v) => sendCommand({ action: 'set', output: 'growLights', value: v })} 
          />
          <Toggle 
            label="Water Pump" 
            checked={outputs.waterPump} 
            onChange={(v) => sendCommand({ action: 'set', output: 'waterPump', value: v })} 
          />
          <Toggle 
            label="Humidifier 1" 
            checked={outputs.humidifier1} 
            onChange={(v) => sendCommand({ action: 'set', output: 'humidifier1', value: v })} 
          />
          <Toggle 
            label="Humidifier 2" 
            checked={outputs.humidifier2} 
            onChange={(v) => sendCommand({ action: 'set', output: 'humidifier2', value: v })} 
          />
        </div>

        {/* Sliders */}
        <div className="bg-surface rounded-2xl p-6 border border-white/5 space-y-6">
          <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-4">Variable Control</h3>
          <Slider 
            label="Fan Speed" 
            value={outputs.fanSpeed} 
            max={255} 
            unit="" 
            onChange={(v) => sendCommand({ action: 'set', output: 'fanSpeed', value: v })} 
          />
          <Slider 
            label="Heater Power" 
            value={outputs.heaterPower} 
            max={255} 
            unit="" 
            color="accent"
            onChange={(v) => sendCommand({ action: 'set', output: 'heaterPower', value: v })} 
          />
          <Slider 
            label="Vent 1 Angle" 
            value={outputs.servo1Angle} 
            max={180} 
            unit="°" 
            onChange={(v) => sendCommand({ action: 'set', output: 'servo1Angle', value: v })} 
          />
          <Slider 
            label="Vent 2 Angle" 
            value={outputs.servo2Angle} 
            max={180} 
            unit="°" 
            onChange={(v) => sendCommand({ action: 'set', output: 'servo2Angle', value: v })} 
          />
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-2">
      <span className="font-medium">{label}</span>
      <button 
        onClick={() => onChange(!checked)}
        className={clsx(
          "w-14 h-8 rounded-full relative transition-colors duration-200",
          checked ? "bg-primary" : "bg-white/10"
        )}
      >
        <div className={clsx(
          "absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform duration-200 shadow-sm flex items-center justify-center",
          checked ? "translate-x-6" : "translate-x-0"
        )}>
          {checked && <Power size={14} className="text-primary" />}
        </div>
      </button>
    </div>
  );
}

function Slider({ label, value, max, unit, onChange, color }: { label: string, value: number, max: number, unit: string, onChange: (v: number) => void, color?: string }) {
  // Local state for smooth dragging, commit on mouseUp/touchEnd could be better but simplified here
  // Actually, for immediate feedback usually we want `onChange` to fire. 
  // But sending serial commands on every drag event is bad (floods buffer).
  // We should use onChangeEnd or debounce.
  // For this implementation, I'll use onChange (input) but maybe throttle in backend? 
  // No, better to throttle here or use onMouseUp.
  
  const [localVal, setLocalVal] = useState(value);
  const [dragging, setDragging] = useState(false);

  // Sync with prop when not dragging
  React.useEffect(() => {
    if (!dragging) setLocalVal(value);
  }, [value, dragging]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalVal(parseInt(e.target.value));
  };

  const handleCommit = () => {
    setDragging(false);
    onChange(localVal);
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-mono">{localVal}{unit}</span>
      </div>
      <input 
        type="range" 
        min="0" 
        max={max} 
        value={localVal} 
        onChange={handleChange}
        onMouseDown={() => setDragging(true)}
        onMouseUp={handleCommit}
        onTouchStart={() => setDragging(true)}
        onTouchEnd={handleCommit}
        className={clsx(
          "w-full h-2 bg-black/40 rounded-lg appearance-none cursor-pointer accent-primary",
          color === 'accent' && "accent-accent"
        )}
      />
    </div>
  );
}
