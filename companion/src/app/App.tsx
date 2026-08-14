import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { bundledAvatarName } from '../companion/avatar/catalog'
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

  const onPointerDown = async (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('button')) return
    sessionRef.current?.unlockInteraction()
    if (!isTauri()) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().startDragging()
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

  return (
    <main className="shell">
      <div
        className="stage"
        ref={hostRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
      <aside className="hud">
        <p className="name">{bundledAvatarName}</p>
        <p className="privacy">
          Caméra, micro, voix et réponses 100% locaux — rien n’est envoyé ni enregistré.
        </p>
        {status.voiceEnabled && !status.voiceUnlocked && !isTauri() ? (
          <p className="privacy">Clique sur le compagnon pour activer la voix.</p>
        ) : null}
        {status.cameraLabel ? (
          <p className="camera">
            {status.cameraPreferred
              ? `Caméra : ${status.cameraLabel}`
              : `Caméra : ${status.cameraLabel} — C920 introuvable`}
          </p>
        ) : null}
        <div className="hud-row">
          <span
            className={`dot ${status.faceDetected ? 'on' : ''} ${status.tracking ? '' : 'off'}`}
          />
          <span className="state">{labelFor(status)}</span>
          <button
            type="button"
            className="toggle"
            onClick={() => void sessionRef.current?.setTracking(!status.tracking)}
          >
            {status.tracking ? 'Couper la caméra' : 'Activer la caméra'}
          </button>
        </div>
        <div className="hud-row">
          <span
            className={`dot ${status.speaking ? 'on' : ''} ${status.voiceEnabled ? '' : 'off'}`}
          />
          <span className="state">
            {status.voiceEnabled
              ? status.listening
                ? 'Écoute locale'
                : 'Voix locale'
              : 'Voix coupée'}
          </span>
          <button
            type="button"
            className="toggle"
            onClick={() => void sessionRef.current?.setVoiceEnabled(!status.voiceEnabled)}
          >
            {status.voiceEnabled ? 'Couper la voix' : 'Activer la voix'}
          </button>
        </div>
        {status.voiceEnabled ? (
          <p className="camera">
            {status.ttsEngine === 'piper' ? 'Voix neurale Piper' : 'Voix Windows (Piper en cours)'}
            {status.brain === 'ollama' && status.brainModel
              ? ` · ${status.brainModel}`
              : ' · installe Ollama + llama3.2:1b pour plus de réponses'}
          </p>
        ) : null}
        {status.error ? <p className="error">{status.error}</p> : null}
      </aside>
    </main>
  )
}

const labelFor = (status: CompanionStatus) => {
  if (!status.tracking) return 'Caméra coupée'
  if (status.error) return 'Caméra indisponible'
  if (status.state === 'sleeping') return 'Endormi'
  if (status.state === 'waking') return 'Réveil'
  if (status.faceDetected) return 'Présence locale'
  if (status.listening) return 'J’écoute'
  return 'En attente'
}
