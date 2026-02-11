declare module 'react-water-wave' {
  import * as React from 'react';

  export interface WaterWaveProps {
    imageUrl?: string;
    dropRadius?: number;
    perturbance?: number;
    resolution?: number;
    interactive?: boolean;
    crossOrigin?: string;
    style?: React.CSSProperties;
    children?: (props: {
      pause: () => void;
      play: () => void;
      hide: () => void;
      show: () => void;
      drop: (options: { x: number; y: number; radius: number; strength: number }) => void;
      destroy: () => void;
    }) => React.ReactNode;
  }

  const WaterWave: React.FC<WaterWaveProps>;
  export default WaterWave;
}
