export type LandmarkPoint = {
  x: number
  y: number
  z?: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const unitToSigned = (value: number) => clamp(value * 2 - 1, -1, 1)

export const mirrorNormalizedX = (x: number) => -x

export const faceCenterFromLandmarks = (landmarks: readonly LandmarkPoint[]) => {
  if (!landmarks.length) return { x: 0.5, y: 0.5 }
  const nose = landmarks[1]
  if (nose) return { x: nose.x, y: nose.y }
  const sum = landmarks.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), {
    x: 0,
    y: 0,
  })
  return { x: sum.x / landmarks.length, y: sum.y / landmarks.length }
}

export const faceExtent = (landmarks: readonly LandmarkPoint[]) => {
  if (landmarks.length < 2) return 0
  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0
  landmarks.forEach(point => {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  })
  return Math.max(maxX - minX, maxY - minY)
}

export const normalizeFace = (
  landmarks: readonly LandmarkPoint[],
  options: { mirrorX?: boolean; now?: number } = {}
) => {
  const center = faceCenterFromLandmarks(landmarks)
  const extent = faceExtent(landmarks)
  let x = unitToSigned(center.x)
  const y = -unitToSigned(center.y)
  if (options.mirrorX !== false) x = mirrorNormalizedX(x)
  return {
    faceDetected: true,
    normalizedFaceX: clamp(x, -1, 1),
    normalizedFaceY: clamp(y, -1, 1),
    approximateDistance: extent > 0 ? clamp(extent / 0.45, 0.15, 2.2) : undefined,
    lastSeenAt: options.now,
  }
}
