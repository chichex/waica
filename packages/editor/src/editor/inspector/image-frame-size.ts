import { useEffect, useState } from 'react'
import { sheetCell, type SceneComponentJson, type SheetCell, type SheetGridParams } from '@waica/engine'
import { imageSizeInUnits } from '../box-math'

/** An image URL's natural pixel size, once it loads (null while pending). */
function useImageDims(url: string | null): [number, number] | null {
  // Keyed by the url they were measured for: another url reads as pending.
  const [measured, setMeasured] = useState<{ url: string; dims: [number, number] } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setMeasured({ url, dims: [img.naturalWidth, img.naturalHeight] })
    }
    img.src = url
    return () => {
      cancelled = true
    }
  }, [url])
  return measured && measured.url === url ? measured.dims : null
}

export interface FrameSize {
  /** One frame's pixel rect; null until the image has loaded. */
  frameRect: { x: number; y: number; width: number; height: number } | null
  /** That frame in world units at the project's art scale. */
  naturalSize: { width: number; height: number } | null
}

/**
 * What "use image size" means for an appearance. Sprite sheets show one
 * frame, so it is the FRAME's size; with explicit cells (packed sheets)
 * that's the largest cell — the box width/height size at runtime.
 */
export function useFrameSize(
  comp: SceneComponentJson,
  imageUrl: string | null,
  pixelsPerUnit: number,
): FrameSize {
  const cols = Math.max(1, Number(comp.props?.cols) || 1)
  const rows = Math.max(1, Number(comp.props?.rows) || 1)
  const imageDims = useImageDims(imageUrl)
  const cells = Array.isArray(comp.props?.cells) ? (comp.props.cells as SheetCell[]) : undefined
  const frameRect = imageDims
    ? cells?.length
      ? {
          x: 0,
          y: 0,
          width: Math.max(...cells.map((c) => c.width)),
          height: Math.max(...cells.map((c) => c.height)),
        }
      : sheetCell(imageDims[0], imageDims[1], cols, rows, 0, comp.props as SheetGridParams)
    : null
  const naturalSize = frameRect
    ? imageSizeInUnits(frameRect.width, frameRect.height, pixelsPerUnit)
    : null
  return { frameRect, naturalSize }
}
