import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const example = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
const destination = new URL('../.env', import.meta.url)
const contents = example.replace(/^SESSION_SECRET=$/m, 'SESSION_SECRET=' + randomBytes(32).toString('hex'))

try {
  await writeFile(destination, contents, { flag: 'wx', mode: 0o600 })
  console.info('Created .env with a new session secret.')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.info('Using the existing .env file.')
}
