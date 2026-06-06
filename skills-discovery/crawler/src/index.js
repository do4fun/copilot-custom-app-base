import { crawlGithubAwesome, crawlGithubSearch } from './crawlers/github.js'
import { crawlNpm }                              from './crawlers/npm.js'
import { crawlGeneric }                          from './crawlers/generic.js'
import { log, done }                             from './emit.js'

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf-8')
}

async function main() {
  let config
  try {
    const raw = await readStdin()
    config = JSON.parse(raw)
  } catch (e) {
    process.stderr.write(`Cannot parse config from stdin: ${e.message}\n`)
    process.exit(1)
  }

  const { type } = config
  log(`type=${type}  url=${config.url}`)

  try {
    switch (type) {
      case 'github-awesome': await crawlGithubAwesome(config); break
      case 'github-search':  await crawlGithubSearch(config);  break
      case 'npm':            await crawlNpm(config);            break
      case 'generic':        await crawlGeneric(config);        break
      default:               log(`Type inconnu: ${type}`)
    }
  } catch (e) {
    process.stderr.write(`${e.stack || e.message}\n`)
    log(`Erreur fatale: ${e.message}`)
  }

  done(0)
}

main().catch(e => {
  process.stderr.write(`Fatal: ${e.stack || e.message}\n`)
  process.exit(1)
})
