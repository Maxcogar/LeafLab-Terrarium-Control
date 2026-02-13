
export function calculateTDS(raw: number): number {
  // TDS_FACTOR from firmware config is 0.5
  return raw * 0.5;
}

export function calculatePH(raw: number): number {
  // pH sensor typically centered at 2048 (1.65V) for pH 7.0
  // Slope approx -59mV/pH -> ~73.5 ADC units per pH
  // Formula: pH = 7 + (2048 - raw) / 73.5
  return 7 + (2048 - raw) / 73.5;
}

// Format helpers for UI display
export function formatTDS(value: number): string {
  return value.toFixed(0);
}

export function formatPH(value: number): string {
  return value.toFixed(2);
}
