import type { PageScenarioReport } from '../results.ts'

/** The page's single entry point for the runner, set by main.ts. */
export interface BenchPageApi {
  result: Promise<PageScenarioReport>
}

declare global {
  interface Window {
    __waicaBench?: BenchPageApi
  }
}
