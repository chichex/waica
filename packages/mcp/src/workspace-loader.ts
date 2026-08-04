import type { ResolveHook } from 'node:module'

let mappings: Readonly<Record<string, string>> = {}

export function initialize(data: Readonly<Record<string, string>>): void {
  mappings = data
}

export const resolve: ResolveHook = (specifier, context, nextResolve) => {
  const mapped = mappings[specifier]
  return mapped ? { url: mapped, shortCircuit: true } : nextResolve(specifier, context)
}
