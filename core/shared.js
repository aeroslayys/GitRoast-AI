// Shared formatting primitives. No network or scoring side effects.
export const day = 86400000;
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const fraction = (num, total) => total ? num / total : 0;
export const str = (v, max = 240) => typeof v === 'string' ? v.slice(0, max) : '';
