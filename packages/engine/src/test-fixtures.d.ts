// Test-only: a checked-in binary fixture imported with Vite's `?inline`, which
// hands back the file as a base64 data URI. Excluded from builds like every
// `test-*` file.
declare module '*.glb?inline' {
  const dataUri: string
  export default dataUri
}
