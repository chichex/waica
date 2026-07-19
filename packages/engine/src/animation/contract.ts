/**
 * Animation contract: the archetype declares which clips a character
 * needs and how to degrade when one is missing. It's the centerpiece of
 * the "the engine tells you which assets you need" thesis (DESIGN.md §2
 * and §4): the game works from minute zero with whatever is there, and
 * the editor (H2) will show the gaps as a checklist.
 */
export interface AnimationContract {
  /** Clips the archetype expects to exist. */
  required: string[]
  /** Degradation chain: if a clip is missing, which one replaces it. */
  fallbacks: Record<string, string>
}

/**
 * Resolves which clip to play: the requested one if it exists, otherwise
 * it follows the fallback chain, and as a last resort the first available
 * clip.
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

/** Which contract clips are missing — what the editor will show as gaps. */
export function missingClips(contract: AnimationContract, available: Iterable<string>): string[] {
  const set = new Set(available)
  return contract.required.filter((clip) => !set.has(clip))
}
