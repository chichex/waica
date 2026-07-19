import { defineConfig } from 'vite'
import { waicaDev } from '@waica/overlay/vite'

export default defineConfig({
  plugins: [waicaDev()],
})
