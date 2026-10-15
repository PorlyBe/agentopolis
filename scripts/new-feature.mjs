// new-feature: scaffold a tower plugin from the examples and register it.
// usage: npm run new-feature <name> [-- --server]
//   app/tower/features/<name>.js       from app/tower/features/_example.js, imported and added to FEATURES in tower.js
//   server/features/<name>.mjs         from server/features/_example.mjs.example (with --server)
// It refuses to overwrite anything.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2), name = args.find(a => !a.startsWith('-')), server = args.includes('--server')
const die = msg => { console.error(msg); process.exit(1) }
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) die('usage: npm run new-feature <name> [-- --server]   (name: lower-case words joined by hyphens, e.g. coffee-machine)')

const camel = name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()), demo = name.replace(/-/g, '')
const rel = p => path.relative(ROOT, p)
const client = path.join(ROOT, 'app/tower/features', name + '.js'), serverFile = path.join(ROOT, 'server/features', name + '.mjs')
const towerFile = path.join(ROOT, 'app/tower/tower.js')
let tower = fs.readFileSync(towerFile, 'utf8')

if (fs.existsSync(client)) die(`${rel(client)} already exists`)
if (server && fs.existsSync(serverFile)) die(`${rel(serverFile)} already exists`)
if (tower.includes(`'./features/${name}.js'`) || tower.includes(`['${name}',`)) die(`${name} is already registered in ${rel(towerFile)}`)
if (new RegExp(`^import ${camel} from`, 'm').test(tower)) die(`${rel(towerFile)} already imports something called ${camel}`)

// the examples' header comments describe the example; the copy gets a stub to fill in
const swap = (src, header) => {
  const body = src.replace(/^(\/\/.*\n|\n)*/, '')
  const out = header + '\n' + body.replace(/^const NAME = 'example'/m, `const NAME = '${name}'`).replace(/^const DEMO = 'example'/m, `const DEMO = '${demo}'`)
  if (!out.includes(`const NAME = '${name}'`)) die('the example no longer has a `const NAME = ...` line; update scripts/new-feature.mjs')
  return out
}
let clientSrc = fs.readFileSync(path.join(ROOT, 'app/tower/features/_example.js'), 'utf8')
clientSrc = swap(clientSrc, `// ${name}: TODO what it shows, what data drives it. ?demo=${demo} plays it with invented data.`)
if (!clientSrc.includes(`const DEMO = '${demo}'`)) die('the example no longer has a `const DEMO = ...` line; update scripts/new-feature.mjs')

// register: an import after the last feature import, an entry at the end of FEATURES
const imports = [...tower.matchAll(/^import \w+ from '\.\/features\/[^']+'\n/gm)]
const start = tower.indexOf('const FEATURES = ['), stop = tower.indexOf('\nconst ', start + 1)
const close = tower.lastIndexOf(']', stop)
if (!imports.length || start < 0 || close < start) die(`can't find the feature imports or FEATURES in ${rel(towerFile)}; register it by hand`)
const last = imports.at(-1), at = last.index + last[0].length
tower = tower.slice(0, at) + `import ${camel} from './features/${name}.js'\n` + tower.slice(at, close) + `, ['${name}', ${camel}]` + tower.slice(close)

fs.writeFileSync(client, clientSrc)
if (server) fs.writeFileSync(serverFile, swap(fs.readFileSync(path.join(ROOT, 'server/features/_example.mjs.example'), 'utf8'), `// ${name}: TODO what it reads and what it attaches (session.ext['${name}']).`))
fs.writeFileSync(towerFile, tower)
console.log(`created ${rel(client)}${server ? ` and ${rel(serverFile)}` : ''}, registered '${name}' in ${rel(towerFile)}`)
console.log(`next: pick a free spot, then npm run demo and open http://127.0.0.1:4747/?demo=${demo}`)
