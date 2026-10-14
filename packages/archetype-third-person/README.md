# @waica/archetype-third-person

A 3D third-person adventure archetype for [Waica](../../README.md): an orbit
camera behind the Knight, camera-relative movement, run, roll and melee
combat against Skeleton Warriors, checkpoints, and a dungeon courtyard demo
built from CC0 KayKit art.

```sh
npx @waica/cli            # New project → 3D → Third person
```

## What you get

- **The orbit camera.** The scene's perspective `camera` block follows the
  Player (`follow`, `distance`, `pitch`, …; ADR 0031). Click the game to
  lock the pointer and orbit with the mouse; `Q`/`E` and the right stick
  orbit too, and the wheel zooms. A wall between the Player and the camera
  pulls the camera in front of it.
- **Camera-relative controls.** `CharacterMotor.relativeTo: 'camera'`:
  `W` walks away from the camera. `Shift` runs, `C` rolls (invulnerable while
  it lasts), `Space` jumps, a click or `J` attacks.
- **Combat.** `MeleeAttack` strikes a box in front of the Knight's yaw;
  skeletons (the `enemy` role) patrol, chase, wind up, strike, flinch and
  die. Hits push back, blink the model and shake the camera.
- **Checkpoints.** Touch a banner hung on a wall to make it your respawn
  point; dying fades out and back in on the floor in front of it with full
  health (the Checkpoint's `spawnOffset`).
- **The demo.** A walled courtyard with columns, wall torches (Point
  Lights), three skeletons, two checkpoint banners on the side walls and the
  goal chest on a raised platform: reach it to win. The blank start is a
  ground plane, a Sun and the playable Knight.

## Controls

| Action | Keys | Gamepad |
|---|---|---|
| Move | WASD, arrows | left stick |
| Jump | Space | A |
| Attack | left click, J | X |
| Run | Shift | LB |
| Roll | C | B |
| Orbit | mouse (locked), Q/E | right stick |
| Zoom | mouse wheel | — |

## Package

- Root export: `ARCHETYPE` (the browser manifest, with art urls), the
  prefabs, scenes, HUD pieces and the archetype's own components
  (`GoalChest`, `HeartsHud`, `ControlsHint`, `HitShake`).
- `./manifest`: the Node-safe manifest the MCP server and the CLI read.
- `assets/`: the glbs, within 3 MB; [`assets/ATTRIBUTION.md`](./assets/ATTRIBUTION.md)
  credits each file and gives the exact trim commands.

Published in lockstep with `@waica/engine`, `@waica/behaviors` and the other
archetypes.
