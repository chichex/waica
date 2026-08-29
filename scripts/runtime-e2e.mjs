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

async function makeFixture({ parent, engineRoot, viteBin, negative = false, projection = false }) {
  const prefix = negative
    ? 'waica-no-game-'
    : projection
      ? 'waica-projection-'
      : 'waica-runtime-'
  const project = await mkdtemp(path.join(parent, prefix))
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
    : projection
      ? `import { Component, DynamicBody, Game, Tilemap, loadScene } from '@waica/engine'

class ControlProbe extends Component {
  static componentName = 'ControlProbe'

  onUpdate() {
    const body = this.entity.get(DynamicBody)
    if (body) body.vx = this.game.input.held('right') ? 6 : 0
  }

  inspectState() {
    return {
      renderPosition: {
        x: this.entity.node.position.x,
        y: this.entity.node.position.y,
      },
    }
  }
}

const canvas = document.querySelector('#game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing game canvas')
const game = new Game({
  canvas,
  resolution: { width: 320, height: 180 },
  bindings: { right: [] },
})
loadScene(
  game,
  {
    waicaScene: 3,
    render: { projection: 'isometric' },
    entities: [
      {
        name: 'Map',
        position: [2, 0],
        components: [
          {
            type: 'Tilemap',
            props: {
              color: 0xff5533,
              mapWidth: 1,
              mapHeight: 1,
              cells: [0],
              solidTiles: [0],
            },
          },
        ],
      },
      {
        name: 'Player',
        position: [0, 0.5],
        components: [
          { type: 'ControlProbe' },
          { type: 'DynamicBody', props: { width: 1, height: 1 } },
        ],
      },
    ],
  },
  { components: { ControlProbe, DynamicBody, Tilemap } },
)
game.start()
`
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

function assertScreenshot(
  result,
  expectedMode,
  expectedDimensions = { width: 320, height: 180 },
) {
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
  assert.deepEqual(
    { width: dimensions.width, height: dimensions.height },
    expectedDimensions,
  )
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

async function runProjectionLeg({ client, project, chrome }) {
  const start = await call(client, 'start_project', {
    project_path: project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 15_000,
  })
  assert.equal(start.isError, undefined, `projection start_project failed: ${JSON.stringify(start)}`)
  assert.equal(start.structuredContent.mode, 'paused')
  const initial = start.structuredContent.initialSnapshot.entities.find(
    (entity) => entity.name === 'Player',
  )
  assert.ok(initial, 'projection initial snapshot must contain Player')
  assert.deepEqual(
    { x: initial.transform.position.x, y: initial.transform.position.y },
    { x: 0, y: 0.5 },
    'projection snapshot starts in logical coordinates',
  )

  await call(client, 'control_runtime', {
    project_path: project,
    operation: 'hold',
    action: 'right',
  })
  await call(client, 'control_runtime', {
    project_path: project,
    operation: 'step',
    dt: 1 / 60,
    frames: 60,
  })
  await call(client, 'control_runtime', {
    project_path: project,
    operation: 'release',
    action: 'right',
  })
  await call(client, 'control_runtime', {
    project_path: project,
    operation: 'step',
    dt: 1 / 60,
    frames: 1,
  })

  const inspected = await call(client, 'inspect_runtime', {
    project_path: project,
    entity_names: ['Player'],
    component_types: ['ControlProbe'],
  })
  const player = inspected.structuredContent.snapshot.entities[0]
  assert.ok(player, 'projection snapshot must contain Player after stepping')
  assert.ok(
    Math.abs(player.transform.position.x - 1.5) < 0.001,
    `logical player must stop flush at tile face; got x=${player.transform.position.x}`,
  )
  assert.equal(player.transform.position.y, 0.5)
  const renderPosition = player.components[0]?.state?.renderPosition
  assert.ok(renderPosition, 'ControlProbe must expose node.position')
  assert.ok(
    Math.abs(renderPosition.x - (player.transform.position.x - player.transform.position.y)) < 1e-9,
    'render x must equal projectIsometric(logical position).x',
  )
  assert.ok(
    Math.abs(renderPosition.y + (player.transform.position.x + player.transform.position.y) / 2) < 1e-9,
    'render y must equal projectIsometric(logical position).y',
  )

  const shot = assertScreenshot(
    await call(client, 'capture_screenshot', { project_path: project }),
    'paused',
  )
  const stopped = await call(client, 'stop_project', { project_path: project })
  assert.equal(stopped.structuredContent.stopped, true)
  await assertUrlClosed(start.structuredContent.url)
  return {
    projectionUrl: start.structuredContent.url,
    projectionPngBytes: Buffer.from(shot.image, 'base64').byteLength,
  }
}

/**
 * The topdown leg: a real generated Project (create_project archetype:
 * 'topdown') through the same Run Session — semantic move input must move
 * the player AND the directional animation contract must respond: walking
 * east plays walk-e, reversing keeps the east art mirrored (flipX) with
 * the motor facing west.
 */
async function runTopdownLeg({ client, root, parent, chrome, viteBin, engineRoot }) {
  const project = path.join(parent, 'waica-topdown')
  const created = await call(client, 'create_project', {
    project_path: project,
    start: 'demo',
    archetype: 'topdown',
  })
  assert.equal(created.isError, undefined, `create_project(topdown) failed: ${JSON.stringify(created)}`)

  // The generated dev script expects an installed toolchain; the fixture
  // runs the workspace vite (its empty config is equivalent to defaults) and
  // drops the devDependencies so the readiness dependency check only sees
  // the @waica libraries materialized below.
  const manifestPath = path.join(project, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.scripts.dev = `node ${quoteForPackageScript(viteBin)}`
  delete manifest.devDependencies
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await rm(path.join(project, 'vite.config.ts'), { force: true })
  await materializeRuntimeDependencies(project, engineRoot)
  for (const directory of ['behaviors', 'archetype-topdown']) {
    await copyPackage(
      path.join(root, 'packages', directory),
      path.join(project, 'node_modules/@waica', directory),
    )
  }

  const start = await call(client, 'start_project', {
    project_path: project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 15_000,
  })
  assert.equal(start.isError, undefined, `topdown start_project failed: ${JSON.stringify(start)}`)
  assert.equal(start.structuredContent.mode, 'paused')
  assert.ok(
    start.structuredContent.initialSnapshot.entities.some((entity) => entity.name === 'Player'),
    'topdown initial snapshot must contain Player',
  )

  const inspectPlayer = async () => {
    const inspected = await call(client, 'inspect_runtime', {
      project_path: project,
      entity_names: ['Player'],
    })
    const player = inspected.structuredContent.snapshot.entities[0]
    assert.ok(player, 'topdown snapshot must contain Player')
    const state = (type) => player.components.find((component) => component.type === type)?.state
    return {
      position: player.transform.position,
      motor: state('TopDownMotor'),
      sprite: state('AnimatedSprite'),
    }
  }

  const hold = (action) =>
    call(client, 'control_runtime', { project_path: project, operation: 'hold', action })
  const release = (action) =>
    call(client, 'control_runtime', { project_path: project, operation: 'release', action })
  const step = () =>
    call(client, 'control_runtime', {
      project_path: project,
      operation: 'step',
      dt: 1 / 60,
      frames: 30,
    })

  const baseline = await inspectPlayer()
  assert.equal(baseline.sprite.current, 'idle-s', 'the paused player idles facing the camera')

  await hold('right')
  await step()
  await release('right')
  const east = await inspectPlayer()
  assert.ok(
    east.position.x > baseline.position.x + 0.5,
    `holding right must move the player east: ${baseline.position.x} -> ${east.position.x}`,
  )
  assert.equal(east.motor.facing, 'e', 'the motor must face east while walking east')
  assert.equal(east.sprite.current, 'walk-e', 'walking east must play the walk-e clip')
  assert.equal(east.sprite.flipX, false, 'east art is not mirrored')

  await hold('left')
  await step()
  await release('left')
  const west = await inspectPlayer()
  assert.ok(
    west.position.x < east.position.x - 0.2,
    `holding left must move the player back west: ${east.position.x} -> ${west.position.x}`,
  )
  assert.equal(west.motor.facing, 'w', 'the motor must face west after reversing')
  assert.equal(west.sprite.current, 'walk-e', 'west reuses the east clip via the contract fallback')
  assert.equal(west.sprite.flipX, true, 'the contract mirrors east art for west')

  const stopped = await call(client, 'stop_project', { project_path: project })
  assert.equal(stopped.structuredContent.stopped, true)
  await assertUrlClosed(start.structuredContent.url)
  return { topdownUrl: start.structuredContent.url }
}

/**
 * The isometric leg uses a generated Project and a project-owned observation
 * probe so the public Runtime Snapshot can report render position without
 * adding debug state to IsoMotor. Input remains semantic and simulation stays
 * paused with exact frame steps throughout.
 */
async function runIsometricLeg({ client, root, parent, chrome, viteBin, engineRoot }) {
  const project = path.join(parent, 'waica-isometric')
  const created = await call(client, 'create_project', {
    project_path: project,
    start: 'demo',
    archetype: 'isometric',
  })
  assert.equal(
    created.isError,
    undefined,
    `create_project(isometric) failed: ${JSON.stringify(created)}`,
  )

  const manifestPath = path.join(project, 'package.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.scripts.dev = `node ${quoteForPackageScript(viteBin)}`
  delete manifest.devDependencies
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await rm(path.join(project, 'vite.config.ts'), { force: true })
  await materializeRuntimeDependencies(project, engineRoot)
  for (const directory of ['behaviors', 'archetype-isometric']) {
    await copyPackage(
      path.join(root, 'packages', directory),
      path.join(project, 'node_modules/@waica', directory),
    )
  }

  const probeDirectory = path.join(project, 'src/components')
  await mkdir(probeDirectory, { recursive: true })
  await writeFile(
    path.join(probeDirectory, 'render-probe.ts'),
    [
      "import { Component } from '@waica/engine'",
      'export class RenderProbe extends Component {',
      "  static componentName = 'RenderProbe'",
      '  inspectState() {',
      '    return { renderPosition: { x: this.entity.node.position.x, y: this.entity.node.position.y } }',
      '  }',
      '}',
    ].join('\n'),
  )
  const playerPrefabPath = path.join(project, 'src/characters/player.character.json')
  const playerPrefab = JSON.parse(await readFile(playerPrefabPath, 'utf8'))
  playerPrefab.components.push({ type: 'RenderProbe' })
  await writeFile(playerPrefabPath, `${JSON.stringify(playerPrefab, null, 2)}\n`)

  const start = await call(client, 'start_project', {
    project_path: project,
    browser_executable_path: chrome.executablePath,
    timeout_ms: 15_000,
  })
  assert.equal(start.isError, undefined, `isometric start_project failed: ${JSON.stringify(start)}`)
  assert.equal(start.structuredContent.mode, 'paused')

  const inspectPlayer = async () => {
    const inspected = await call(client, 'inspect_runtime', {
      project_path: project,
      entity_names: ['Player'],
    })
    const player = inspected.structuredContent.snapshot.entities[0]
    assert.ok(player, 'isometric snapshot must contain Player')
    const state = (type) => player.components.find((component) => component.type === type)?.state
    return {
      position: player.transform.position,
      motor: state('IsoMotor'),
      sprite: state('AnimatedSprite'),
      render: state('RenderProbe')?.renderPosition,
    }
  }
  const hold = (action) =>
    call(client, 'control_runtime', { project_path: project, operation: 'hold', action })
  const release = (action) =>
    call(client, 'control_runtime', { project_path: project, operation: 'release', action })
  const step = (frames = 1) =>
    call(client, 'control_runtime', {
      project_path: project,
      operation: 'step',
      dt: 1 / 60,
      frames,
    })

  const baseline = await inspectPlayer()
  assert.equal(baseline.sprite.current, 'idle-s', 'the isometric player starts facing the camera')
  assert.ok(baseline.render, 'RenderProbe must expose the projected node position')

  await hold('right')
  await step(10)
  const east = await inspectPlayer()
  const logicalDx = east.position.x - baseline.position.x
  const logicalDy = east.position.y - baseline.position.y
  assert.ok(logicalDx > 0, `screen-right must increase logical x; delta=${logicalDx}`)
  assert.ok(logicalDy < 0, `screen-right must decrease logical y; delta=${logicalDy}`)
  assert.ok(
    Math.abs(logicalDx + logicalDy) < 1e-9,
    `screen-right logical deltas must be equal and opposite; dx=${logicalDx}, dy=${logicalDy}`,
  )
  assert.ok(
    east.render.x > baseline.render.x && Math.abs(east.render.y - baseline.render.y) < 1e-9,
    `screen-right must move purely right in render space: ${JSON.stringify(baseline.render)} -> ${JSON.stringify(east.render)}`,
  )
  assert.equal(east.motor.facing, 'e')
  assert.equal(east.sprite.current, 'walk-e')
  assert.equal(east.sprite.flipX, false)

  let contact
  for (let frame = 0; frame < 90; frame += 1) {
    await step()
    const current = await inspectPlayer()
    if (current.motor.vx === 0 || current.motor.vy === 0) {
      contact = current
      break
    }
  }
  assert.ok(contact, 'holding right must reach a Tilemap-derived Solid')
  assert.ok(
    Math.abs(contact.position.x - 10.55) < 0.002,
    `the player must stop flush at the water cell left face; x=${contact.position.x}`,
  )
  await release('right')

  await hold('left')
  await step(30)
  await release('left')
  const west = await inspectPlayer()
  assert.equal(west.motor.facing, 'w')
  assert.equal(west.sprite.current, 'walk-e')
  assert.equal(west.sprite.flipX, true)

  await hold('up')
  await hold('right')
  await step(15)
  await release('right')
  const northEast = await inspectPlayer()
  assert.equal(northEast.motor.facing, 'ne')
  assert.equal(northEast.sprite.current, 'walk-ne')
  assert.equal(northEast.sprite.flipX, false)

  await hold('left')
  await step(15)
  await release('left')
  await release('up')
  const northWest = await inspectPlayer()
  assert.equal(northWest.motor.facing, 'nw')
  assert.equal(northWest.sprite.current, 'walk-ne')
  assert.equal(northWest.sprite.flipX, true)

  await runIsometricCombat({ client, project, inspectPlayer, hold, release, step })

  const shot = assertScreenshot(
    await call(client, 'capture_screenshot', { project_path: project }),
    'paused',
    { width: 640, height: 360 },
  )
  const png = pngDimensions(shot.image)
  assert.ok(png.png.byteLength > PNG_SIGNATURE.length, 'isometric screenshot must contain PNG data')

  const stopped = await call(client, 'stop_project', { project_path: project })
  assert.equal(stopped.structuredContent.stopped, true)
  await assertUrlClosed(start.structuredContent.url)
  return {
    isometricUrl: start.structuredContent.url,
    isometricPngBytes: png.png.byteLength,
  }
}

/**
 * The combat half of the isometric leg, on the demo's own cast: a sword
 * swing plays the attack clip along the facing, a swing next to the orc
 * takes one of its two hearts, and walking into the orc costs the player a
 * heart on the HUD stat, a stun and a blink. The player is walked into
 * place by reading the snapshot: logical x runs screen south-east
 * (right+down) / north-west (left+up), logical y screen south-west
 * (left+down) / north-east (right+up).
 */
async function runIsometricCombat({ client, project, inspectPlayer, hold, release, step }) {
  const press = (action) =>
    call(client, 'control_runtime', { project_path: project, operation: 'press', action })
  const inspect = async (name, types) => {
    const inspected = await call(client, 'inspect_runtime', {
      project_path: project,
      entity_names: [name],
      ...(types ? { component_types: types } : {}),
    })
    const entity = inspected.structuredContent.snapshot.entities[0]
    assert.ok(entity, `isometric snapshot must contain ${name}`)
    const state = (type) => entity.components.find((component) => component.type === type)?.state
    return { position: entity.transform.position, state, stats: inspected.structuredContent.snapshot.stats }
  }
  const inspectOrc = () => inspect('Orc', ['Health', 'StateMachine', 'Patrol'])
  const playerState = async () => {
    const player = await inspect('Player', ['Health', 'StateMachine', 'AnimatedSprite', 'IsoMotor'])
    return {
      position: player.position,
      health: player.state('Health'),
      machine: player.state('StateMachine'),
      sprite: player.state('AnimatedSprite'),
      motor: player.state('IsoMotor'),
      stats: player.stats,
    }
  }

  // (a) A swing plays the attack clip facing the way the player looks.
  await hold('right')
  await step(1)
  await release('right')
  await press('attack')
  await step(1)
  const swinging = await playerState()
  assert.equal(swinging.machine.current, 'attack', 'the attack press must enter the attack state')
  assert.equal(swinging.sprite.current, 'attack-e', 'swinging while facing east plays attack-e')
  assert.equal(swinging.sprite.flipX, false, 'east art is not mirrored')
  await step(20)
  const swung = await playerState()
  assert.equal(swung.machine.current, 'idle', 'the swing hands control back after 0.3 s')
  assert.equal(swung.sprite.current, 'idle-e', 'the player idles facing east after the swing')

  // Walk to logical (10, 8.85): on the orc's rail column, just north of the
  // rail (contact starts past y ≈ 9.25), facing it (south-west, logical +y).
  const AXIS_ACTIONS = {
    x: { positive: ['right', 'down'], negative: ['left', 'up'] },
    y: { positive: ['left', 'down'], negative: ['right', 'up'] },
  }
  const approach = async (axis, target) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let { position } = await inspectPlayer()
      const delta = target - position[axis]
      if (Math.abs(delta) < 0.15) return position
      const actions = AXIS_ACTIONS[axis][delta > 0 ? 'positive' : 'negative']
      for (const action of actions) await hold(action)
      for (let frame = 0; frame < 240; frame += 1) {
        await step(1)
        position = (await inspectPlayer()).position
        const remaining = target - position[axis]
        // The motor coasts about 0.45 units after release.
        if (Math.abs(remaining) < 0.4 || Math.sign(remaining) !== Math.sign(delta)) break
      }
      for (const action of actions) await release(action)
      await step(30)
    }
    throw new Error(`could not walk the player to logical ${axis} = ${target}`)
  }
  await approach('x', 10)
  await approach('y', 8.85)
  await hold('left')
  await hold('down')
  await step(1)
  await release('left')
  await release('down')
  await step(30)
  const posted = await playerState()
  assert.equal(posted.motor.facing, 'sw', 'the player must face the rail (screen south-west)')
  assert.equal(posted.health.current, 3, 'walking into position must not cost a heart')
  assert.ok(posted.position.y < 9.2, `the player must stay north of the rail; y=${posted.position.y}`)

  // (b) Swing when the orc walks past: one of its two hearts.
  const orcBefore = await inspectOrc()
  assert.equal(orcBefore.state('Health').current, 2, 'the orc starts with two hearts')
  let aligned = false
  for (let frame = 0; frame < 400 && !aligned; frame += 1) {
    await step(1)
    const orc = await inspectOrc()
    aligned = Math.abs(orc.position.x - posted.position.x) < 0.12
  }
  assert.ok(aligned, 'the orc must walk past the player within 400 frames')
  await press('attack')
  await step(1)
  const struckOrc = await inspectOrc()
  assert.equal(struckOrc.state('Health').current, 1, 'a swing next to the orc takes one heart')
  await step(1)
  assert.equal((await inspectOrc()).state('StateMachine').current, 'hurt', 'the orc flinches')
  await step(20)

  // (c) Walk into the orc: a heart on the HUD stat, a stun and a blink.
  await hold('left')
  await hold('down')
  let hit
  for (let frame = 0; frame < 90 && !hit; frame += 1) {
    await step(1)
    const player = await playerState()
    if (player.health.current < 3) hit = player
  }
  await release('left')
  await release('down')
  assert.ok(hit, 'walking into the orc must cost the player a heart')
  assert.equal(hit.health.current, 2)
  assert.equal(hit.stats.health, 2, 'the health stat mirrors the lost heart')
  assert.equal(hit.health.blinking, true, 'the invulnerability window blinks the player')
  await step(1)
  const stunned = await playerState()
  assert.equal(stunned.machine.current, 'hurt', 'the hit stuns the player')
  assert.equal(stunned.health.lastDamageSource, 'Orc')
  await step(30)
  assert.equal((await playerState()).machine.current, 'idle', 'the stun ends on its own')
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
  includeTopdown = true,
  includeIsometric = true,
  includeProjection = true,
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
  const projection = includeProjection
    ? await makeFixture({ parent: temporaryParent, engineRoot, viteBin, projection: true })
    : undefined
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
    const projectionResult = projection
      ? await runProjectionLeg({ client, project: projection.project, chrome })
      : {}
    const topdownResult = includeTopdown
      ? await runTopdownLeg({
          client,
          root,
          parent: temporaryParent,
          chrome,
          viteBin,
          engineRoot,
        })
      : {}
    const isometricResult = includeIsometric
      ? await runIsometricLeg({
          client,
          root,
          parent: temporaryParent,
          chrome,
          viteBin,
          engineRoot,
        })
      : {}
    if (negative) await runNegativeReadiness({ client, fixture: negative, chrome })
    const result = {
      label,
      chromeExecutable: chrome.executablePath,
      chromeVersion: chrome.version,
      durationMs: Date.now() - startedAt,
      ...happyResult,
      ...projectionResult,
      ...topdownResult,
      ...isometricResult,
    }
    console.log(`waica runtime e2e (${label}): ${JSON.stringify(result)}`)
    return result
  } catch (error) {
    throw new Error(`${error.message}\nMCP stderr:\n${stderr}`, { cause: error })
  } finally {
    if (connected) {
      for (const fixture of [happy, projection, negative].filter(Boolean)) {
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
