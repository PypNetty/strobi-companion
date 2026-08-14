import { describeCameraError, isVideoSourceError } from './cameraError'
import { isPreferredCameraLabel, pickVideoDevice } from './cameraDevices'
import { emptyPerception, type PerceptionState } from './perceptionState'
import { normalizeFace, type LandmarkPoint } from './normalization'

export type CameraDeviceInfo = {
  label: string
  preferred: boolean
}

export type FaceTrackerOptions = {
  fps?: number
  sleepingFps?: number
  lostGraceMs?: number
  onPerception: (state: PerceptionState) => void
  onError?: (message: string) => void
  onDevice?: (info: CameraDeviceInfo) => void
}

type Landmarker = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number
  ) => { faceLandmarks?: LandmarkPoint[][] }
  close: () => void
}

let cameraChain: Promise<void> = Promise.resolve()
let cameraOwner: FaceTracker | null = null

const enqueue = (work: () => Promise<void>) => {
  const run = cameraChain.then(work, work)
  cameraChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

const stopStream = (stream: MediaStream) => {
  stream.getTracks().forEach(track => track.stop())
}

const delay = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms))

const openCamera = async (deviceId?: string) => {
  if (!deviceId) {
    return navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { exact: deviceId } },
    })
  } catch {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { deviceId: { ideal: deviceId } },
    })
  }
}

const requestCamera = async (): Promise<{ stream: MediaStream } & CameraDeviceInfo> => {
  let devices = await navigator.mediaDevices.enumerateDevices()
  let picked = pickVideoDevice(devices)
  if (!picked.preferred) {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    stopStream(probe)
    await delay(80)
    devices = await navigator.mediaDevices.enumerateDevices()
    picked = pickVideoDevice(devices)
  }

  const stream = await openCamera(picked.device?.deviceId).catch(() =>
    navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  )
  const label =
    stream.getVideoTracks()[0]?.label || picked.device?.label || 'Caméra par défaut'
  return {
    stream,
    label,
    preferred: picked.preferred || isPreferredCameraLabel(label),
  }
}

const waitForVideoFrame = (video: HTMLVideoElement, generation: number, owner: FaceTracker) =>
  new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('La webcam n’a pas fourni d’image.'))
    }, 4000)
    const onReady = () => {
      if (!owner.active || generation !== owner.generation) {
        cleanup()
        reject(new Error('cancelled'))
        return
      }
      if (video.readyState >= 2 && video.videoWidth > 0) {
        cleanup()
        resolve()
      }
    }
    const cleanup = () => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('playing', onReady)
    }
    video.addEventListener('loadeddata', onReady)
    video.addEventListener('playing', onReady)
    onReady()
  })

export class FaceTracker {
  readonly generationRef = { value: 0 }
  private fps: number
  private sleepingFps: number
  private lostGraceMs: number
  private onPerception: (state: PerceptionState) => void
  private onError?: (message: string) => void
  private onDevice?: (info: CameraDeviceInfo) => void
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private landmarker: Landmarker | null = null
  private timer: number | null = null
  private running = false
  private reduced = false
  private lastSeenAt = 0
  private lastLostEmitted = true
  private recoveredAllocate = false

  constructor(options: FaceTrackerOptions) {
    this.fps = options.fps ?? 15
    this.sleepingFps = options.sleepingFps ?? 5
    this.lostGraceMs = options.lostGraceMs ?? 350
    this.onPerception = options.onPerception
    this.onError = options.onError
    this.onDevice = options.onDevice
  }

  get active() {
    return this.running
  }

  get generation() {
    return this.generationRef.value
  }

  setReducedRate(reduced: boolean) {
    this.reduced = reduced
  }

  async start() {
    await enqueue(() => this.startUnlocked())
  }

  async stop() {
    await enqueue(() => this.stopUnlocked())
  }

  private async startUnlocked() {
    if (this.running) return
    if (cameraOwner && cameraOwner !== this) await cameraOwner.stopInternal()
    this.running = true
    const generation = ++this.generationRef.value
    try {
      const opened = await requestCamera()
      if (!this.stillCurrent(generation)) {
        stopStream(opened.stream)
        this.running = false
        return
      }
      this.stream = opened.stream
      this.onDevice?.(opened)
      const video = document.createElement('video')
      video.autoplay = true
      video.muted = true
      video.playsInline = true
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.style.cssText =
        'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'
      video.srcObject = opened.stream
      document.body.appendChild(video)
      this.video = video
      await video.play()
      await waitForVideoFrame(video, generation, this)
      if (!this.stillCurrent(generation)) {
        await this.stopInternal()
        return
      }
      this.landmarker = await createLandmarker('CPU')
      if (!this.stillCurrent(generation)) {
        await this.stopInternal()
        return
      }
      cameraOwner = this
      this.loop()
    } catch (error) {
      this.running = false
      await this.stopInternal()
      if (String(error).includes('cancelled')) return
      this.onError?.(describeCameraError(error))
    }
  }

  private async stopUnlocked() {
    await this.stopInternal()
  }

  private async stopInternal() {
    this.generationRef.value += 1
    this.running = false
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    this.landmarker?.close()
    this.landmarker = null
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    if (this.video) {
      this.video.pause()
      this.video.srcObject = null
      this.video.remove()
      this.video = null
    }
    this.lastLostEmitted = true
    this.recoveredAllocate = false
    if (cameraOwner === this) cameraOwner = null
    this.onPerception(emptyPerception())
  }

  private stillCurrent(generation: number) {
    return this.running && this.generationRef.value === generation
  }

  private loop = () => {
    if (!this.running) return
    this.sample()
    const delay = 1000 / (this.reduced ? this.sleepingFps : this.fps)
    this.timer = window.setTimeout(this.loop, delay)
  }

  private sample() {
    const video = this.video
    const landmarker = this.landmarker
    if (!video || !landmarker || video.readyState < 2 || video.videoWidth <= 0) return
    if (video.paused) void video.play().catch(() => undefined)
    const now = performance.now()
    let result: { faceLandmarks?: LandmarkPoint[][] }
    try {
      result = landmarker.detectForVideo(video, now)
    } catch (error) {
      if (isVideoSourceError(error) && !this.recoveredAllocate) {
        this.recoveredAllocate = true
        void this.recoverVideoSource()
        return
      }
      if (isVideoSourceError(error)) this.onError?.(describeCameraError(error))
      return
    }
    const landmarks = result.faceLandmarks?.[0]
    if (landmarks?.length) {
      this.lastSeenAt = now
      this.lastLostEmitted = false
      this.onPerception(normalizeFace(landmarks, { now: Date.now() }))
      return
    }
    if (!this.lastLostEmitted && now - this.lastSeenAt >= this.lostGraceMs) {
      this.lastLostEmitted = true
      this.onPerception(emptyPerception(Date.now()))
    }
  }

  private async recoverVideoSource() {
    const generation = this.generationRef.value
    await new Promise(resolve => window.setTimeout(resolve, 220))
    if (!this.stillCurrent(generation) || !this.video) return
    try {
      if (this.video.paused) await this.video.play()
      await waitForVideoFrame(this.video, generation, this)
      this.landmarker?.close()
      this.landmarker = await createLandmarker('CPU')
    } catch (error) {
      if (!this.stillCurrent(generation)) return
      this.onError?.(describeCameraError(error))
    }
  }
}

const createLandmarker = async (delegate: 'CPU' | 'GPU'): Promise<Landmarker> => {
  const vision = await import('@mediapipe/tasks-vision')
  const wasmRoot = new URL('/mediapipe/wasm', window.location.href).toString()
  const fileset = await vision.FilesetResolver.forVisionTasks(wasmRoot)
  const modelAssetPath = new URL('/models/face_landmarker.task', window.location.href).toString()
  try {
    return await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  } catch (error) {
    if (delegate === 'GPU') throw error
    return vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  }
}
