import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const wasmSource = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDest = join(root, 'public/mediapipe/wasm')
const modelDestDir = join(root, 'public/models')
const modelDest = join(modelDestDir, 'face_landmarker.task')
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

mkdirSync(join(root, 'public/mediapipe'), { recursive: true })
mkdirSync(modelDestDir, { recursive: true })

if (existsSync(wasmSource)) {
  cpSync(wasmSource, wasmDest, { recursive: true })
  console.log('Copied MediaPipe wasm assets.')
} else {
  console.warn('MediaPipe wasm assets were not found. Run pnpm install first.')
}

if (!existsSync(modelDest)) {
  try {
    const response = await fetch(modelUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    const { writeFileSync } = await import('node:fs')
    writeFileSync(modelDest, bytes)
    console.log('Downloaded local Face Landmarker model.')
  } catch (error) {
    console.warn(
      'Could not download the local Face Landmarker model. Face tracking will stay disabled until public/models/face_landmarker.task is present.',
      error
    )
  }
}
