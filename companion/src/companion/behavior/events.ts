export type CompanionEvent =
  | { type: 'FACE_DETECTED'; x: number; y: number; distance?: number }
  | { type: 'FACE_LOST' }
  | { type: 'VOICE_DETECTED' }
  | { type: 'CURSOR_MOVED' }
  | { type: 'USER_RETURNED' }
  | { type: 'USER_IDLE' }
  | { type: 'TICK' }
