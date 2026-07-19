/**
 * Contrato de animaciones: el arquetipo declara qué clips necesita un
 * personaje y cómo degradar cuando falta uno. Es la pieza central de la
 * tesis "el motor te dice qué assets necesitás" (DESIGN.md §2 y §4):
 * el juego funciona desde el minuto cero con lo que haya, y el editor
 * (H2) va a mostrar los huecos como una checklist.
 */
export interface AnimationContract {
  /** Clips que el arquetipo espera que existan. */
  required: string[]
  /** Cadena de degradación: si falta un clip, con cuál se reemplaza. */
  fallbacks: Record<string, string>
}

/**
 * Resuelve qué clip reproducir: el pedido si existe, si no sigue la
 * cadena de fallbacks, y como último recurso el primer clip disponible.
 */
export function resolveClip(
  contract: AnimationContract,
  available: Iterable<string>,
  wanted: string,
): string | undefined {
  const set = new Set(available)
  const seen = new Set<string>()
  let current: string | undefined = wanted
  while (current && !seen.has(current)) {
    if (set.has(current)) return current
    seen.add(current)
    current = contract.fallbacks[current]
  }
  const [first] = set
  return first
}

/** Qué clips del contrato faltan — lo que el editor mostrará como huecos. */
export function missingClips(contract: AnimationContract, available: Iterable<string>): string[] {
  const set = new Set(available)
  return contract.required.filter((clip) => !set.has(clip))
}
