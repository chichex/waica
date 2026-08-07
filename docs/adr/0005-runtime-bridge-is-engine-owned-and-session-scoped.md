# The Runtime Bridge is engine-owned and session-scoped

`@waica/engine` owns a dormant Runtime Bridge that an MCP-owned Run Session activates before page load. The MCP drives the bridge through in-page evaluation inside its isolated browser context; ordinary game execution exposes no permanent global or network control endpoint. This lets custom Project entrypoints participate without source patches while ensuring the observed contract comes from the Project-installed engine.

## Considered Options

Explicit registration in the generated chassis was rejected because existing and custom entrypoints would require source migration. Vite or source transforms were rejected as fragile coupling to Project code shape. An always-global or loopback-network bridge was rejected because it would widen the control surface and outlive the session boundary.

## Consequences

Bridge capability and protocol version are negotiated at startup. Projects on older engine versions must upgrade rather than receive a tooling-side polyfill, and a ready Run Session owns exactly one live `Game`.
