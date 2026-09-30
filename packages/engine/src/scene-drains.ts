import type { Game } from './game.js'
import type { YSortBatchParticipant } from './render-sort.js'

/** A detached render batch that advances only on Simulation Steps. */
export interface SceneDrain extends YSortBatchParticipant {
  readonly active: number
  advanceDrain(dt: number): boolean
  dispose(): void
}

class SceneDrains {
  private readonly drains: SceneDrain[] = []

  add(drain: SceneDrain): void {
    this.drains.push(drain)
  }

  advance(dt: number): void {
    let index = 0
    while (index < this.drains.length) {
      const drain = this.drains[index]
      if (drain?.advanceDrain(dt)) index += 1
      else {
        drain?.dispose()
        this.drains.splice(index, 1)
      }
    }
  }

  participants(): readonly YSortBatchParticipant[] {
    return this.drains
  }

  clear(): void {
    for (const drain of this.drains) drain.dispose()
    this.drains.length = 0
  }
}

const managers = new WeakMap<Game, SceneDrains>()

/** Internal scene-owned drain registry shared by Game and engine render components. */
export function sceneDrainsOf(game: Game): SceneDrains {
  const existing = managers.get(game)
  if (existing) return existing
  const created = new SceneDrains()
  managers.set(game, created)
  return created
}
