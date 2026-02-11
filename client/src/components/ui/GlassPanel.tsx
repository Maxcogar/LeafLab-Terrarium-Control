import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface GlassPanelProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  intensity?: 'low' | 'medium' | 'high';
}

export function GlassPanel({ children, className, intensity = 'medium', ...props }: GlassPanelProps) {
  const intensities = {
    low: 'bg-black/20 border-white/5',
    medium: 'bg-black/40 border-white/10',
    high: 'bg-black/60 border-white/20',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "backdrop-blur-md rounded-2xl border shadow-lg relative overflow-hidden",
        intensities[intensity],
        className
      )}
      {...props}
    >
      {/* Subtle top gradient for "inner light" feel */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
      
      {children}
    </motion.div>
  );
}
