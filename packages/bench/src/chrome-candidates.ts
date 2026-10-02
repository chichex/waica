/**
 * Where the benchmark looks for Chrome, per platform: the same fixed list as
 * scripts/runtime-e2e.mjs (playwright-core downloads no browser). The runner
 * (chrome.ts) and the remote preflight (remote-plan.ts) share it, so a host
 * that passes the preflight has a Chrome the runner finds.
 */
export const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
} as const
