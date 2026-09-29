// The MCP tests import the editor's project template, whose files Vite loads
// as `?raw` strings; this program declares that module shape itself instead
// of pulling in the editor's browser-only declarations.
declare module '*?raw' {
  const content: string
  export default content
}
