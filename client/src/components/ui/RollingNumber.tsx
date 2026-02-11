import { motion, useSpring, useTransform, MotionValue } from 'framer-motion';
import { useEffect } from 'react';
import clsx from 'clsx';

interface RollingNumberProps {
  value: number;
  toFixed?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

export function RollingNumber({ value, toFixed = 0, className, prefix = '', suffix = '' }: RollingNumberProps) {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => current.toFixed(toFixed));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return (
    <span className={clsx("text-glow", className)}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}
