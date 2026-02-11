// The "Heartbeat" of the UI - Standardizing the physics

export const TRANSITION_SPRING_BOUNCY = {
  type: "spring",
  stiffness: 500,
  damping: 20,
  mass: 0.8
} as const;

export const TRANSITION_SPRING_SMOOTH = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 1
} as const;

export const TRANSITION_EASE_OUT = {
  duration: 0.4,
  ease: "easeOut"
} as const;

export const VARIANTS_ENTRY = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: TRANSITION_SPRING_SMOOTH
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.2 }
  }
};
