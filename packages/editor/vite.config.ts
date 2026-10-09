import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // One three for the whole bundle (ADR 0027): addons such as GLTFLoader import
  // 'three', the engine draws with 'three/webgpu'. Only the bare specifier is
  // redirected; three/webgpu, three/tsl and three/addons/* stay as they are.
  resolve: { alias: [{ find: /^three$/, replacement: 'three/webgpu' }] },
})
