export type ScreenPoint = { x: number; y: number }
export type ScreenRect = { x: number; y: number; width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const gazeFromScreenCursor = (
  cursor: ScreenPoint,
  windowRect: ScreenRect,
  scalePx = 480
) => {
  const centerX = windowRect.x + windowRect.width / 2
  const centerY = windowRect.y + windowRect.height / 2
  const scale = Math.max(scalePx, Math.max(windowRect.width, windowRect.height))
  return {
    x: clamp((cursor.x - centerX) / scale, -1, 1),
    y: clamp(-(cursor.y - centerY) / scale, -1, 1),
  }
}

export const gazeFromWindowDelta = (dx: number, dy: number, scalePx = 72) => {
  const distance = Math.hypot(dx, dy)
  if (distance < 1e-6) return { x: 0, y: 0 }
  const amount = clamp(Math.max(distance / scalePx, 0.42), 0, 0.9)
  return {
    x: clamp((dx / distance) * amount, -1, 1),
    y: clamp((-dy / distance) * amount, -1, 1),
  }
}
