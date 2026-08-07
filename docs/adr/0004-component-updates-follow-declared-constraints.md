# Component updates follow declared constraints, not prefab order

Waica derives each entity's `onUpdate` schedule from component-owned `updateAfter` constraints and uses stable `componentName` order as the deterministic tie-break. Prefab component-array order is composition only. Authored order, phases, numeric priorities and prefab-level overrides were rejected because a read-after-write dependency belongs to the consuming behavior and must remain stable across every prefab.

Only classes with `onUpdate` participate, and component identity is unique per entity. An invalid graph fails closed for that entity instead of inventing fallback semantics. This replaces ADR-0003's premise that component update order is prefab-authored; its damage-model decision remains valid, but that scheduling rationale must be reconciled when this contract is implemented.
