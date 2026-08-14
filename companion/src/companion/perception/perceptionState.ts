export type PerceptionState = {
  faceDetected: boolean
  normalizedFaceX: number
  normalizedFaceY: number
  approximateDistance?: number
  lastSeenAt?: number
}

export const emptyPerception = (now = 0): PerceptionState => ({
  faceDetected: false,
  normalizedFaceX: 0,
  normalizedFaceY: 0,
  lastSeenAt: now || undefined,
})
