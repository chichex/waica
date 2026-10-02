import { ACTION_HELD_THRESHOLD, firstStandardPadValues } from '@waica/engine'

/**
 * Reads the first connected standard pad every animation frame and reports
 * the first control — button or stick half — that rises to the engine's
 * held threshold from below after watching began; a control already held at
 * the start must drop first. A pad absent on some frame holds nothing, so
 * its first press after it appears counts (browsers expose a pad only on its
 * first button press). Reports at most once. The returned function stops reading.
 */
export function watchPadPress(onPress: (code: string) => void): () => void {
  const armed = new Set<string>()
  let everyCodeArmed = false
  let frame = requestAnimationFrame(read)

  function read(): void {
    const values = firstStandardPadValues()
    if (!values) everyCodeArmed = true
    for (const [code, value] of values ?? []) {
      if (value < ACTION_HELD_THRESHOLD) armed.add(code)
      else if (everyCodeArmed || armed.has(code)) {
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
