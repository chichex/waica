// The page is bundled by Vite: a `?url` import of the engine's rig fixture
// resolves to the served file's URL (the bench program has no vite/client types).
declare module '*.glb?url' {
  const url: string
  export default url
}
