# Gamepads are more sources for the same Actions

A gamepad enters Waica as additional sources bound to the archetype's existing Actions, never as a device behaviors can see. Every Action carries a value from 0 to 1 — the max across its sources — and `axis(negative, positive)` is `value(positive) - value(negative)`, so a half-tilted stick drives the existing motors at half speed with no behavior change. Pad sources are declared in the same `Record<action, string[]>` bindings as keys, as `Gamepad:<control>` codes over the W3C `standard` mapping (`Gamepad:A`, `Gamepad:LeftStickLeft`). The Runtime Bridge can hold an Action at a value and the Runtime Snapshot reports `actionValues`, so analog input stays injectable and observable without a real pad.

## Considered Options

A separate `stick()` method beside a digital `axis()` was rejected because every movement behavior would have to know a stick exists and combine two inputs, defeating the semantic-action abstraction. A structured per-action binding type (`{ keys, gamepad }`) was rejected because it breaks the shape of all three archetype manifests, the editor controls panel and the MCP introspection for no gain the prefixed strings don't already give.
