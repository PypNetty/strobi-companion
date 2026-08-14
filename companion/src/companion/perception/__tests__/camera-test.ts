import { describeCameraError, isVideoSourceError } from '../cameraError'
import { isPreferredCameraLabel, pickVideoDevice } from '../cameraDevices'

describe('camera device picking', () => {
  it('selects the Logitech C920 when its label is present', () => {
    const picked = pickVideoDevice([
      { kind: 'audioinput', label: 'Microphone', deviceId: 'mic' },
      { kind: 'videoinput', label: 'Integrated Camera', deviceId: 'integrated' },
      { kind: 'videoinput', label: 'HD Pro Webcam C920', deviceId: 'c920' },
    ])
    expect(picked.preferred).toBe(true)
    expect(picked.device?.deviceId).toBe('c920')
  })

  it('matches shorter C920 labels case-insensitively', () => {
    expect(isPreferredCameraLabel('Logitech HD Pro Webcam')).toBe(true)
    expect(isPreferredCameraLabel('c920')).toBe(true)
    expect(isPreferredCameraLabel('Integrated Camera')).toBe(false)
  })

  it('falls back to the first camera when the C920 is missing', () => {
    const picked = pickVideoDevice([
      { kind: 'videoinput', label: 'Integrated Camera', deviceId: 'integrated' },
    ])
    expect(picked.preferred).toBe(false)
    expect(picked.device?.deviceId).toBe('integrated')
  })
})

describe('camera errors', () => {
  it('explains a busy camera in French', () => {
    const error = new DOMException('Device in use', 'NotReadableError')
    expect(describeCameraError(error)).toContain('Caméra déjà utilisée')
  })

  it('maps MediaPipe videosource failures', () => {
    expect(isVideoSourceError(new Error('Failed to allocate VideoSource'))).toBe(true)
    expect(describeCameraError(new Error('Failed to allocate videosource'))).toContain(
      'Caméra déjà utilisée'
    )
  })
})
