import { Component, Sprite, type Entity, type Game, type StateContext } from '@waica/engine'
import { INTERACTABLE_UI_PIECE, Interactable } from './interactable.js'
import { Health } from './health.js'
import { MeleeAttack } from './melee-attack.js'
import { buildNavigationGrid, type GridPoint } from './navigation-grid.js'
import { planPath } from './pathfinding.js'

/** How close (logical units) counts as "arrived" at a waypoint or the final cell. */
const DEFAULT_ARRIVAL_TOLERANCE = 0.2
/** How far (logical units) a chased target has to move before its path re-plans. */
const ATTACK_REPLAN_DISTANCE = 0.5

interface GroundOrder {
  kind: 'ground'
  waypoints: GridPoint[]
}

interface NpcOrder {
  kind: 'npc'
  target: Entity
  waypoints: GridPoint[]
}

interface AttackOrder {
  kind: 'attack'
  target: Entity
  waypoints: GridPoint[]
  lastPlannedTarget: GridPoint | null
}

type MoveOrder = GroundOrder | NpcOrder | AttackOrder

/**
 * Pointer-issued objective for a grid player role (CA-4/CA-5/CA-6): a click
 * on open ground walks there, on an Interactable walks up and triggers its
 * line, on a foreign Health walks into melee range and re-engages until it
 * dies or disappears. Passive like a motor — driveClickToMove, called from
 * the grid player role's update, does the driving; state code owns the
 * frame.
 */
export class ClickToMove extends Component {
  static override componentName = 'ClickToMove'
  static override displayName = 'Click to move'
  static override params = {
    arrivalTolerance: { label: 'Arrival tolerance', min: 0.05, max: 1, step: 0.05 },
    markerWidth: { label: 'Marker width', min: 0.1, max: 2, step: 0.05 },
    markerHeight: { label: 'Marker height', min: 0.1, max: 2, step: 0.05 },
    markerColor: { label: 'Marker color' },
    markerTexture: { label: 'Marker texture' },
  }
  static override transient = ['order', 'marker']

  /** Distance (logical units) counted as "arrived" at a waypoint or destination. */
  arrivalTolerance = DEFAULT_ARRIVAL_TOLERANCE
  /** Destination marker size (CA-8); a diamond/circle sized to taste per archetype. */
  markerWidth = 0.5
  markerHeight = 0.25
  markerColor = 0xffffff
  /** Empty draws a flat-color circle (the generic default); set to texture a diamond etc. */
  markerTexture = ''

  /** The live order, if any — exposed for tests and inspection, not authored. */
  order: MoveOrder | null = null
  /** The ground-order destination marker entity, if one is currently shown. */
  marker: Entity | null = null

  /** Cancels the active order (if any) and removes its marker (CA-4/CA-7). */
  cancel(): void {
    this.order = null
    this.despawnMarker()
  }

  override onDestroy(): void {
    this.despawnMarker()
  }

  private despawnMarker(): void {
    if (!this.marker) return
    if (this.marker.alive) this.marker.destroy()
    this.marker = null
  }
}

function pointOf(entity: Entity): GridPoint {
  return { x: entity.position.x, y: entity.position.y }
}

function distance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function unitToward(from: GridPoint, to: GridPoint): GridPoint | null {
  const gap = distance(from, to)
  if (gap <= 1e-9) return null
  return { x: (to.x - from.x) / gap, y: (to.y - from.y) / gap }
}

/** A* waypoints (cell centers) from the mover toward a logical point (CA-2/CA-3). */
function waypointsToward(game: Game, mover: Entity, target: GridPoint): GridPoint[] {
  const grid = buildNavigationGrid(game, [pointOf(mover), target], mover)
  const plan = planPath(grid, pointOf(mover), target)
  if (!plan) return []
  return plan.cells.map((cell) => grid.cellCenter(cell)!)
}

function spawnMarker(clickToMove: ClickToMove, game: Game, mover: Entity, at: GridPoint): void {
  const marker = game.spawn(`${mover.name}:click-marker`)
  marker.position.set(at.x, at.y, 0)
  if (clickToMove.markerTexture) {
    marker.add(Sprite, {
      texture: clickToMove.markerTexture,
      pixelArt: true,
      width: clickToMove.markerWidth,
      height: clickToMove.markerHeight,
      color: clickToMove.markerColor,
    })
  } else {
    marker.add(Sprite, {
      shape: 'circle',
      width: clickToMove.markerWidth,
      height: clickToMove.markerHeight,
      color: clickToMove.markerColor,
    })
  }
  clickToMove.marker = marker
}

/** Consumes the leading waypoints already reached; returns the direction to what's left. */
function followWaypoints(clickToMove: ClickToMove, mover: Entity, waypoints: GridPoint[]): GridPoint | null {
  while (waypoints.length > 0) {
    const next = waypoints[0]!
    const gap = distance(pointOf(mover), next)
    if (gap <= clickToMove.arrivalTolerance) {
      waypoints.shift()
      continue
    }
    return { x: (next.x - mover.position.x) / gap, y: (next.y - mover.position.y) / gap }
  }
  return null
}

/**
 * Closes the last stretch toward an entity target directly, once the planned
 * path (nearest-reachable-cell granularity) is exhausted but the live
 * distance is still outside range/radius. A cell-quantized plan can resolve
 * one cell short of a target whose own Solid straddles cell boundaries
 * (CA-2's rasterization blocks at cell resolution); the direct approach
 * closes that gap the same way normal collision does — GridMotor still
 * resolves it per axis against every Solid, including the target's own, so
 * this never walks through anything.
 */
function beelineToward(entity: Entity, target: Entity): GridPoint | null {
  return unitToward(pointOf(entity), pointOf(target))
}

function startOrder(clickToMove: ClickToMove, entity: Entity, game: Game, pick: { point: GridPoint; entity: Entity | null }): void {
  clickToMove.cancel()
  const picked = pick.entity
  if (picked && picked !== entity && picked.alive) {
    if (picked.get(Health)) {
      clickToMove.order = {
        kind: 'attack',
        target: picked,
        waypoints: waypointsToward(game, entity, pointOf(picked)),
        lastPlannedTarget: pointOf(picked),
      }
      return
    }
    if (picked.get(Interactable)) {
      clickToMove.order = { kind: 'npc', target: picked, waypoints: waypointsToward(game, entity, pointOf(picked)) }
      return
    }
    // An entity without Health/Interactable: fall through to a ground order.
  }
  const waypoints = waypointsToward(game, entity, pick.point)
  clickToMove.order = { kind: 'ground', waypoints }
  const destination = waypoints.length > 0 ? waypoints[waypoints.length - 1]! : pick.point
  spawnMarker(clickToMove, game, entity, destination)
}

function driveGroundOrder(clickToMove: ClickToMove, entity: Entity, order: GroundOrder): GridPoint | null {
  const direction = followWaypoints(clickToMove, entity, order.waypoints)
  if (direction) return direction
  clickToMove.cancel() // arrived (CA-4/CA-8)
  return null
}

function driveNpcOrder(clickToMove: ClickToMove, entity: Entity, game: Game, order: NpcOrder): GridPoint | null {
  const target = order.target
  if (!target.alive) {
    clickToMove.cancel()
    return null
  }
  const interactable = target.get(Interactable)
  if (!interactable) {
    clickToMove.cancel()
    return null
  }
  if (distance(pointOf(entity), pointOf(target)) <= interactable.radius) {
    game.stats.set('npcLine', interactable.line)
    game.ui.show(INTERACTABLE_UI_PIECE)
    clickToMove.cancel() // CA-5: one trigger per arrival, no key simulated
    return null
  }
  const direction = followWaypoints(clickToMove, entity, order.waypoints)
  if (direction) return direction
  // Path exhausted (reached the nearest reachable cell) but still outside the
  // radius: close the rest of the way directly (see beelineToward).
  return beelineToward(entity, target)
}

function driveAttackOrder(clickToMove: ClickToMove, entity: Entity, game: Game, order: AttackOrder): GridPoint | null {
  const target = order.target
  if (!target.alive) {
    clickToMove.cancel() // CA-6: target died or disappeared
    return null
  }
  const range = entity.get(MeleeAttack)?.range ?? 1
  if (distance(pointOf(entity), pointOf(target)) <= range) {
    game.input.injectAction('attack', 'press') // re-engages via the existing input:attack edge
    return null
  }
  const targetNow = pointOf(target)
  const moved = !order.lastPlannedTarget || distance(order.lastPlannedTarget, targetNow) >= ATTACK_REPLAN_DISTANCE
  if (moved || order.waypoints.length === 0) {
    order.waypoints = waypointsToward(game, entity, targetNow)
    order.lastPlannedTarget = targetNow
  }
  const direction = followWaypoints(clickToMove, entity, order.waypoints)
  if (direction) return direction
  return beelineToward(entity, target)
}

/**
 * Drives the active Move Order for one frame: drains a newly arrived click
 * (replacing whatever order was active), then advances the live order and
 * returns the logical-space direction the caller should move the motor
 * along, or null to stand still. Called only while the role's shared body
 * update runs (idle/walk) — never during attack/hurt/dead, which is exactly
 * how a hurt stun pauses the order and a swing can't be interrupted (CA-7).
 */
export function driveClickToMove({ entity, game }: StateContext): GridPoint | null {
  const clickToMove = entity.get(ClickToMove)
  if (!clickToMove) return null

  const picked = game.pointer?.takePending()
  if (picked) startOrder(clickToMove, entity, game, picked)

  const order = clickToMove.order
  if (!order) return null
  if (order.kind === 'ground') return driveGroundOrder(clickToMove, entity, order)
  if (order.kind === 'npc') return driveNpcOrder(clickToMove, entity, game, order)
  return driveAttackOrder(clickToMove, entity, game, order)
}
