// resources/app/main.js of an exported game: hands the real Electron modules
// to the shell (ADR 0032). Everything it does is in shell.ts.
import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { startShell } from './shell.js'

startShell({ app, BrowserWindow, ipcMain, protocol }, { appDir: import.meta.dirname, platform: process.platform }).catch(
  (error: unknown) => {
    console.error('[waica] the desktop shell failed to start:', error)
    app.exit(1)
  },
)
