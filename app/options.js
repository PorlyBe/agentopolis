// options: what the settings panel offers and POST /api/settings accepts. server.mjs imports this file as well, so it
// stays plain data with no DOM. A tower feature missing from FEATURE_GROUPS always runs and has no toggle.
export const SKINS = ['classic', 'cyberpunk', 'cottage', 'brutalist']
export const HOLIDAY_KEYS = ['newyear', 'valentine', 'lunar', 'hanami', 'goldenweek', 'tanabata', 'obon', 'tsukimi', 'halloween', 'christmas']
const THEME_ALIAS = { cherryblossom: 'hanami', sakura: 'hanami', 'new-year': 'newyear', valentines: 'valentine', xmas: 'christmas' }

// 'cyberpunk+halloween' → { skin, holiday, name, bad }: holiday null = the date's own, 'none' = no holiday decor;
// bad lists the parts that are neither a skin nor a holiday (or a second of either)
export function parseTheme(name) {
  let skin = null, holiday = null
  const bad = []
  for (const raw of String(name || 'auto').toLowerCase().split(/[+, ]/).filter(Boolean)) {
    const p = THEME_ALIAS[raw] || raw
    if (SKINS.includes(p) && !skin) skin = p
    else if (HOLIDAY_KEYS.includes(p) && !holiday) holiday = p
    else if (p !== 'auto') bad.push(raw)
  }
  if (!skin && !holiday) return { skin: 'classic', holiday: null, name: 'auto', bad }
  return { skin: skin || 'classic', holiday: holiday || 'none', name: [skin, holiday].filter(Boolean).join('+'), bad }
}

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
  { id: 'seasonal', label: 'Seasonal', features: [
    ['holidays', 'Holiday decor from the calendar (New Year, hanami, Tanabata…)'],
    ['friday-drinks', 'Drinks on the roof from 17:00 on Fridays'],
  ] },
]
export const FEATURE_NAMES = FEATURE_GROUPS.flatMap(g => g.features.map(f => f[0]))
