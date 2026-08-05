type NativeImport = (specifier: string) => Promise<Record<string, unknown>>

const nativeImport: NativeImport = (specifier) => import(specifier)

module.exports = nativeImport
