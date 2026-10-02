/**
 * Art generated in the page, so the benchmark needs no committed images and
 * no network: a canvas drawn the same way every run yields the same pixels.
 */
function drawToDataUrl(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('bench: 2d canvas context unavailable')
  paint(ctx)
  return canvas.toDataURL('image/png')
}

/** A 16×16 square with a border: the texture every static and churn sprite shares. */
export function squareTexture(): string {
  return drawToDataUrl(16, 16, (ctx) => {
    ctx.fillStyle = '#f5c542'
    ctx.fillRect(0, 0, 16, 16)
    ctx.fillStyle = '#7a4f00'
    ctx.fillRect(4, 4, 8, 8)
  })
}

export const SHEET_FRAMES = 4

/** A 4-frame horizontal sheet (16×16 cells), one hue per frame. */
export function sheetTexture(): string {
  return drawToDataUrl(16 * SHEET_FRAMES, 16, (ctx) => {
    for (let frame = 0; frame < SHEET_FRAMES; frame++) {
      ctx.fillStyle = `hsl(${frame * 90}, 70%, 55%)`
      ctx.fillRect(frame * 16, 0, 16, 16)
    }
  })
}
