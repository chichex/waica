// resources/app/main.js of an exported game: hands the real Electron modules
// to the shell (ADR 0032). Everything it does is in shell.ts.
import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { createRequire } from 'node:module'
import path from 'node:path'
import { startShell } from './shell.js'

const appDir = import.meta.dirname
// steamworks.js is CommonJS with a native addon, installed beside this file only in an export with Steam.
const loadSteamworks = (): unknown => createRequire(path.join(appDir, 'package.json'))('steamworks.js')

startShell(
  { app, BrowserWindow, ipcMain, protocol },
  { appDir, platform: process.platform, loadSteamworks, warn: (line) => console.warn(line) },
).catch((error: unknown) => {
  console.error('[waica] the desktop shell failed to start:', error)
  app.exit(1)
})
