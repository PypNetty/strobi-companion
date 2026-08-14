export type MediaDeviceLike = {
  kind: string
  label: string
  deviceId: string
}

export type PickedCamera = {
  device: MediaDeviceLike | null
  preferred: boolean
}

const PREFERRED_CAMERA_PATTERN = /hd\s*pro\s*webcam(?:\s*c920)?|\bc920\b/i

export const isPreferredCameraLabel = (label: string) => PREFERRED_CAMERA_PATTERN.test(label)

export const pickVideoDevice = (devices: readonly MediaDeviceLike[]): PickedCamera => {
  const cameras = devices.filter(device => device.kind === 'videoinput')
  const preferred = cameras.find(device => isPreferredCameraLabel(device.label))
  if (preferred) return { device: preferred, preferred: true }
  return { device: cameras[0] ?? null, preferred: false }
}
