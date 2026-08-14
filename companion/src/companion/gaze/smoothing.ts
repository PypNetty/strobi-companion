export const exponentialApproach = (
  current: number,
  target: number,
  dtMs: number,
  timeConstantMs: number
) => {
  if (timeConstantMs <= 0) return target
  const alpha = 1 - Math.exp(-Math.max(dtMs, 0) / timeConstantMs)
  return current + (target - current) * alpha
}

export const clampUnit = (value: number, limit = 1) => Math.max(-limit, Math.min(limit, value))
