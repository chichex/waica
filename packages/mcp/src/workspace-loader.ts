interface LoaderData {
  mappings: Record<string, string>
  parentPrefixes: string[]
}

let mappings: Record<string, string> = {}
let parentPrefixes: string[] = []

export function initialize(data: LoaderData): void {
  mappings = data.mappings
  parentPrefixes = data.parentPrefixes
}

export function resolve(
  specifier: string,
  context: { parentURL?: string },
  nextResolve: (
    specifier: string,
    context: { parentURL?: string },
  ) => Promise<{ url: string }>,
): Promise<{ url: string; shortCircuit?: boolean }> {
  const mapped = mappings[specifier]
  const parentURL = context.parentURL
  const bundledParent =
    parentURL !== undefined && parentPrefixes.some((prefix) => parentURL.startsWith(prefix))
  return mapped && bundledParent
    ? Promise.resolve({ url: mapped, shortCircuit: true })
    : nextResolve(specifier, context)
}
