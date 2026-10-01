import { connectedGamepads, DEFAULT_GAMEPAD_DEAD_ZONE, gamepadValues, isStandardPad } from '@waica/engine'

/** The engine's held threshold: a pad control counts as pressed at this value. */
const PRESSED = 0.5

/**
 * Reads the first connected standard pad every animation frame and reports
 * the first control — button or stick half — that rises to 0.5 from below
 * after watching began; a control already held at the start must drop first.
 * Reports at most once. The returned function stops reading.
 */
export function watchPadPress(onPress: (code: string) => void): () => void {
  const armed = new Set<string>()
  let frame = requestAnimationFrame(read)

  function read(): void {
    const pad = connectedGamepads().find(isStandardPad)
    for (const [code, value] of pad ? gamepadValues(pad, DEFAULT_GAMEPAD_DEAD_ZONE) : []) {
      if (value < PRESSED) armed.add(code)
      else if (armed.has(code)) {
        onPress(code)
        return
      }
    }
    frame = requestAnimationFrame(read)
  }

  return () => {
    cancelAnimationFrame(frame)
  }
}
