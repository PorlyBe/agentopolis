// options: what the settings panel offers and POST /api/settings accepts. server.mjs imports this file as well, so it
// stays plain data with no DOM. A tower feature missing from FEATURE_GROUPS always runs and has no toggle.
export const SKINS = ['classic', 'cyberpunk', 'cottage', 'brutalist', 'synthwave', 'noir', 'underwater', 'space-station', 'gameboy', 'blueprint', 'steampunk', 'winter-cabin', 'candy']
export const HOLIDAY_KEYS = ['newyear', 'valentine', 'lunar', 'hanami', 'goldenweek', 'tanabata', 'obon', 'tsukimi', 'halloween', 'christmas']
const THEME_ALIAS = { cherryblossom: 'hanami', sakura: 'hanami', 'new-year': 'newyear', valentines: 'valentine', xmas: 'christmas', space: 'space-station', winter: 'winter-cabin', gb: 'gameboy' }

// 'cyberpunk+halloween' → { skin, holiday, name, bad }: holiday null = the date's own, 'none' = no holiday decor;
// bad lists the parts that are neither a skin nor a holiday (or a second of either). A saved custom theme is
// 'custom:<slug>'; pass the saved slugs to check it exists (the page resolves it itself and falls back to classic).
export function parseTheme(name, customs = null) {
  let skin = null, holiday = null
  const bad = []
  for (const raw of String(name || 'auto').toLowerCase().split(/[+, ]/).filter(Boolean)) {
    const p = THEME_ALIAS[raw] || raw, slug = p.startsWith('custom:') ? p.slice(7) : null
    if (slug !== null && SLUG.test(slug) && (!customs || customs.includes(slug)) && !skin) skin = p
    else if (SKINS.includes(p) && !skin) skin = p
    else if (HOLIDAY_KEYS.includes(p) && !holiday) holiday = p
    else if (p !== 'auto') bad.push(raw)
  }
  if (!skin && !holiday) return { skin: 'classic', holiday: null, name: 'auto', bad }
  return { skin: skin || 'classic', holiday: holiday || 'none', name: [skin, holiday].filter(Boolean).join('+'), bad }
}

// custom themes (settings.customThemes): a base skin for decor and filter, and a colour per slot; themes.js derives the rest
export const THEME_SLOTS = ['sky', 'horizon', 'night', 'skyline', 'facade', 'floor', 'slab', 'street', 'accent']
export const MAX_CUSTOM = 12
const SLUG = /^[a-z0-9-]{1,24}$/
export const slugOf = name => String(name).trim().replace(/ +/g, '-')
export function checkCustomTheme(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return Error('custom theme: an object { name, base, colours }')
  const name = typeof t.name === 'string' ? t.name.trim().replace(/ +/g, ' ') : ''
  if (!/^[a-z0-9 -]{1,24}$/.test(name) || !SLUG.test(slugOf(name))) return Error('custom theme: a name of 1–24 characters, a–z 0–9 space and -')
  if (!SKINS.includes(t.base)) return Error(`custom theme ${name}: unknown base ${String(t.base).slice(0, 30)}`)
  if (!t.colours || typeof t.colours !== 'object') return Error(`custom theme ${name}: colours missing`)
  const colours = {}
  for (const k of THEME_SLOTS) {
    if (typeof t.colours[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(t.colours[k])) return Error(`custom theme ${name}: ${k} must be #rrggbb`)
    colours[k] = t.colours[k].toLowerCase()
  }
  return { name, base: t.base, colours }
}
export function checkCustomThemes(v) {
  if (!Array.isArray(v) || v.length > MAX_CUSTOM) return Error(`customThemes: up to ${MAX_CUSTOM} themes`)
  const out = []
  for (const t of v) {
    const ok = checkCustomTheme(t)
    if (ok instanceof Error) return ok
    if (out.some(o => slugOf(o.name) === slugOf(ok.name))) return Error(`custom theme ${ok.name}: the name is taken`)
    out.push(ok)
  }
  return out
}

// floor rules (settings.floorRules): the first whose pattern matches a session's title styles its floor (features/floor-decor.js)
export const FLOOR_PRESETS = {
  wallpaper: ['none', 'mint-stripes', 'blush-dots', 'brick', 'oak-panels', 'navy-grid', 'sky'],
  carpet: ['none', 'blue', 'green', 'red', 'grey', 'sand', 'purple'],
  plants: ['none', 'ferns', 'cacti', 'flowers', 'bonsai'],
  props: ['none', 'racks', 'moodboards', 'whiteboards', 'bookshelves', 'trophies'],
}
export const MAX_FLOOR_RULES = 20
export function checkFloorRules(v) {
  if (!Array.isArray(v) || v.length > MAX_FLOOR_RULES) return Error(`floorRules: up to ${MAX_FLOOR_RULES} rules`)
  const out = []
  for (const r of v) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return Error('floorRules: each rule is { pattern, wallpaper, carpet, plants, props }')
    const pattern = typeof r.pattern === 'string' ? r.pattern.trim() : ''
    if (!/^[^\u0000-\u001f\u007f?[\]{}()\\|^$+]{1,40}$/.test(pattern)) return Error('floorRules: a pattern of 1–40 characters, * as the only wildcard')
    const rule = { pattern }
    for (const [k, vals] of Object.entries(FLOOR_PRESETS)) {
      const val = r[k] ?? 'none'
      if (!vals.includes(val)) return Error(`floorRules: unknown ${k} ${String(val).slice(0, 30)}`)
      rule[k] = val
    }
    out.push(rule)
  }
  return out
}
const globs = new Map()
export function globMatch(pattern, text) {
  let re = globs.get(pattern)
  if (!re) { re = new RegExp('^' + pattern.split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i'); globs.set(pattern, re) }
  return re.test(text || '')
}
export const floorRuleFor = (rules, title) => (rules || []).find(r => globMatch(r.pattern, title)) || null

export const AVATAR = {
  hair: ['short', 'long', 'bun', 'curly', 'bald', 'mohawk'],
  haircolour: ['brown', 'black', 'blonde', 'red', 'grey', 'white', 'pink', 'blue'],
  suit: ['charcoal', 'navy', 'burgundy', 'forest', 'cream'],
  skin: ['1', '2', '3', '4', '5', '6'],
  glasses: ['none', 'round', 'square'],
  pet: ['none', 'cat', 'dog', 'claudio'],
}

export const FEATURE_GROUPS = [
  { id: 'work', label: 'Work signals', features: [
    ['storm-cloud', 'A little rain cloud over a floor when your messages to it sound grumpy; a thanks brings the sun back'],
    ['work-signals', 'Task boards, bug critters and error beacons on each floor'],
    ['mess', 'Floors get messier as context fills; a janitor tidies after a compaction'],
    ['groundhog', 'A character stuck retrying the same failing call walks in circles'],
    ['printer-jam', 'The copier jams on a tool call silent for minutes'],
    ['library', 'A book comes off the shelf when a skill loads'],
    ['test-lab', 'A flask per test suite, bubbling green or red'],
    ['plan-whiteboard', 'Plan mode sketches on a whiteboard'],
    ['phone-booth', 'A phone booth lights up while a browser is driven'],
    ['drones', 'Package downloads arrive by drone'],
    ['it-tech', 'An IT technician fixes a failing tool server'],
    ['tug-of-war', 'A merge conflict becomes a tug of war'],
    ['seismograph', 'Destructive commands shake the floor'],
    ['window-cleaner', 'A gondola cleans the windows when a formatter runs'],
    ['helipad', 'Remote and cloud work leaves by helicopter'],
    ['interoffice-mail', 'Agent-to-agent messages fly through a pneumatic tube'],
    ['commit-stamps', 'Commits stamp sheets into each desk’s OUT tray'],
    ['vending', 'The vending machine breaks when the API is overloaded'],
    ['security-desk', 'A guard stamps DENIED on blocked actions'],
  ] },
  { id: 'life', label: 'Office life', features: [
    ['readable-monitors', 'Zoom in on a desk to read its monitor: the live command, file or diff line'],
    ['floor-sounds', 'Zoomed in, you hear that floor: keyboards, the copier, the lift, coffee, traffic, roof wind'],
    ['cat-chaos', 'A stray cat makes mischief on floors that have been quiet for 10+ minutes'],
    ['move-in-out', 'Floors are built and moved out instead of popping'],
    ['waiting-line', 'Sessions waiting on you queue at your desk'],
    ['walkabout', 'You walk down to a floor when you send it a prompt'],
    ['milestone-cake', 'A cake at 100, 500 and 1000 tool calls'],
    ['time-clock', 'A punch clock with each session’s hours'],
    ['standup', 'A stand-up in the meeting room at 10:00'],
    ['lunch-rush', 'Idle characters go to the café at noon'],
    ['screensaver', 'The office dims when you’ve been away 30 minutes'],
    ['lost-found', 'A crate per worktree nobody works in'],
    ['hall-of-records', 'A trophy case of all-time bests'],
    ['window-heatmap', 'At night the windows chart today’s activity'],
    ['parking-garage', 'A car per session, by model'],
    ['uniforms', 'Hats follow the language being edited'],
    ['wardrobe', 'Outfits follow the model'],
  ] },
  { id: 'github', label: 'GitHub', features: [
    ['my-prs', 'Your open PRs on a board in your office'],
    ['post-room', 'A parcel per open PR in the basement'],
    ['merge-stamp', 'A MERGED stamp drops on merged parcels'],
    ['reviewer-visits', 'Reviewers walk over to your floor'],
    ['ci-subway', 'CI runs as a metro under the street'],
    ['deploy-rocket', 'Deploys launch as rockets from the roof'],
    ['fire-drill', 'A red default branch triggers a fire drill'],
    ['release-party', 'A ribbon and banner after a release'],
    ['refactor-crane', 'A crane on floors with big diffs'],
  ] },
  { id: 'outside', label: 'Outside & city', features: [
    ['skyline-towers', 'Other repos as distant towers'],
    ['blimp', 'A blimp towing the Gazette headline'],
    ['price-billboard', 'A crypto price billboard on the roof'],
  ] },
  { id: 'fun', label: 'Fun', features: [
    ['easter-eggs', 'A few hidden surprises around the tower'],
    ['tamagotchi-plant', 'A plant in your office that grows with your daily streak and wilts on a day off'],
  ] },
  { id: 'seasonal', label: 'Seasonal', features: [
    ['holidays', 'Holiday decor from the calendar (New Year, hanami, Tanabata…)'],
    ['friday-drinks', 'Drinks on the roof from 17:00 on Fridays'],
  ] },
]
export const FEATURE_NAMES = FEATURE_GROUPS.flatMap(g => g.features.map(f => f[0]))
