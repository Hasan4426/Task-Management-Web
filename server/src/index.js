import { createServer } from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { connectDatabase } from './database.js'
import { logFailure } from './errors.js'

async function start() {
  let config
  try {
    config = loadConfig()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }

  const database = await connectDatabase(config)
  try {
    const server = createServer(createApp({ config, database }))
    server.requestTimeout = 15000
    server.headersTimeout = 10000
    let stopping = false

    async function shutdown(exitCode) {
      if (stopping) return
      stopping = true
      const deadline = setTimeout(() => server.closeAllConnections(), 10000)
      deadline.unref()
      await new Promise((resolve) => server.close(resolve))
      clearTimeout(deadline)
      try {
        await database.client.close()
      } catch (error) {
        logFailure(console, 'shutdown_failed', error)
        exitCode = 1
      }
      process.exitCode = exitCode
    }

    server.on('error', (error) => {
      logFailure(console, 'server_failed', error)
      void shutdown(1)
    })
    process.once('SIGINT', () => { void shutdown(0) })
    process.once('SIGTERM', () => { void shutdown(0) })
    server.listen(config.port, config.host, () => {
      console.info({ event: 'server_listening', host: config.host, port: config.port })
    })
  } catch (error) {
    await database.client.close().catch(() => {})
    throw error
  }
}

start().catch((error) => {
  logFailure(console, 'startup_failed', error)
  process.exitCode = 1
})
