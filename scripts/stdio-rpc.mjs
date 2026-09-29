const STDERR_TAIL_CHARS = 4_000

/** Splits a stdout stream into JSON-RPC messages, one per line, and hands each to `onMessage`. */
function readMessages(stdout, onMessage) {
  let buffer = ''
  stdout.setEncoding('utf8')
  stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.trim()) onMessage(JSON.parse(line))
    }
  })
}

/** The requests still awaiting an answer, each bounded by its own deadline. */
function pendingRequests({ timeoutMs, diagnostic }) {
  const pending = new Map()
  return {
    wait(id, method) {
      return new Promise((resolve, reject) => {
        const settle = (fn) => (value) => {
          clearTimeout(timer)
          fn(value)
        }
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(diagnostic(`${method} got no answer within ${timeoutMs} ms`))
        }, timeoutMs)
        pending.set(id, { resolve: settle(resolve), reject: settle(reject) })
      })
    },
    answer(message) {
      const waiter = pending.get(message.id)
      if (!waiter) return
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
      else waiter.resolve(message.result)
    },
    rejectAll(reason) {
      for (const waiter of pending.values()) waiter.reject(diagnostic(reason))
      pending.clear()
    },
  }
}

/**
 * Minimal JSON-RPC over the stdio of a raw `waica mcp` child, so the leg can
 * signal the process itself and read its exit code (the SDK client transport
 * owns its child and hides both). Every request is bounded: it rejects when
 * `timeoutMs` passes or when the child exits before answering, with the tail
 * of the child's stderr, so a crashed server fails the run instead of
 * hanging it until the CI timeout.
 */
export function stdioRpc(child, { timeoutMs = 30_000 } = {}) {
  let nextId = 1
  let stderrTail = ''
  let exited = null
  const diagnostic = (reason) => new Error(`${reason}\nchild stderr tail:\n${stderrTail}`)
  const pending = pendingRequests({ timeoutMs, diagnostic })
  readMessages(child.stdout, (message) => pending.answer(message))
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_CHARS)
  })
  child.stdin.on('error', (error) => pending.rejectAll(`child stdin failed: ${error.message}`))
  child.once('exit', (code, signal) => {
    exited = `code ${code}, signal ${signal}`
    pending.rejectAll(`child exited before answering (${exited})`)
  })
  const send = (message) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
  return {
    request(method, params) {
      if (exited) return Promise.reject(diagnostic(`child already exited (${exited}) before ${method}`))
      const id = nextId++
      const answered = pending.wait(id, method)
      send({ id, method, params })
      return answered
    },
    notify(method, params = {}) {
      send({ method, params })
    },
  }
}
