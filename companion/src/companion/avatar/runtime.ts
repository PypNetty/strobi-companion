import { applyAvatarEyeDefaults, type StudioAvatar } from '@avatar-lab/features/avatar/avatars'
import {
  ambientBodyOffset,
  ambientEyeOffset,
  applyAmbientBodyMotion,
  hasAmbientMotion,
} from '@avatar-lab/features/avatar/ambientMotion'
import {
  applyEyeLook,
  eyeShapeForLook,
  gazeFollowsEyeLook,
  type EyeLookId,
} from '@avatar-lab/features/avatar/eyeLooks'
import {
  expressionFields,
  poseFromExpression,
  renderAvatar,
  type Expression,
} from '@avatar-lab/features/avatar/geometry'
import {
  advanceSequenceCursor,
  type AvatarSequence,
  type SequenceTransition,
} from '@avatar-lab/features/animation/sequences'
import type { AvatarBehaviorLibrary } from '@avatar-lab/features/avatar/avatars'
import type { GazePoint } from '../gaze/gazeController'

const SVG_NS = 'http://www.w3.org/2000/svg'
const EYE_TRAVEL = { x: 16, y: 11 }
const HEAD_YAW_DEG = 18
const HEAD_PITCH_DEG = 10

type Colors = { body: string; eyes: string }

type TransitionState = {
  from: Expression
  to: Expression
  fromColors: Colors
  toColors: Colors
  startedAt: number
  durationMs: number
  transition: SequenceTransition
}

type BlinkState = { startedAt: number; durationMs: number }

export type GazeRenderOptions = {
  followHead?: boolean
  speaking?: boolean
  dizzy?: boolean
}

export type CompanionColorOverride = {
  body?: string
  eyes?: string
}

export type CompanionRuntime = {
  element: SVGSVGElement
  setSequence: (sequenceId: string) => void
  setExpression: (expressionId: string) => void
  setColors: (override: CompanionColorOverride | null) => void
  setAvatar: (next: StudioAvatar) => void
  setGaze: (gaze: GazePoint, options?: GazeRenderOptions) => void
  setEyeLook: (look: EyeLookId | null) => void
  setAmbientStrength: (value: number) => void
  destroy: () => void
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const easeProgress = (progress: number, transition: SequenceTransition) =>
  transition === 'smooth'
    ? progress * progress * (3 - 2 * progress)
    : transition === 'snappy'
      ? 1 - (1 - progress) ** 3
      : 1 - Math.exp(-6 * progress) * Math.cos(8 * progress)

const nearestAngle = (target: number, current: number) => {
  let resolved = target
  while (resolved - current > 180) resolved -= 360
  while (resolved - current < -180) resolved += 360
  return resolved
}

const resolvedTarget = (target: Expression, current: Expression): Expression => ({
  ...target,
  headX: nearestAngle(target.headX, current.headX),
  headY: nearestAngle(target.headY, current.headY),
  headZ: nearestAngle(target.headZ, current.headZ),
  leftAngle: nearestAngle(target.leftAngle, current.leftAngle),
  rightAngle: nearestAngle(target.rightAngle, current.rightAngle),
})

const colorChannels = (color: string) => {
  const value = color.replace('#', '')
  const hex =
    value.length === 3
      ? value
          .split('')
          .map(channel => channel + channel)
          .join('')
      : value
  const numeric = Number.parseInt(hex, 16)
  return [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255]
}

const interpolateColor = (from: string, to: string, progress: number) => {
  const left = colorChannels(from)
  const right = colorChannels(to)
  const value = left.map((channel, index) =>
    Math.round(channel + (right[index] - channel) * progress)
  )
  return `#${value.map(channel => channel.toString(16).padStart(2, '0')).join('')}`
}

const interpolateExpression = (from: Expression, to: Expression, progress: number): Expression => {
  const next = { ...from }
  expressionFields.forEach(field => {
    next[field] = from[field] + (to[field] - from[field]) * progress
  })
  next.eyeMotion = to.eyeMotion
  next.bodyMotion = to.bodyMotion
  if (to.bodyColor) next.bodyColor = to.bodyColor
  if (to.eyeColor) next.eyeColor = to.eyeColor
  return next
}

const svgElement = <K extends keyof SVGElementTagNameMap>(name: K) =>
  document.createElementNS(SVG_NS, name)

export const mountCompanionAvatar = (
  target: HTMLElement,
  avatar: StudioAvatar,
  behavior: AvatarBehaviorLibrary,
  options: { size?: number } = {}
): CompanionRuntime => {
  const expressions = new Map(behavior.expressions.map(expression => [expression.id, expression]))
  const sequences = new Map(behavior.sequences.map(sequence => [sequence.id, sequence]))
  const size = options.size ?? 240
  const instanceId =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const clipId = `companion-clip-${instanceId}`

  let currentAvatar = avatar
  const svg = svgElement('svg')
  svg.setAttribute('viewBox', '-150 -150 300 300')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', currentAvatar.name)
  svg.style.width = `${size}px`
  svg.style.height = `${size}px`
  svg.style.display = 'block'
  svg.style.overflow = 'visible'
  svg.style.pointerEvents = 'none'

  const defs = svgElement('defs')
  const clipPath = svgElement('clipPath')
  const clipHead = svgElement('path')
  clipPath.id = clipId
  clipPath.append(clipHead)
  defs.append(clipPath)
  svg.append(defs)

  const motionLayer = svgElement('g')
  const backLayer = svgElement('g')
  const head = svgElement('path')
  const eyesLayer = svgElement('g')
  const leftEye = svgElement('path')
  const rightEye = svgElement('path')
  const frontLayer = svgElement('g')
  eyesLayer.setAttribute('clip-path', `url(#${clipId})`)
  eyesLayer.append(leftEye, rightEye)
  motionLayer.append(backLayer, head, eyesLayer, frontLayer)
  svg.append(motionLayer)
  target.replaceChildren(svg)

  const ensurePaths = (group: SVGGElement, paths: string[], fill: string) => {
    while (group.children.length < paths.length) group.append(svgElement('path'))
    while (group.children.length > paths.length) group.lastElementChild?.remove()
    paths.forEach((path, index) => {
      const node = group.children[index]
      if (!(node instanceof SVGPathElement)) return
      node.setAttribute('d', path)
      node.setAttribute('fill', fill)
    })
  }

  let colorOverride: CompanionColorOverride | null = null

  const resolveColors = (expression: Expression): Colors => ({
    body: colorOverride?.body || expression.bodyColor || currentAvatar.colors.body,
    eyes: colorOverride?.eyes || expression.eyeColor || currentAvatar.colors.eyes,
  })

  const idleSequence = sequences.get('idle') ?? behavior.sequences[0]
  if (!idleSequence) throw new Error('No bundled animation is available for the companion.')

  let currentSequence = idleSequence
  let currentExpression = applyAvatarEyeDefaults(
    expressions.get(idleSequence.steps[0]?.expressionId ?? '') ?? behavior.expressions[0],
    currentAvatar.eyes
  )
  let currentColors = resolveColors(currentExpression)
  let blinkAmount = 1
  let transitionState: TransitionState | null = null
  let blinkState: BlinkState | null = null
  let frameRequest: number | null = null
  let stepTimer: number | null = null
  let blinkTimer: number | null = null
  let stepIndex = 0
  let direction: 1 | -1 = 1
  let gaze: GazePoint = { x: 0, y: 0 }
  let followHead = false
  let speaking = false
  let speakingStartedAt = 0
  let dizzy = false
  let dizzyStartedAt = 0
  let ambientStrength = 1
  let lastAmbientFrame = 0
  let eyeAmbientStartedAt = performance.now()
  let bodyAmbientStartedAt = performance.now()
  let eyeAmbientSignature = currentExpression.eyeMotion
  let bodyAmbientSignature = currentExpression.bodyMotion
  let eyeLook: EyeLookId | null = 'neutral'
  let destroyed = false

  const applyAttentionPose = (expression: Expression, time: number): Expression => {
    let next = expression
    if (dizzy) {
      const spin = (time - dizzyStartedAt) / 42
      next = {
        ...next,
        headY: gaze.x * 28,
        headX: gaze.y * 14,
        headZ: Math.sin(spin) * 18 + Math.sin(spin * 1.7) * 6,
      }
    } else if (followHead) {
      next = {
        ...next,
        headY: gaze.x * HEAD_YAW_DEG,
        headX: gaze.y * HEAD_PITCH_DEG,
      }
    }
    if (speaking && gazeFollowsEyeLook(eyeLook)) {
      const pulse = 1 + Math.sin((time - speakingStartedAt) / 90) * 0.08
      next = {
        ...next,
        heightLeft: next.heightLeft * pulse,
        heightRight: next.heightRight * pulse,
      }
    }
    return next
  }

  const applyMotionSignature = (expression: Expression, now: number) => {
    if (expression.eyeMotion !== eyeAmbientSignature) {
      eyeAmbientSignature = expression.eyeMotion
      eyeAmbientStartedAt = now
    }
    if (expression.bodyMotion !== bodyAmbientSignature) {
      bodyAmbientSignature = expression.bodyMotion
      bodyAmbientStartedAt = now
    }
  }

  const posedExpression = (expression: Expression): Expression => {
    const next: Expression = dizzy
      ? { ...expression, bodyMotion: 'shake', eyeMotion: 'shake' }
      : expression
    return eyeLook ? applyEyeLook(next, eyeLook) : next
  }

  const render = (time = performance.now()) => {
    const source = posedExpression(currentExpression)
    applyMotionSignature(source, time)
    const eyeElapsed = time - eyeAmbientStartedAt
    const bodyElapsed = time - bodyAmbientStartedAt
    const expression =
      source.bodyMotion !== 'none'
        ? applyAmbientBodyMotion(source, bodyElapsed, ambientStrength)
        : source
    const attentive = applyAttentionPose(expression, time)
    const followGaze = gazeFollowsEyeLook(eyeLook)
    const eyeOffset = followGaze
      ? ambientEyeOffset(source, eyeElapsed, ambientStrength)
      : { x: 0, y: 0 }
    const pose = poseFromExpression(attentive)
    const geometry = renderAvatar(pose, currentAvatar.body.primary, blinkAmount, {
      includeWire: false,
      bodyNodes: currentAvatar.body.nodes,
      eyeOffset: {
        x: eyeOffset.x + (followGaze ? gaze.x * EYE_TRAVEL.x : 0),
        y: eyeOffset.y + (followGaze ? gaze.y * EYE_TRAVEL.y : 0),
      },
      eyeShape: eyeLook ? eyeShapeForLook(eyeLook) : 'rounded',
    })
    const offset = ambientBodyOffset(source, bodyElapsed, ambientStrength)
    motionLayer.setAttribute('transform', `translate(${offset.x} ${offset.y})`)
    ensurePaths(backLayer, geometry.backPaths, currentColors.body)
    ensurePaths(frontLayer, geometry.frontPaths, currentColors.body)
    head.setAttribute('d', geometry.headPath)
    head.setAttribute('fill', currentColors.body)
    clipHead.setAttribute('d', geometry.headPath)
    leftEye.setAttribute('d', geometry.leftPath)
    rightEye.setAttribute('d', geometry.rightPath)
    leftEye.setAttribute('fill', currentColors.eyes)
    rightEye.setAttribute('fill', currentColors.eyes)
    leftEye.style.display = geometry.leftVisible ? '' : 'none'
    rightEye.style.display = geometry.rightVisible ? '' : 'none'
  }

  const requestTick = () => {
    if (destroyed || frameRequest !== null) return
    frameRequest = requestAnimationFrame(tick)
  }

  const tick = (time: number) => {
    frameRequest = null
    if (transitionState) {
      const linear = clamp01((time - transitionState.startedAt) / transitionState.durationMs)
      const eased = easeProgress(linear, transitionState.transition)
      ambientStrength = clamp01(eased)
      currentExpression = interpolateExpression(transitionState.from, transitionState.to, eased)
      currentColors = {
        body: interpolateColor(
          transitionState.fromColors.body,
          transitionState.toColors.body,
          eased
        ),
        eyes: interpolateColor(
          transitionState.fromColors.eyes,
          transitionState.toColors.eyes,
          eased
        ),
      }
      if (linear >= 1) {
        currentExpression = transitionState.to
        currentColors = transitionState.toColors
        transitionState = null
        ambientStrength = 1
      }
    }
    if (blinkState) {
      const progress = clamp01((time - blinkState.startedAt) / blinkState.durationMs)
      if (progress <= 0.42) {
        const closeProgress = progress / 0.42
        blinkAmount = 1 - closeProgress * closeProgress
      } else {
        const openProgress = (progress - 0.42) / 0.58
        blinkAmount = 1 - (1 - openProgress) ** 2
      }
      if (progress >= 1) {
        blinkAmount = 1
        blinkState = null
      }
    }
    const ambientActive = hasAmbientMotion(posedExpression(currentExpression))
    if (
      transitionState ||
      blinkState ||
      dizzy ||
      !ambientActive ||
      time - lastAmbientFrame >= 1000 / 30
    ) {
      render(time)
      if (ambientActive || dizzy) lastAmbientFrame = time
    }
    if (transitionState || blinkState || ambientActive || speaking || dizzy) requestTick()
  }

  const animateTo = (expressionId: string, durationMs: number, transition: SequenceTransition) => {
    const raw = expressions.get(expressionId)
    if (!raw) return
    const target = applyAvatarEyeDefaults(
      resolvedTarget(raw, currentExpression),
      currentAvatar.eyes
    )
    applyMotionSignature(target, performance.now())
    const targetColors = resolveColors(target)
    if (durationMs <= 0) {
      ambientStrength = 1
      transitionState = null
      currentExpression = target
      currentColors = targetColors
      render()
      if (hasAmbientMotion(currentExpression)) requestTick()
      return
    }
    transitionState = {
      from: currentExpression,
      to: target,
      fromColors: currentColors,
      toColors: targetColors,
      startedAt: performance.now(),
      durationMs,
      transition,
    }
    ambientStrength = 0
    requestTick()
  }

  const clearSchedule = () => {
    if (stepTimer !== null) window.clearTimeout(stepTimer)
    if (blinkTimer !== null) window.clearTimeout(blinkTimer)
    stepTimer = null
    blinkTimer = null
  }

  const scheduleBlink = (sequence: AvatarSequence, delay: number) => {
    if (!sequence.blink.enabled) return
    blinkTimer = window.setTimeout(() => {
      blinkState = { startedAt: performance.now(), durationMs: sequence.blink.durationMs }
      requestTick()
      const range = sequence.blink.maxIntervalMs - sequence.blink.minIntervalMs
      scheduleBlink(
        sequence,
        sequence.blink.durationMs + sequence.blink.minIntervalMs + Math.random() * range
      )
    }, delay)
  }

  const runStep = (sequence: AvatarSequence) => {
    const step = sequence.steps[stepIndex]
    if (!step) return
    animateTo(step.expressionId, step.transitionMs, step.transition)
    const duration = step.transitionMs + step.holdMs
    stepTimer = window.setTimeout(() => advance(sequence), duration)
  }

  const advance = (sequence: AvatarSequence) => {
    if (destroyed || sequence !== currentSequence) return
    const cursor = advanceSequenceCursor(sequence, stepIndex, direction)
    if (cursor.complete) {
      stepIndex = cursor.index
      return
    }
    stepIndex = cursor.index
    direction = cursor.direction
    runStep(sequence)
  }

  const playSequence = (sequence: AvatarSequence) => {
    clearSchedule()
    currentSequence = sequence
    stepIndex = 0
    direction = 1
    runStep(sequence)
    scheduleBlink(sequence, sequence.blink.initialDelayMs)
  }

  applyMotionSignature(currentExpression, performance.now())
  render()
  playSequence(idleSequence)

  return {
    element: svg,
    setSequence(sequenceId: string) {
      const next = sequences.get(sequenceId)
      if (!next || next.id === currentSequence.id) return
      playSequence(next)
    },
    setExpression(expressionId: string) {
      if (!expressions.has(expressionId)) return
      clearSchedule()
      animateTo(expressionId, 220, 'smooth')
    },
    setColors(override: CompanionColorOverride | null) {
      colorOverride = override
      const source = transitionState?.to ?? currentExpression
      const target = resolveColors(source)
      if (transitionState) {
        transitionState.fromColors = target
        transitionState.toColors = target
      }
      currentColors = target
      if (frameRequest === null) render()
    },
    setAvatar(next: StudioAvatar) {
      currentAvatar = next
      svg.setAttribute('aria-label', next.name)
      const source = transitionState?.to ?? currentExpression
      const raw = expressions.get(source.id)
      transitionState = null
      if (raw) currentExpression = applyAvatarEyeDefaults(raw, currentAvatar.eyes)
      currentColors = resolveColors(currentExpression)
      if (frameRequest === null) render()
      if (hasAmbientMotion(posedExpression(currentExpression))) requestTick()
    },
    setGaze(next: GazePoint, options?: GazeRenderOptions) {
      gaze = next
      if (options?.followHead !== undefined) followHead = options.followHead
      if (options?.speaking !== undefined) {
        if (options.speaking && !speaking) speakingStartedAt = performance.now()
        speaking = options.speaking
      }
      if (options?.dizzy !== undefined && options.dizzy !== dizzy) {
        dizzy = options.dizzy
        if (dizzy) {
          const now = performance.now()
          dizzyStartedAt = now
          eyeAmbientStartedAt = now
          bodyAmbientStartedAt = now
        }
      }
      if (frameRequest === null) render()
      if (speaking || dizzy) requestTick()
    },
    setEyeLook(next: EyeLookId | null) {
      if (next === eyeLook) return
      eyeLook = next
      const now = performance.now()
      eyeAmbientStartedAt = now
      if (next) applyMotionSignature(applyEyeLook(currentExpression, next), now)
      if (frameRequest === null) render()
      if (gazeFollowsEyeLook(next) || speaking || dizzy) requestTick()
    },
    setAmbientStrength(value: number) {
      ambientStrength = clamp01(value)
    },
    destroy() {
      destroyed = true
      clearSchedule()
      if (frameRequest !== null) cancelAnimationFrame(frameRequest)
      svg.remove()
    },
  }
}
