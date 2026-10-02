export type RuntimeErrorCode =
  | 'runtime-unsupported-host'
  | 'runtime-prerequisite-missing'
  | 'runtime-start-failed'
  | 'runtime-incompatible'
  | 'runtime-not-running'
  | 'runtime-invalid-state'
  | 'runtime-operation-failed'

export type RuntimeStage =
  | 'project'
  | 'package-manager'
  | 'dependencies'
  | 'dev-server'
  | 'browser'
  | 'page'
  | 'bridge'
  | 'game'
  | 'control'
  | 'cleanup'

export interface RuntimeErrorBody {
  code: RuntimeErrorCode
  stage: RuntimeStage
  message: string
  projectPath: string
  diagnostics?: Record<string, unknown>
}

export class RuntimeToolError extends Error {
  constructor(readonly body: RuntimeErrorBody) {
    super(body.message)
    this.name = 'RuntimeToolError'
  }
}

export interface StartRuntimeInput {
  projectPath: string
  browserExecutablePath?: string
  headless?: boolean
  viewport?: { width: number; height: number }
  timeoutMs?: number
}

export interface RuntimeInspectInput {
  projectPath: string
  entityIds?: string[]
  entityNames?: string[]
  componentTypes?: string[]
}

export type RuntimeControlInput =
  | { projectPath: string; operation: 'press' | 'release'; action: string }
  /** Holds at `value` in (0, 1]; without one, at 1 (issue #75). */
  | { projectPath: string; operation: 'hold'; action: string; value?: number }
  | { projectPath: string; operation: 'pause' | 'resume' }
  /** Advances `frames` whole Simulation Steps of 1/60 s each (default 1); no `dt`. */
  | { projectPath: string; operation: 'step'; frames?: number }
  | { projectPath: string; operation: 'click'; x: number; y: number }
  | { projectPath: string; operation: 'scene'; scene: string }

export interface RuntimeScreenshotResult {
  metadata: Record<string, unknown>
  data: string
}

/**
 * Per-call options. `signal` is the MCP host's cancellation for the tool
 * call: an aborted call rejects with the signal's reason and leaves no
 * half-registered Run Session behind.
 */
export interface RuntimeCallOptions {
  readonly signal?: AbortSignal
}

export interface RuntimeService {
  start(input: StartRuntimeInput, options?: RuntimeCallOptions): Promise<Record<string, unknown>>
  stop(projectPath: string): Promise<Record<string, unknown>>
  inspect(input: RuntimeInspectInput, options?: RuntimeCallOptions): Promise<Record<string, unknown>>
  control(input: RuntimeControlInput, options?: RuntimeCallOptions): Promise<Record<string, unknown>>
  captureScreenshot(projectPath: string, options?: RuntimeCallOptions): Promise<RuntimeScreenshotResult>
  close(): Promise<void>
}
