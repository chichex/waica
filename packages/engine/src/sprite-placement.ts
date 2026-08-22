export interface SpritePlacementInput {
  width: number
  height: number
  offsetX: number
  offsetY: number
  anchorX: number
  anchorY: number
  flipX: boolean
  frameScaleX: number
  frameScaleY: number
}

export interface SpritePlacement {
  x: number
  y: number
  scaleX: number
  scaleY: number
}

/**
 * Places a displayed frame inside its full-size sprite box. The declared
 * anchor belongs to that box; smaller animation frames retain its floor.
 */
export function spritePlacement(input: SpritePlacementInput): SpritePlacement {
  const boxX = input.offsetX + (0.5 - input.anchorX) * input.width
  const floorY = input.offsetY - input.anchorY * input.height
  return {
    x: input.flipX ? -boxX : boxX,
    y: floorY + (input.height * input.frameScaleY) / 2,
    scaleX: input.width * input.frameScaleX * (input.flipX ? -1 : 1),
    scaleY: input.height * input.frameScaleY,
  }
}
