export type VoiceActivityOptions = {
  onVoice: () => void
  onError?: (message: string) => void
  threshold?: number
  holdMs?: number
}

let chain: Promise<void> = Promise.resolve()

const enqueue = (work: () => Promise<void>) => {
  const run = chain.then(work, work)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

export class VoiceActivityDetector {
  private onVoice: () => void
  private onError?: (message: string) => void
  private threshold: number
  private holdMs: number
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private data: Uint8Array | null = null
  private timer: number | null = null
  private generation = 0
  private running = false
  private lastVoiceAt = 0

  constructor(options: VoiceActivityOptions) {
    this.onVoice = options.onVoice
    this.onError = options.onError
    this.threshold = options.threshold ?? 0.03
    this.holdMs = options.holdMs ?? 240
  }

  get active() {
    return this.running
  }

  async resume() {
    const context = this.context
    if (!context) return
    if (context.state === 'suspended') await context.resume().catch(() => undefined)
  }

  async start() {
    await enqueue(() => this.startUnlocked())
  }

  async stop() {
    await enqueue(() => this.stopUnlocked())
  }

  private async startUnlocked() {
    if (this.running) return
    this.running = true
    const generation = ++this.generation
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (generation !== this.generation || !this.running) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      this.stream = stream
      const context = new AudioContext()
      this.context = context
      if (context.state === 'suspended') await context.resume()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      analyser.smoothingTimeConstant = 0.72
      source.connect(analyser)
      this.analyser = analyser
      this.data = new Uint8Array(new ArrayBuffer(analyser.fftSize))
      this.loop()
    } catch (error) {
      this.running = false
      await this.stopUnlocked()
      const denied =
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
      const message = denied
        ? 'Accès au micro refusé. La voix reste locale, rien n’est envoyé.'
        : 'Micro indisponible. La voix reste locale, rien n’est enregistré.'
      this.onError?.(message)
    }
  }

  private async stopUnlocked() {
    this.generation += 1
    this.running = false
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    this.analyser?.disconnect()
    this.analyser = null
    this.data = null
    this.stream?.getTracks().forEach(track => track.stop())
    this.stream = null
    if (this.context) {
      await this.context.close().catch(() => undefined)
      this.context = null
    }
  }

  private loop = () => {
    if (!this.running) return
    this.sample()
    this.timer = window.setTimeout(this.loop, 80)
  }

  private sample() {
    if (this.context?.state === 'suspended') void this.context.resume().catch(() => undefined)
    const analyser = this.analyser
    const data = this.data
    if (!analyser || !data) return
    analyser.getByteTimeDomainData(data as Uint8Array<ArrayBuffer>)
    let sum = 0
    for (const value of data) {
      const centered = (value - 128) / 128
      sum += centered * centered
    }
    const rms = Math.sqrt(sum / data.length)
    if (rms < this.threshold) return
    const now = Date.now()
    if (now - this.lastVoiceAt < this.holdMs) return
    this.lastVoiceAt = now
    this.onVoice()
  }
}
