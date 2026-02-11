import React, { MouseEvent, useRef } from 'react';
import { motion, useAnimation, HTMLMotionProps } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TRANSITION_SPRING_BOUNCY } from '../../lib/motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface RippleButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'danger' | 'surface';
  children: React.ReactNode;
}

export function RippleButton({ children, className, variant = 'surface', onClick, ...props }: RippleButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const controls = useAnimation();
  
  const handleClick = async (e: MouseEvent<HTMLButtonElement>) => {
    // Fire the external onClick first
    if (onClick) onClick(e);

    // Trigger a small scale animation
    controls.start({
      scale: 0.97,
      transition: { duration: 0.1, ease: "easeInOut" }
    }).then(() => {
      controls.start({
        scale: 1,
        transition: TRANSITION_SPRING_BOUNCY
      });
    });
  };

  const variants = {
    primary: "bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30",
    danger: "bg-danger/20 border border-danger/50 text-danger hover:bg-danger/30",
    surface: "bg-white/5 border border-white/10 text-text hover:bg-white/10",
  };

  return (
    <motion.button
      ref={buttonRef}
      animate={controls}
      onClick={handleClick}
      className={cn(
        "relative rounded-xl px-6 py-3 font-semibold tracking-wide shadow-md transition-all select-none overflow-hidden",
        "active:shadow-inner text-glow",
        variants[variant],
        className
      )}
      style={{ zIndex: 1 }}
      {...props}
    >
      <span className="relative z-10 flex items-center justify-center gap-2 pointer-events-none">{children}</span>
    </motion.button>
  );
}
