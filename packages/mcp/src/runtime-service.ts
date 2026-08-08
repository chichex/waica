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
  | { projectPath: string; operation: 'press' | 'hold' | 'release'; action: string }
  | { projectPath: string; operation: 'pause' | 'resume' }
  | { projectPath: string; operation: 'step'; dt?: number; frames?: number }

export interface RuntimeScreenshotResult {
  metadata: Record<string, unknown>
  data: string
}

export interface RuntimeService {
  start(input: StartRuntimeInput): Promise<Record<string, unknown>>
  stop(projectPath: string): Promise<Record<string, unknown>>
  inspect(input: RuntimeInspectInput): Promise<Record<string, unknown>>
  control(input: RuntimeControlInput): Promise<Record<string, unknown>>
  captureScreenshot(projectPath: string): Promise<RuntimeScreenshotResult>
  close(): Promise<void>
}
