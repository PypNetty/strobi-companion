import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CompanionSession, type CompanionStatus } from '../companion/session'

const initialStatus: CompanionStatus = {
  state: 'idle',
  tracking: true,
  faceDetected: false,
  voiceEnabled: true,
  voiceUnlocked: false,
  speaking: false,
  listening: false,
  ttsEngine: 'sapi',
  brain: 'keywords',
  expanded: false,
  localOnly: true,
}

const isTauri = () => '__TAURI_INTERNALS__' in window

export function App() {
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<CompanionSession | null>(null)
  const [status, setStatus] = useState(initialStatus)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let cancelled = false
    const session = new CompanionSession(host, { onStatus: setStatus })
    sessionRef.current = session
    void session.start().then(() => {
      if (cancelled) void session.destroy()
    })

    const unlistenPromise = isTauri()
      ? import('@tauri-apps/api/event').then(async ({ listen }) => {
          const stopTracking = await listen('companion://toggle-tracking', () => {
            void session.setTracking(!session.isTracking)
          })
          const stopVoice = await listen('companion://toggle-voice', () => {
            void session.setVoiceEnabled(!session.isVoiceEnabled)
          })
          const stopVisibility = await listen<boolean>('companion://visibility', event => {
            void session.setSuspended(!event.payload)
          })
          return () => {
            stopTracking()
            stopVoice()
            stopVisibility()
          }
        })
      : Promise.resolve(() => undefined)

    return () => {
      cancelled = true
      void unlistenPromise.then(unlisten => unlisten())
      void session.destroy()
      sessionRef.current = null
    }
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('button')) return
    sessionRef.current?.unlockInteraction()
    if (!isTauri()) return
    void getCurrentWindow().startDragging()
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current
    const host = hostRef.current
    if (!session || !host || isTauri()) return
    const rect = host.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    session.setPointer({ active: true, x, y })
  }

  const onPointerLeave = () => {
    if (isTauri()) return
    sessionRef.current?.setPointer({ active: false, x: 0, y: 0 })
  }

  const cameraLabel = status.tracking ? 'Couper la caméra' : 'Activer la caméra'
  const micLabel = status.voiceEnabled ? 'Couper le micro' : 'Activer le micro'
  const listenCue = !status.voiceEnabled
    ? 'is-off'
    : status.listenError
      ? 'is-error'
      : status.listening
        ? 'is-live'
        : 'is-wait'

  return (
    <main className={`shell ${status.expanded ? 'is-awake' : 'is-tiny'}`}>
      <div
        className="stage"
        ref={hostRef}
        data-tauri-drag-region
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
      <div className={`listen-cue ${listenCue}`} aria-hidden="true" />
      <div className="controls" data-tauri-drag-region="false">
        <button
          type="button"
          className={`icon-toggle ${status.tracking ? 'on' : 'off'}`}
          aria-label={cameraLabel}
          title={cameraLabel}
          onPointerDown={event => event.stopPropagation()}
          onClick={() => void sessionRef.current?.setTracking(!status.tracking)}
        >
          <CameraIcon off={!status.tracking} />
        </button>
        <button
          type="button"
          className={`icon-toggle ${status.voiceEnabled ? 'on' : 'off'}`}
          aria-label={micLabel}
          title={micLabel}
          onPointerDown={event => event.stopPropagation()}
          onClick={() => void sessionRef.current?.setVoiceEnabled(!status.voiceEnabled)}
        >
          <MicIcon off={!status.voiceEnabled} />
        </button>
      </div>
    </main>
  )
}

const CameraIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h7A2.5 2.5 0 0 1 16 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 4 15.5v-7Z" />
    <path d="M16 10.2 20.2 8v8L16 13.8V10.2Z" />
    {off ? <path d="M3 4.2 20.8 20" /> : null}
  </svg>
)

const MicIcon = ({ off }: { off: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="3.5" width="6" height="10" rx="3" />
    <path d="M7 11.5a5 5 0 0 0 10 0M12 16.5v3.2M9 20.2h6" />
    {off ? <path d="M3 4.2 20.8 20" /> : null}
  </svg>
)
