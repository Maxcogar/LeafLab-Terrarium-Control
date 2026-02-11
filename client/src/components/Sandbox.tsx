import React, { useState } from 'react';
import { GlassPanel } from './ui/GlassPanel';
import { RippleButton } from './ui/RippleButton';
import { ElasticSlider } from './ui/ElasticSlider';
import { RollingNumber } from './ui/RollingNumber';
import { WaterOverlay } from './ui/WaterOverlay';
import { Activity, Power, Zap, Droplets } from 'lucide-react';

export function Sandbox() {
  const [sliderValue, setSliderValue] = useState(50);
  const [count, setCount] = useState(1234);

  return (
    <div className="p-8 min-h-full bg-gradient-to-br from-background via-gray-900 to-black text-text space-y-12 relative">
      <WaterOverlay />
      
      <header className="mb-8">
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-white mb-2 text-glow">
          UI Component Sandbox
        </h1>
        <p className="text-muted text-glow-sm">Testing ground for "Alive" interface elements.</p>
      </header>

      {/* Section 1: Glass Panels & Depth */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-glow"><Activity /> Glassmorphism & Depth</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassPanel intensity="low" className="p-6 h-40 flex flex-col justify-between">
            <span className="text-muted text-sm uppercase tracking-wider text-glow-sm">Low Intensity</span>
            <div className="text-2xl font-mono text-glow">Background Layer</div>
          </GlassPanel>
          <GlassPanel intensity="medium" className="p-6 h-40 flex flex-col justify-between">
            <span className="text-muted text-sm uppercase tracking-wider text-glow-sm">Medium Intensity</span>
            <div className="text-2xl font-mono text-glow">Standard Module</div>
          </GlassPanel>
          <GlassPanel intensity="high" className="p-6 h-40 flex flex-col justify-between">
             <span className="text-muted text-sm uppercase tracking-wider text-glow-sm">High Intensity</span>
             <div className="text-2xl font-mono text-glow">Floating Modal</div>
          </GlassPanel>
        </div>
      </section>

      {/* Section 2: Interactive Physics */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-glow"><Zap /> Interactive Physics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <GlassPanel className="p-8 space-y-8">
            <h3 className="text-lg font-medium text-muted text-glow-sm">Elastic Sliders</h3>
            <ElasticSlider 
              value={sliderValue} 
              onChange={setSliderValue} 
              label="Target Temperature" 
              unit="°C"
              min={0}
              max={100}
            />
            <ElasticSlider 
              value={100 - sliderValue} 
              onChange={(v) => setSliderValue(100 - v)} 
              label="Fan Speed" 
              unit="%"
            />
          </GlassPanel>

          <GlassPanel className="p-8 space-y-8">
             <h3 className="text-lg font-medium text-muted text-glow-sm">Rolling Numbers</h3>
             <div className="flex items-end gap-4">
                <div className="flex flex-col">
                  <span className="text-sm text-muted text-glow-sm">Sensor Value</span>
                  <RollingNumber 
                    value={sliderValue} 
                    toFixed={1} 
                    className="text-6xl font-bold font-mono text-primary text-glow" 
                    suffix="°"
                  />
                </div>
                <div className="flex flex-col pb-2">
                   <span className="text-sm text-muted text-glow-sm">Live Count</span>
                   <RollingNumber 
                     value={count} 
                     className="text-2xl font-mono text-white text-glow"
                   />
                </div>
             </div>
             <div className="flex gap-4">
               <RippleButton onClick={() => setCount(c => c + 100)} variant="surface">+100</RippleButton>
               <RippleButton onClick={() => setCount(c => c + Math.random() * 1000)} variant="primary">Random Add</RippleButton>
             </div>
          </GlassPanel>
        </div>
      </section>

      {/* Section 3: Tactile Buttons */}
      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-glow"><Power /> Tactile Controls</h2>
        <div className="flex flex-wrap gap-4">
          <RippleButton variant="surface">Generic Action</RippleButton>
          <RippleButton variant="primary" className="shadow-primary/20">Primary Action</RippleButton>
          <RippleButton variant="danger" className="shadow-danger/20">Emergency Stop</RippleButton>
          
          <GlassPanel className="p-1 rounded-xl inline-flex gap-1 ml-8">
             <button className="px-4 py-2 rounded-lg bg-primary/20 text-primary font-medium hover:bg-primary/30 transition-colors text-glow">Auto</button>
             <button className="px-4 py-2 rounded-lg hover:bg-white/5 transition-colors text-glow-sm">Manual</button>
          </GlassPanel>
        </div>
      </section>

    </div>
  );
}
