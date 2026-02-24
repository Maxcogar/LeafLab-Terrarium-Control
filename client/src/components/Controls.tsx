import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Power, RotateCcw, Activity, Lock, Unlock, Clock, X } from 'lucide-react';
import clsx from 'clsx';
import { Outputs, TimedOverrideInfo } from '../types';

const TIMER_PRESETS = [
  { label: '5m', ms: 5 * 60_000 },
  { label: '15m', ms: 15 * 60_000 },
  { label: '30m', ms: 30 * 60_000 },
  { label: '1h', ms: 60 * 60_000 },
  { label: '2h', ms: 120 * 60_000 },
  { label: '4h', ms: 240 * 60_000 },
];

export function Controls() {
  const { telemetry, sendCommand, overrideTimers, cancelOverrideTimer } = useStore();

  if (!telemetry) return <div className="p-10 text-center text-muted">Waiting for telemetry...</div>;

  const { outputs, control } = telemetry;
  const isOverride = control.manualOverride;

  const getTimer = (output: keyof Outputs): TimedOverrideInfo | undefined =>
    overrideTimers.find(t => t.output === output);

  const setTimedOverride = (output: keyof Outputs, value: number | boolean, durationMs: number) => {
    sendCommand({ action: 'set', output, value, duration: durationMs });
  };

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
            <p className="text-xs text-muted">
              {isOverride
                ? overrideTimers.length > 0
                  ? `Active - ${overrideTimers.length} timed override${overrideTimers.length > 1 ? 's' : ''} running`
                  : 'Active - Auto logic suspended'
                : 'Inactive - System is automatic'}
            </p>
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
        <div className="bg-surface rounded-2xl p-6 border border-white/5 space-y-2">
          <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-4">Switches</h3>
          <Toggle
            label="Grow Lights"
            outputKey="growLights"
            checked={outputs.growLights}
            timer={getTimer('growLights')}
            onChange={(v) => sendCommand({ action: 'set', output: 'growLights', value: v })}
            onTimerSet={(dur) => setTimedOverride('growLights', true, dur)}
            onTimerCancel={() => cancelOverrideTimer('growLights')}
          />
          <Toggle
            label="Water Pump"
            outputKey="waterPump"
            checked={outputs.waterPump}
            timer={getTimer('waterPump')}
            onChange={(v) => sendCommand({ action: 'set', output: 'waterPump', value: v })}
            onTimerSet={(dur) => setTimedOverride('waterPump', true, dur)}
            onTimerCancel={() => cancelOverrideTimer('waterPump')}
          />
          <Toggle
            label="Humidifier 1"
            outputKey="humidifier1"
            checked={outputs.humidifier1}
            timer={getTimer('humidifier1')}
            onChange={(v) => sendCommand({ action: 'set', output: 'humidifier1', value: v })}
            onTimerSet={(dur) => setTimedOverride('humidifier1', true, dur)}
            onTimerCancel={() => cancelOverrideTimer('humidifier1')}
          />
          <Toggle
            label="Humidifier 2"
            outputKey="humidifier2"
            checked={outputs.humidifier2}
            timer={getTimer('humidifier2')}
            onChange={(v) => sendCommand({ action: 'set', output: 'humidifier2', value: v })}
            onTimerSet={(dur) => setTimedOverride('humidifier2', true, dur)}
            onTimerCancel={() => cancelOverrideTimer('humidifier2')}
          />
        </div>

        {/* Sliders */}
        <div className="bg-surface rounded-2xl p-6 border border-white/5 space-y-4">
          <h3 className="text-xs font-bold uppercase text-muted tracking-wider mb-4">Variable Control</h3>
          <SliderControl
            label="Fan Speed"
            outputKey="fanSpeed"
            value={outputs.fanSpeed}
            max={255}
            unit=""
            timer={getTimer('fanSpeed')}
            onChange={(v) => sendCommand({ action: 'set', output: 'fanSpeed', value: v })}
            onTimerSet={(val, dur) => setTimedOverride('fanSpeed', val, dur)}
            onTimerCancel={() => cancelOverrideTimer('fanSpeed')}
          />
          <SliderControl
            label="Heater Power"
            outputKey="heaterPower"
            value={outputs.heaterPower}
            max={255}
            unit=""
            color="accent"
            timer={getTimer('heaterPower')}
            onChange={(v) => sendCommand({ action: 'set', output: 'heaterPower', value: v })}
            onTimerSet={(val, dur) => setTimedOverride('heaterPower', val, dur)}
            onTimerCancel={() => cancelOverrideTimer('heaterPower')}
          />
          <SliderControl
            label="Vent 1 Angle"
            outputKey="servo1Angle"
            value={outputs.servo1Angle}
            max={180}
            unit="°"
            timer={getTimer('servo1Angle')}
            onChange={(v) => sendCommand({ action: 'set', output: 'servo1Angle', value: v })}
            onTimerSet={(val, dur) => setTimedOverride('servo1Angle', val, dur)}
            onTimerCancel={() => cancelOverrideTimer('servo1Angle')}
          />
          <SliderControl
            label="Vent 2 Angle"
            outputKey="servo2Angle"
            value={outputs.servo2Angle}
            max={180}
            unit="°"
            timer={getTimer('servo2Angle')}
            onChange={(v) => sendCommand({ action: 'set', output: 'servo2Angle', value: v })}
            onTimerSet={(val, dur) => setTimedOverride('servo2Angle', val, dur)}
            onTimerCancel={() => cancelOverrideTimer('servo2Angle')}
          />
        </div>
      </div>
    </div>
  );
}

// ── Countdown Display ──────────────────────────────────────────────

function Countdown({ expiresAt, onCancel }: { expiresAt: number; onCancel: () => void }) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      const r = Math.max(0, expiresAt - Date.now());
      setRemaining(r);
      if (r <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  const timeStr = hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs font-mono text-primary bg-primary/20 px-2 py-0.5 rounded">
        {timeStr}
      </span>
      <button
        onClick={onCancel}
        className="text-muted hover:text-danger p-0.5 rounded transition-colors"
        title="Cancel timer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Timer Picker ───────────────────────────────────────────────────

function TimerPicker({ onSelect, onClose }: { onSelect: (ms: number) => void; onClose: () => void }) {
  const [customMin, setCustomMin] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-1">
      {TIMER_PRESETS.map(p => (
        <button
          key={p.label}
          onClick={() => onSelect(p.ms)}
          className="bg-primary/15 hover:bg-primary/30 text-primary text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
        >
          {p.label}
        </button>
      ))}
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="min"
          value={customMin}
          onChange={e => setCustomMin(e.target.value)}
          className="w-14 bg-black/30 border border-white/10 rounded-lg text-xs text-center py-1 px-1.5 text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50"
          min={1}
        />
        <button
          onClick={() => {
            const m = parseInt(customMin);
            if (m > 0) onSelect(m * 60_000);
          }}
          className="bg-primary/15 hover:bg-primary/30 text-primary text-xs font-bold px-2 py-1 rounded-lg transition-colors"
        >
          Set
        </button>
      </div>
      <button
        onClick={onClose}
        className="text-muted hover:text-text p-1 rounded transition-colors ml-auto"
        title="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Toggle with Timer ──────────────────────────────────────────────

interface ToggleProps {
  label: string;
  outputKey: keyof Outputs;
  checked: boolean;
  timer?: TimedOverrideInfo;
  onChange: (v: boolean) => void;
  onTimerSet: (durationMs: number) => void;
  onTimerCancel: () => void;
}

function Toggle({ label, checked, timer, onChange, onTimerSet, onTimerCancel }: ToggleProps) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between p-2">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {timer ? (
            <Countdown expiresAt={timer.expiresAt} onCancel={onTimerCancel} />
          ) : (
            <button
              onClick={() => setShowPicker(!showPicker)}
              className={clsx(
                "p-1.5 rounded-lg transition-colors",
                showPicker ? "bg-primary/20 text-primary" : "text-muted hover:text-text hover:bg-white/5"
              )}
              title="Set timer"
            >
              <Clock size={16} />
            </button>
          )}
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
      </div>
      {showPicker && !timer && (
        <div className="px-2">
          <TimerPicker
            onSelect={(ms) => { onTimerSet(ms); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}

// ── Slider with Timer ──────────────────────────────────────────────

interface SliderProps {
  label: string;
  outputKey: keyof Outputs;
  value: number;
  max: number;
  unit: string;
  color?: string;
  timer?: TimedOverrideInfo;
  onChange: (v: number) => void;
  onTimerSet: (value: number, durationMs: number) => void;
  onTimerCancel: () => void;
}

function SliderControl({ label, value, max, unit, onChange, color, timer, onTimerSet, onTimerCancel }: SliderProps) {
  const [localVal, setLocalVal] = useState(value);
  const [dragging, setDragging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

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
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="text-muted">{label}</span>
        <div className="flex items-center gap-2">
          {timer ? (
            <Countdown expiresAt={timer.expiresAt} onCancel={onTimerCancel} />
          ) : (
            <button
              onClick={() => setShowPicker(!showPicker)}
              className={clsx(
                "p-1 rounded-lg transition-colors",
                showPicker ? "bg-primary/20 text-primary" : "text-muted hover:text-text hover:bg-white/5"
              )}
              title="Set timer"
            >
              <Clock size={14} />
            </button>
          )}
          <span className="font-mono">{localVal}{unit}</span>
        </div>
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
      {showPicker && !timer && (
        <TimerPicker
          onSelect={(ms) => { onTimerSet(localVal, ms); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
