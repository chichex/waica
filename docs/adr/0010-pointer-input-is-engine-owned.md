# Pointer input is engine-owned

Pointer input (click/tap on the game canvas) enters Waica through the engine, symmetric to keyboard `Input`: the engine listens on its own canvas, converts screen to logical coordinates (camera, fixed-resolution letterbox, isometric unprojection), resolves the picked entity, and exposes the result as one primitive that behaviors consume — the click-to-move component never touches the DOM. We decided this so the screen-to-logical rule lives in exactly one place and so the Runtime Bridge can inject deterministic clicks through the same seam it uses for semantic actions.

## Considered Options

A behaviors-owned DOM listener was rejected because it would duplicate camera/letterbox/projection math outside the engine and leave the Runtime Bridge unable to inject pointer input deterministically. Project-owned code (like the platformer's gun) was rejected because factory-default point-and-click (isometric archetype) requires the capability to ship in published packages.
