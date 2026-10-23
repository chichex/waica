# Review follow-up: shipped third-person torches

Measured on 2026-10-20 with Chrome 150, actual WebGL2, the generated demo,
Medium/40 and paused frame 13. `shipped.png` and `torches-off.png` differ only
in torch intensity; geometry, participation flags, shadow policy and camera
are checked equal by the E2E. Visible floor samples use its actual y=0.05 top.

- Warmth gain: 30 (required >=15); brightness gain: 53 (required >=25).
- Distant control: 0 channel change (required <=2).
- Existing Shadows Off oracle: warm pool 28, dark pool 0; depth 0 differing pixels.
- `third-person.json` is the complete actual public-flow result.
- Native-Node regression tests reject identical/no-impact frames, missing
  warmth, missing brightness and a changed distant control.

Command: `TMPDIR=/tmp/opencode WAICA_E2E_SCREENSHOT_DIR=/tmp/opencode/waica-203-torch-followup node /tmp/opencode/waica-203-torch-third-person-only.mjs`.
This invokes the public `runRuntimeE2e` with only third-person enabled, WebGL2
and `includeShadows: true`. The ordinary CLI selects it automatically for
WebGL2 and only on explicit request for WebGPU.

The optional wall probe (`wall-report.json`, `wall-*.png`) raycast-confirms
visible wall samples. Warmth gain is 132 above and 66 beside the fixture;
below it the gain is 0 and the light ray intersects the torch Model.
This does not prove an art defect or authorize changing offsets/cast flags.
The review's subjective concern about that lower shadow remains open.
No production art, gameplay or light offsets were changed. No WebGPU claim.
