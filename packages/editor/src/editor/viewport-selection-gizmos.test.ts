import { THREE } from '@waica/engine'
import { expect, it } from 'vitest'
import { rectLoop } from './viewport-selection-gizmos'

it('outlines a rectangle with a closed THREE.Line, which WebGPURenderer draws (it rejects LineLoop)', () => {
  const outline = rectLoop(0xffb703)
  const position = outline.geometry.getAttribute('position')
  const corner = (index: number): number[] => [position.getX(index), position.getY(index), position.getZ(index)]

  expect((outline as unknown as { isLineLoop?: boolean }).isLineLoop).toBeUndefined()
  expect(outline).toBeInstanceOf(THREE.Line)
  expect(position.count).toBe(5)
  expect(corner(4)).toEqual(corner(0))
  expect([corner(0), corner(1), corner(2), corner(3)]).toEqual([
    [-0.5, -0.5, 0],
    [0.5, -0.5, 0],
    [0.5, 0.5, 0],
    [-0.5, 0.5, 0],
  ])
})
