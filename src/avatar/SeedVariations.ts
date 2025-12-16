// SeedVariations.ts
export function rand(seed: number, offset = 0): number {
  // Simple pseudo-random number generator based on seed
  // Returns a number between 0 and 1
  return Math.abs(Math.sin(seed * 997 + offset)) % 1;
}

export function seededRange(
  seed: number,
  min: number,
  max: number,
  offset = 0
): number {
  return min + rand(seed, offset) * (max - min);
}