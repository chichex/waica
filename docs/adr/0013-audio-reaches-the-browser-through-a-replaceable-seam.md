# Audio reaches the browser through a replaceable seam

`Game` talks to WebAudio through a small internal interface, uses the real implementation by default, and accepts a replacement through `GameOptions.audio`. We decided this because `happy-dom` — the environment behind the 1214 tests that are this repo's cheapest strong signal — has no `AudioContext`, `AudioBuffer` or `GainNode` at all, so without a seam the whole audio contract would be verifiable only in a real browser, where the Runtime Bridge keeps the context suspended and nobody can listen anyway.

## Considered Options

Patching `globalThis.AudioContext` inside each test, the way `WebGLRenderer` is mocked for the isometric demo test, was rejected because every test file touching audio would repeat the scaffolding, the double is sensitive to exactly how the engine captures the constructor, and a user's project would have no clean way to test its own sounds. Detecting the missing `AudioContext` and falling into a null mode that records what would have played was rejected because that recording is just as public as an injected double, while also being a second code path that can drift from the real one without anyone noticing.

## Consequences

`GameOptions.audio` is public API of a published package, so it has to be kept. In exchange nearly the whole audio contract is assertable on the cheap rung of the ladder — which channel and volume a sound played on, the scope it died with, the suspend on pause, the discard before the autoplay unlock, the cache hit on a second play — instead of only through a browser run. It also gives a project a supported way to test its own audio, and gives any host a way to force silence without muting a device.
