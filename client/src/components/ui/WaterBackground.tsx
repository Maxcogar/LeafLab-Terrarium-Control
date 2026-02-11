import React, { useMemo } from 'react';
import WaterWave from 'react-water-wave';

interface WaterBackgroundProps {
  children: React.ReactNode;
}

export const WaterBackground: React.FC<WaterBackgroundProps> = ({ children }) => {
  // Generate a subtle noise texture data URI
  const image = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dark background
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, 512, 512);

      // Add noise
      const imageData = ctx.getImageData(0, 0, 512, 512);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 15; // Subtle noise
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        data[i + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);
      
      // Add some subtle gradients for depth
      const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 512);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 512, 512);
    }
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden bg-background">
      <WaterWave
        imageUrl={image}
        dropRadius={25} // Size of the ripple
        perturbance={0.03} // Refraction strength (lower is more subtle)
        resolution={512} // Quality
        style={{ width: '100%', height: '100%' }}
      >
        {() => (
            <div className="relative w-full h-full">
                {children}
            </div>
        )}
      </WaterWave>
    </div>
  );
};
