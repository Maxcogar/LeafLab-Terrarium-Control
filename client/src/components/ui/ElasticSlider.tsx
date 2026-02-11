import React, { useRef, useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { TRANSITION_SPRING_SMOOTH, TRANSITION_SPRING_BOUNCY } from '../../lib/motion';

interface ElasticSliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  unit?: string;
}

export function ElasticSlider({ value, min = 0, max = 100, step = 1, onChange, label, unit }: ElasticSliderProps) {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  
  // Calculate percentage for initial position
  const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1);
  
  // We'll trust the parent value for position, but animate interactions
  // In a real sophisticated slider, we'd use useDrag controls mapping to value
  // For simplicity + effect, we'll make a custom styled range input that feels "heavy"
  
  return (
    <div className="w-full flex flex-col gap-2">
      {(label || unit) && (
        <div className="flex justify-between text-sm text-muted px-1">
          <span className="text-glow-sm">{label}</span>
          <span className="font-mono text-primary text-glow">{value}{unit}</span>
        </div>
      )}
      
      <div className="relative h-12 flex items-center select-none touch-none" ref={constraintsRef}>
        {/* Track Background */}
        <div className="absolute w-full h-4 bg-surface/50 rounded-full overflow-hidden border border-white/5 shadow-inner backdrop-blur-sm">
           {/* Fill */}
           <motion.div 
             className="h-full bg-primary shadow-[0_0_15px_rgba(var(--color-primary),0.5)]"
             initial={{ width: `${percentage * 100}%` }}
             animate={{ width: `${percentage * 100}%` }}
             transition={TRANSITION_SPRING_SMOOTH}
             style={{
                boxShadow: `0 0 15px ${value > 0 ? '#4ade80' : 'transparent'}` // Using the primary color hex directly for now, or use CSS var if set
             }}
           />
        </div>

        {/* We use a real range input for logic, but hide it and overlay the visual handle */}
        <input 
          type="range" 
          min={min} 
          max={max} 
          step={step} 
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full h-full opacity-0 z-20 cursor-pointer"
          onMouseDown={() => setActive(true)}
          onMouseUp={() => setActive(false)}
          onTouchStart={() => setActive(true)}
          onTouchEnd={() => setActive(false)}
        />

        {/* Visual Handle */}
        <motion.div
          className="absolute h-8 w-8 bg-black border-2 border-primary z-10 pointer-events-none flex items-center justify-center rounded-full"
          initial={{ left: `${percentage * 100}%` }}
          animate={{ 
            left: `calc(${percentage * 100}% - 16px)`, // center the 32px handle
            scale: active ? 1.2 : 1,
            boxShadow: active ? "0 0 25px #4ade80" : "0 0 10px #4ade80"
          }}
          transition={TRANSITION_SPRING_BOUNCY}
        >
          <div className="w-2 h-2 bg-primary rounded-full shadow-[0_0_5px_#4ade80]" />
        </motion.div>
      </div>
    </div>
  );
}
