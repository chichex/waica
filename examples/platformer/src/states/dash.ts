import { defineStates } from '@waica/engine'
import { PlatformerMotor } from '@waica/behaviors'

// The dash: a burst of speed in the facing direction, gravity off while
// it lasts. When it starts, when it ends and which clip it plays live in
// the prefab's state data — this file is only the physics.
defineStates('platformer', {
  dashing: {
    onEnter({ entity }) {
      const motor = entity.get(PlatformerMotor)
      if (!motor) return
      motor.vx = motor.facing * 30
      motor.vy = 0
    },
    onUpdate({ entity }, dt) {
      entity.get(PlatformerMotor)?.step(dt)
    },
  },
})
