import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  access,
  appendFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CHROME_CANDIDATES = process.platform === 'darwin'
  ? [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ]
  : [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]

async function discoverChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate)
      const canonical = await realpath(candidate)
      const { stdout, stderr } = await execFileAsync(canonical, ['--version'])
      return { executablePath: canonical, version: `${stdout}${stderr}`.trim() }
    } catch {
      // A missing compatible browser is a gate failure, never a skip.
    }
  }
  throw new Error(
    `No compatible system Chrome/Chromium found. Checked: ${CHROME_CANDIDATES.join(', ')}`,
  )
}

async function filesBelow(root, relative = '') {
  const directory = path.join(root, relative)
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries
    .filter((entry) => entry.name !== 'node_modules')
    .map((entry) => {
      const next = path.join(relative, entry.name)
      return entry.isDirectory() ? filesBelow(root, next) : [next]
    }))
  return nested.flat().sort()
}

async function sourceHash(project) {
  const hash = createHash('sha256')
  for (const relative of await filesBelow(project)) {
    hash.update(relative)
    hash.update('\0')
    hash.update(await readFile(path.join(project, relative)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function findPackageRoot(entry, expectedName) {
  for (let current = path.dirname(entry); ; current = path.dirname(current)) {
    try {
      const manifest = JSON.parse(await readFile(path.join(current, 'package.json'), 'utf8'))
      if (manifest.name === expectedName) return current
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`Cannot locate package root for ${expectedName}`)
  }
}

async function copyPackage(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true })
  const sourceNodeModules = path.join(source, 'node_modules')
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (candidate) =>
      candidate !== sourceNodeModules && !candidate.startsWith(`${sourceNodeModules}${path.sep}`),
  })
}

async function materializeRuntimeDependencies(project, engineRoot) {
  const engineDestination = path.join(project, 'node_modules/@waica/engine')
  await copyPackage(engineRoot, engineDestination)
  const requireFromEngine = createRequire(path.join(engineRoot, 'package.json'))
  const threeEntry = requireFromEngine.resolve('three')
  const threeRoot = await findPackageRoot(threeEntry, 'three')
  await copyPackage(threeRoot, path.join(project, 'node_modules/three'))
}

function quoteForPackageScript(value) {
  return JSON.stringify(value)
}

async function makeFixture({ parent, engineRoot, viteBin, negative = false }) {
  const project = await mkdtemp(path.join(parent, negative ? 'waica-no-game-' : 'waica-runtime-'))
  const engineManifest = JSON.parse(await readFile(path.join(engineRoot, 'package.json'), 'utf8'))
  const packageJson = {
    name: path.basename(project),
    private: true,
    type: 'module',
    scripts: { dev: `node ${quoteForPackageScript(viteBin)}` },
    dependencies: { '@waica/engine': engineManifest.version },
  }
  const index = `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin: 0; width: 100%; height: 100%; background: rgb(0, 0, 255); }
      #game-host { position: relative; width: 320px; height: 180px; }
      #game { display: block; width: 320px; height: 180px; }
      #unrelated { position: absolute; left: 400px; top: 0; width: 20px; height: 20px; background: lime; }
    </style>
  </head>
  <body>
    <div id="game-host"><canvas id="game"></canvas></div>
    <div id="unrelated"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`
  const main = negative
    ? `throw new Error('fixture exploded before Game.start()')\n`
    : `import { Component, Game } from '@waica/engine'

class Mover extends Component {
  static componentName = 'Mover'
  distance = 0
  speed = 60

  onUpdate(dt) {
    if (!this.game.input.held('right')) return
    this.distance += this.speed * dt
    this.entity.position.x = this.distance
    this.game.stats.set('distance', this.distance)
  }
}

const canvas = document.querySelector('#game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing game canvas')
const game = new Game({
  canvas,
  resolution: { width: 320, height: 180 },
  bindings: { right: [] },
  stats: { distance: 0 },
})
game.ui.define('probe', '<style>#pixel { position:absolute; left:8px; top:8px; width:24px; height:24px; background:rgb(255,0,0) }</style><div id="pixel"></div>')
game.ui.show('probe')
const mover = game.spawn('Player')
mover.add(Mover)
game.start()
`
  await mkdir(path.join(project, 'src'), { recursive: true })
  await writeFile(path.join(project, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`)
  await writeFile(path.join(project, 'index.html'), index)
  await writeFile(path.join(project, 'src/main.ts'), main)
  await writeFile(
    path.join(project, 'src/game.json'),
    `${JSON.stringify({ waicaGame: 1, resolution: { mode: 'fixed', width: 320, height: 180 } }, null, 2)}\n`,
  )
  await materializeRuntimeDependencies(project, engineRoot)
  return { project, index }
}

function plainResult(result) {
  if ('toolResult' in result) throw new Error('Unexpected MCP task result')
  return result
}

function jsonText(result) {
  const plain = plainResult(result)
  const text = plain.content.find((item) => item.type === 'text')
  if (!text || text.type !== 'text') throw new Error(`Missing JSON text block: ${JSON.stringify(result)}`)
  return JSON.parse(text.text)
}

async function call(client, name, args, timeout = 60_000) {
  return plainResult(await client.callTool(
    { name, arguments: args },
    undefined,
    { timeout },
  ))
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() <= deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

async function assertUrlClosed(url) {
  await waitFor(async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(150) })
      await response.body?.cancel()
      return false
    } catch {
      return true
    }
  }, 5_000, `closed port ${url}`)
}

function pngDimensions(data) {
  const png = Buffer.from(data, 'base64')
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE, 'screenshot must have a PNG signature')
  return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

async function samplePixel(playwright, executablePath, base64, x, y) {
  const browser = await playwright.chromium.launch({ executablePath, headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 180 }, deviceScaleFactor: 1 })
    return await page.evaluate(async ({ base64, x, y }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('missing 2d context')
      context.drawImage(image, 0, 0)
      return [...context.getImageData(x, y, 1, 1).data]
    }, { base64, x, y })
  } finally {
    await browser.close()
  }
}

function assertScreenshot(result, expectedMode) {
  assert.equal(result.isError, undefined, `capture_screenshot failed: ${JSON.stringify(result)}`)
  const text = result.content.find((item) => item.type === 'text')
  const image = result.content.find((item) => item.type === 'image')
  assert.ok(text && text.type === 'text', 'screenshot must contain one metadata text block')
  assert.ok(image && image.type === 'image', 'screenshot must contain one image block')
  assert.equal(image.mimeType, 'image/png')
  const parsed = JSON.parse(text.text)
  assert.deepEqual(parsed, result.structuredContent, 'text and structured screenshot metadata must match')
  assert.equal(parsed.mode, expectedMode)
  assert.ok(!text.text.includes(image.data), 'metadata text must not duplicate PNG base64')
  assert.ok(!JSON.stringify(result.structuredContent).includes(image.data), 'structured metadata must not duplicate PNG base64')
  const dimensions = pngDimensions(image.data)
  assert.deepEqual({ width: dimensions.width, height: dimensions.height }, { width: 320, height: 180 })
  return { metadata: parsed, image: image.data }
}

async function runHappyPath({
  client,
  project,
  chrome,
  playwright,
  includeReload,
  includeAlias,
}) {
  const canonicalProject = await realpath(project)
  const before = await sourceHash(project)
  const start = await call(client, 'start_project', {
    project_path: project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 15_000,
  })
  assert.equal(start.isError, undefined, `start_project failed: ${JSON.stringify(start)}`)
  const started = start.structuredContent
  assert.equal(started.projectPath, canonicalProject)
  assert.equal(started.reused, false)
  assert.deepEqual(started.viewport, { width: 320, height: 180 })
  assert.equal(started.bridgeVersion, 1)
  assert.equal(started.mode, 'paused')
  assert.equal(started.frame, 0)
  assert.equal(started.simulationTime, 0)
  assert.deepEqual(started.provenance, [
    { package: '@waica/engine', version: started.engineVersion, source: 'project' },
  ])
  const initialPlayer = started.initialSnapshot.entities.find((entity) => entity.name === 'Player')
  assert.ok(initialPlayer, 'initial snapshot must contain Player')
  assert.equal(initialPlayer.transform.position.x, 0)
  assert.equal(await sourceHash(project), before, 'start_project must not edit Project source')

  if (includeAlias) {
    const alias = `${project}-alias`
    await symlink(project, alias, process.platform === 'win32' ? 'junction' : 'dir')
    try {
      const reused = await call(client, 'start_project', {
        project_path: alias,
        browser_executable_path: chrome.executablePath,
      })
      assert.equal(reused.structuredContent.reused, true)
      assert.equal(reused.structuredContent.projectPath, canonicalProject)
    } finally {
      await rm(alias, { recursive: true, force: true })
    }
  }

  const pausedShot = assertScreenshot(
    await call(client, 'capture_screenshot', { project_path: project }),
    'paused',
  )
  const pixel = await samplePixel(playwright, chrome.executablePath, pausedShot.image, 16, 16)
  assert.ok(
    pixel[0] > 240 && pixel[1] < 15 && pixel[2] < 15 && pixel[3] === 255,
    `paused screenshot must include the red HTML UI overlay; sampled ${pixel.join(',')}`,
  )

  await call(client, 'control_runtime', {
    project_path: project,
    operation: 'hold',
    action: 'right',
  })
  const stepped = await call(client, 'control_runtime', {
    project_path: project,
    operation: 'step',
    dt: 1 / 60,
    frames: 3,
  })
  assert.equal(stepped.structuredContent.frame, 3)
  assert.equal(stepped.structuredContent.simulationTime, 0.05)
  assert.deepEqual(stepped.structuredContent.heldActions, ['right'])
  await call(client, 'control_runtime', {
    project_path: project,
    operation: 'release',
    action: 'right',
  })
  const inspected = await call(client, 'inspect_runtime', {
    project_path: project,
    entity_names: ['Player'],
    component_types: ['Mover'],
  })
  const player = inspected.structuredContent.snapshot.entities[0]
  assert.equal(inspected.structuredContent.frame, 3)
  assert.equal(player.transform.position.x, 3)
  assert.equal(player.components[0].state.distance, 3)

  const resumed = await call(client, 'control_runtime', {
    project_path: project,
    operation: 'resume',
  })
  assert.equal(resumed.structuredContent.mode, 'real-time')
  const realtimeShot = assertScreenshot(
    await call(client, 'capture_screenshot', { project_path: project }),
    'real-time',
  )
  assert.equal(realtimeShot.metadata.bridgeVersion, 1)
  const realtimePixel = await samplePixel(
    playwright,
    chrome.executablePath,
    realtimeShot.image,
    16,
    16,
  )
  assert.ok(
    realtimePixel[0] > 240 && realtimePixel[1] < 15 && realtimePixel[2] < 15 && realtimePixel[3] === 255,
    `real-time screenshot must include the red HTML UI overlay; sampled ${realtimePixel.join(',')}`,
  )
  await call(client, 'control_runtime', { project_path: project, operation: 'pause' })

  if (includeReload) {
    const indexFile = path.join(project, 'index.html')
    const originalIndex = await readFile(indexFile, 'utf8')
    await appendFile(indexFile, '\n<!-- force full reload -->\n')
    await waitFor(async () => {
      const response = await call(client, 'inspect_runtime', { project_path: project })
      if (response.isError) return false
      return response.structuredContent.frame === 0 &&
        response.structuredContent.snapshot.entities.some((entity) =>
          entity.name === 'Player' && entity.transform.position.x === 0)
    }, 15_000, 'fresh paused baseline after reload')
    await writeFile(indexFile, originalIndex)
    await waitFor(async () => {
      const response = await call(client, 'inspect_runtime', { project_path: project })
      return !response.isError && response.structuredContent.frame === 0
    }, 15_000, 'fresh baseline after restoring source')
    assert.equal(await sourceHash(project), before, 'reload exercise must restore Project source byte-for-byte')
  }

  const stopped = await call(client, 'stop_project', { project_path: project })
  assert.deepEqual(stopped.structuredContent, { projectPath: canonicalProject, stopped: true })
  await assertUrlClosed(started.url)
  const stoppedAgain = await call(client, 'stop_project', { project_path: project })
  assert.deepEqual(stoppedAgain.structuredContent, { projectPath: canonicalProject, stopped: false })
  assert.equal(await sourceHash(project), before, 'the complete Run Session must leave source unchanged')

  return {
    url: started.url,
    engineVersion: started.engineVersion,
    pausedPngBytes: Buffer.from(pausedShot.image, 'base64').byteLength,
    realtimePngBytes: Buffer.from(realtimeShot.image, 'base64').byteLength,
  }
}

async function runNegativeReadiness({ client, fixture, chrome }) {
  const result = await call(client, 'start_project', {
    project_path: fixture.project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 1_000,
  }, 30_000)
  assert.equal(result.isError, true, 'HTTP 200 without Game.start() must fail readiness')
  const body = jsonText(result).error
  assert.ok(['page', 'bridge'].includes(body.stage), `unexpected readiness stage: ${body.stage}`)
  const output = `${body.diagnostics?.stdout ?? ''}\n${body.diagnostics?.stderr ?? ''}`
  const match = output.match(/http:\/\/127\.0\.0\.1:\d+\//)
  if (match) await assertUrlClosed(match[0])
}

export async function runRuntimeE2e({
  root,
  cliPath,
  engineRoot,
  label = 'checkout',
  includeNegative = true,
  includeReload = true,
  includeAlias = true,
}) {
  if (process.platform === 'win32') {
    throw new Error('The browser e2e gate requires its supported macOS/Linux host, not Windows.')
  }
  const startedAt = Date.now()
  const chrome = await discoverChrome()
  const requireFromMcp = createRequire(path.join(root, 'packages/mcp/package.json'))
  const { Client } = requireFromMcp('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = requireFromMcp('@modelcontextprotocol/sdk/client/stdio.js')
  const playwright = requireFromMcp('playwright-core')
  const requireFromEditor = createRequire(path.join(root, 'packages/editor/package.json'))
  const viteRoot = await findPackageRoot(requireFromEditor.resolve('vite'), 'vite')
  const viteBin = path.join(viteRoot, 'bin/vite.js')
  const temporaryParent = await mkdtemp(path.join(tmpdir(), `waica-${label}-e2e-`))
  const happy = await makeFixture({ parent: temporaryParent, engineRoot, viteBin })
  const negative = includeNegative
    ? await makeFixture({ parent: temporaryParent, engineRoot, viteBin, negative: true })
    : undefined
  const client = new Client({ name: `waica-${label}-runtime-e2e`, version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp'],
    cwd: root,
    stderr: 'pipe',
  })
  let stderr = ''
  let connected = false
  transport.stderr?.on('data', (chunk) => {
    stderr += chunk.toString()
  })
  try {
    await client.connect(transport, { timeout: 15_000 })
    connected = true
    const happyResult = await runHappyPath({
      client,
      project: happy.project,
      chrome,
      playwright,
      includeReload,
      includeAlias,
    })
    if (negative) await runNegativeReadiness({ client, fixture: negative, chrome })
    const result = {
      label,
      chromeExecutable: chrome.executablePath,
      chromeVersion: chrome.version,
      durationMs: Date.now() - startedAt,
      ...happyResult,
    }
    console.log(`waica runtime e2e (${label}): ${JSON.stringify(result)}`)
    return result
  } catch (error) {
    throw new Error(`${error.message}\nMCP stderr:\n${stderr}`, { cause: error })
  } finally {
    if (connected) {
      for (const fixture of [happy, negative].filter(Boolean)) {
        await call(
          client,
          'stop_project',
          { project_path: fixture.project },
          10_000,
        ).catch(() => {})
      }
    }
    await client.close().catch(() => {})
    await rm(temporaryParent, { recursive: true, force: true })
  }
}
