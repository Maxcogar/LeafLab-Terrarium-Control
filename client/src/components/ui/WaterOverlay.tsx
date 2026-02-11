import React, { useMemo, useEffect } from 'react';
import WaterWave from 'react-water-wave';

// == ADJUSTABLE RIPPLE PARAMETERS ==
const RIPPLE_CONFIG = {
  // Size of the ripple circle (20 = ~40px)
  DROP_RADIUS: 25, 
  // Visual intensity/refraction (0.01 = subtle, 0.05 = strong)
  // Kept low to avoid the "fog ring" look
  PERTURBANCE: 0.01,
  // Grid resolution (higher = smoother, lower = faster)
  RESOLUTION: 512,
  // Impact strength of the click (0 to 1)
  DROP_STRENGTH: 0.2,
};

export const WaterOverlay: React.FC = () => {
  // Generate a texture for the water simulation.
  // Using a neutral grey (#808080) with 'overlay' blend mode.
  // This makes the overlay invisible on the dark background 
  // until ripples distort the light/dark balance.
  const image = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Neutral grey for overlay blending
      ctx.fillStyle = '#808080'; 
      ctx.fillRect(0, 0, 512, 512);

      // Add subtle noise to catch the light
      const imageData = ctx.getImageData(0, 0, 512, 512);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Very subtle noise around the mid-point
        const noise = (Math.random() - 0.5) * 10; 
        const val = 128 + noise; 
        data[i] = val;     // R
        data[i + 1] = val; // G
        data[i + 2] = val; // B
        data[i + 3] = 255; // Alpha
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas.toDataURL('image/jpeg', 0.9);
  }, []);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none mix-blend-overlay opacity-60">
      <WaterWave
        imageUrl={image}
        dropRadius={RIPPLE_CONFIG.DROP_RADIUS}
        perturbance={RIPPLE_CONFIG.PERTURBANCE}
        resolution={RIPPLE_CONFIG.RESOLUTION}
        interactive={false}
        style={{ width: '100%', height: '100%' }}
      >
        {({ drop }) => (
          <GlobalRippleTrigger drop={drop} />
        )}
      </WaterWave>
    </div>
  );
};

// Helper component to attach global listeners
const GlobalRippleTrigger = ({ drop }: { drop: (opts: any) => void }) => {
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      drop({ 
        x: e.clientX, 
        y: e.clientY, 
        radius: RIPPLE_CONFIG.DROP_RADIUS,
        strength: RIPPLE_CONFIG.DROP_STRENGTH
      });
    };

    window.addEventListener('mousedown', handleGlobalClick);
    return () => window.removeEventListener('mousedown', handleGlobalClick);
  }, [drop]);

  return null;
};
