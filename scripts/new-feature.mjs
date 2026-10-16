// new-feature: scaffold a tower plugin from the examples and register it.
// usage: npm run new-feature <name> [-- --server]
//   app/tower/features/<name>.js       from app/tower/features/_example.js, imported and added to FEATURES in registry.js
//   server/features/<name>.mjs         from server/features/_example.mjs.example (with --server)
// Its demo is ?demo=<name without hyphens> (coffee-machine → coffeemachine). It refuses to overwrite anything, and a
// name whose demo another feature already answers to.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2), name = args.find(a => !a.startsWith('-')), server = args.includes('--server')
const die = msg => { console.error(msg); process.exit(1) }
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) die('usage: npm run new-feature <name> [-- --server]   (name: lower-case words joined by hyphens, e.g. coffee-machine)')

const camel = name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()), demo = name.replace(/-/g, '')
const rel = p => path.relative(ROOT, p)
const client = path.join(ROOT, 'app/tower/features', name + '.js'), serverFile = path.join(ROOT, 'server/features', name + '.mjs')
const registryFile = path.join(ROOT, 'app/tower/registry.js')
let registry = fs.readFileSync(registryFile, 'utf8')

if (fs.existsSync(client)) die(`${rel(client)} already exists`)
if (server && fs.existsSync(serverFile)) die(`${rel(serverFile)} already exists`)
if (registry.includes(`'./features/${name}.js'`) || registry.includes(`['${name}',`)) die(`${name} is already registered in ${rel(registryFile)}`)
if (new RegExp(`^import ${camel} from`, 'm').test(registry)) die(`${rel(registryFile)} already imports something called ${camel}`)
// a feature reads its demo with api.demo('<name>', ...aliases); another one answering to ours would play along
const claims = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? claims(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : [])
for (const f of claims(path.join(ROOT, 'app'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/api\.demo\(([^)]*)\)/g)) if (m[1].split(',').some(a => a.trim().replace(/^'|'$/g, '') === demo)) die(`?demo=${demo} is already taken by ${rel(f)}`)

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

// register: an import after the last feature import, an entry at the end of FEATURES (its closing ']]')
const imports = [...registry.matchAll(/^import \w+ from '\.\/features\/[^']+'\n/gm)]
const list = /^const FEATURES = \[[\s\S]*?\]\]$/m.exec(registry)
if (!imports.length || !list) die(`can't find the feature imports or FEATURES in ${rel(registryFile)}; register it by hand`)
const last = imports.at(-1), at = last.index + last[0].length, close = list.index + list[0].length - 1
registry = registry.slice(0, at) + `import ${camel} from './features/${name}.js'\n` + registry.slice(at, close) + `, ['${name}', ${camel}]` + registry.slice(close)

fs.writeFileSync(client, clientSrc)
if (server) fs.writeFileSync(serverFile, swap(fs.readFileSync(path.join(ROOT, 'server/features/_example.mjs.example'), 'utf8'), `// ${name}: TODO what it reads and what it attaches (session.ext['${name}']).`))
fs.writeFileSync(registryFile, registry)
console.log(`created ${rel(client)}${server ? ` and ${rel(serverFile)}` : ''}, registered '${name}' in ${rel(registryFile)}`)
console.log(`next: pick a free spot, then npm run demo and open http://127.0.0.1:4747/?demo=${demo}`)
