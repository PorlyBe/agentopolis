// themes: the tower's skin. A theme is a skin (materials for building.js and city.js, a tint over the finished frame and
// its own decor) plus a holiday from holidays.js's calendar, whose decor holidays.js and ambience.js keep drawing.
// The ⚙ settings panel or --theme <name> on the server (snap.theme); ?theme=<name> overrides both; ?demo=themes cycles them every 8 s.
// Names: auto (classic + the date's holiday), a skin (options.js SKINS), custom:<slug> (a theme saved from the Look tab's
// editor, snap.customThemes: a base skin's decor over nine colours, untinted), a holiday key (halloween, christmas,
// newyear, valentine, lunar, hanami, goldenweek, tanabata, obon, tsukimi: classic + that holiday) or skin+holiday.
import { setPalette, CLASSIC as TOWER, BW, SHAFT, WALL, SLAB, IX, FW, GROUND, STREET_L, PLAQUE, garageRect } from '../building.js'
import { CLASSIC as STREET } from '../city.js'
import { HOLIDAYS, pinHoliday } from './holidays.js'
import { parseTheme, slugOf, THEME_SLOTS } from '../../options.js'
import floorDecor from './floor-decor.js'
import { R, rnd } from '../draw.js'

const pool = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
const same = (o, v) => Object.fromEntries(Object.keys(o).map(k => [k, v]))
const KINDS = { session: 0, lobby: 0, meeting: 0, cafe: 0, ceo: 0, post: 0 }
const GLYPH = { H: '101101111101101', O: '111101101101111', T: '111010010010010', E: '111100110100111', L: '100100100100111',
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' }
function pixText(c, s, x, y, k = 1, down = false) {   // a 3x5 pixel font in the current fillStyle
  for (const ch of s) {
    const g = GLYPH[ch]
    if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(Math.round(x + i % 3 * k), Math.round(y + Math.floor(i / 3) * k), k, k)
    if (down) y += 6 * k + 1; else x += 4 * k
  }
}

// sky: false — the skin paints its own sky (grid paper, space, the sea): no sun, moon, stars, clouds or weather, and the
// real weather neither dulls the light nor shuts the roof. own: the weather family it already draws itself ('rain', 'snow').
// A custom theme takes its base's decor, sky and own, but not its tint: the nine colours are the theme's colouring, and a
// wash over them (blueprint's blue, noir's grey) would hide them. The Game Boy's four greens are a display mode and stay.
const SKINS = {
  classic: { label: 'Classic' },
  cyberpunk: {
    label: 'Cyberpunk',
    building: {
      interior: { session: '#433b5c', lobby: '#3a3452', meeting: '#3c3a56', cafe: '#463858', ceo: '#38324e', post: '#363a50' },
      wainscot: same(KINDS, '#2a2440'), slabTop: '#2e2c3c', slab: '#1e1d2a', slabLine: '#0e0e16', roofSlab: '#2a2838', roofSlabTop: '#3a3850',
      wall: '#2c2e3e', wallEdge: '#16171f', footing: '#1e1d2a', footingLine: '#0e0e16', doorFrame: '#16171f', glass: '#3ae0ff', skirting: '#7a2a8a',
      shaft: '#2a2c3a', shaftHi: '#4a5a7a', machine: '#2a2c3a', machineHi: '#3a3c50', machineLo: '#16171f', deck: '#2a2a36', deckLine: '#1a1a24',
      lamp: '200,120,255', roomGlow: 'rgba(60,30,90,.6)',
    },
    city: {
      skyFar: '#2c2a4c', skyNear: '#201e3c', skyWin: '120,230,255', soil: '#14121e', pebble: '#1e1a2a', walk: '#3a3a4c', walkLine: '#2a2a3a',
      road: '#17161f', lane: '#ff3fb4', curb: '#2a2a38', curbLine: '#14141c', post: '#22222e', bulb: '#7af0ff', lampGlow: '90,230,255',
      trunk: '#2a2030', leaf: '#245a5e', leafHi: '#3ae0c0', winLit: 'rgba(255,90,210,.85)',
      dayTop: [44, 26, 78], dayHz: [150, 64, 140], nightTop: [6, 4, 18], nightHz: [70, 20, 84],
      styles: [['#2e2a44', '#1e1a30', '#ff3fb4'], ['#24304a', '#162036', '#3ae0ff'], ['#3a2a3e', '#24182a', '#b46aff'], ['#1e3038', '#122028', '#3affc0']],
    },
    tint: [['multiply', 'rgba(110,80,170,.55)'], ['screen', 'rgba(40,0,60,.18)']], own: 'rain',
  },
  cottage: {
    label: 'Cottage',
    building: {
      interior: { session: '#ead9b6', lobby: '#e8d4ae', meeting: '#e0d2b0', cafe: '#ecdab8', ceo: '#e4cfa8', post: '#dac8a4' },
      wainscot: { session: '#8a6040', lobby: '#7a5434', meeting: '#8a6a48', cafe: '#9a7048', post: '#7a5a3a' },
      slabTop: '#a0703a', slab: '#6a4428', slabLine: '#4a2e1a', roofSlab: '#7a4a2a', roofSlabTop: '#9a6a3a', wall: '#b48a58', wallEdge: '#8a6438',
      footing: '#7a6a5a', footingLine: '#5a4a3a', doorFrame: '#5a3a22', glass: '#c8d8b0', skirting: '#5a3a22',
      shaft: '#7a5a3a', shaftHi: '#9a7a52', machine: '#a0603a', machineHi: '#c07a48', machineLo: '#7a4428', deck: '#a07a4a', deckLine: '#7a5a32',
      lamp: '255,186,100', roomGlow: 'rgba(96,62,24,.62)',
    },
    city: {
      skyFar: '#b9b2c2', skyNear: '#a39cb2', skyWin: '255,214,140', soil: '#4a3a24', pebble: '#5a4a2e', walk: '#c8b898', walkLine: '#a8987a',
      road: '#6a5a48', lane: '#7a6a56', curb: '#9a8a6a', curbLine: '#7a6a4e', post: '#3a2a1a', bulb: '#ffe0a0', lampGlow: '255,200,120',
      trunk: '#5a3e22', leaf: '#4a8a3a', leafHi: '#7ab84a', winLit: 'rgba(255,196,100,.9)',
      dayTop: [118, 160, 200], dayHz: [240, 222, 196], nightTop: [14, 12, 30], nightHz: [52, 40, 60],
      styles: [['#c87a5a', '#a05a40', '#e8c8a0'], ['#d8c098', '#b09870', '#f0e0c0'], ['#a0b088', '#80906a', '#d0d8b0'], ['#c8a0a0', '#a07a7a', '#e8d0c8']],
    },
    tint: [['soft-light', 'rgba(255,190,120,.3)'], ['multiply', 'rgba(255,242,222,.8)']],
  },
  brutalist: {
    label: 'Brutalist',
    building: {
      interior: { session: '#b8b6b0', lobby: '#c4c2bc', meeting: '#aeb0b0', cafe: '#bcbab4', ceo: '#a8a6a0', post: '#b0aea8' },
      wainscot: { ...same(KINDS, '#8e8c88'), ceo: '#5a5854' }, slabTop: '#9a9894', slab: '#7a7874', slabLine: '#3a3836', roofSlab: '#8a8884', roofSlabTop: '#a8a6a2',
      wall: '#a09e98', wallEdge: '#5a5854', footing: '#6a6864', footingLine: '#3a3836', doorFrame: '#3a3836', glass: '#9aa8b0', skirting: '#5a5854',
      shaft: '#8a8884', shaftHi: '#a8a6a2', machine: '#8a8884', machineHi: '#a8a6a2', machineLo: '#5a5854', deck: '#8a8884', deckLine: '#6a6864',
      lamp: '240,240,228', roomGlow: 'rgba(40,40,44,.5)',
    },
    city: {
      skyFar: '#a8acb2', skyNear: '#8e9298', skyWin: '235,235,225', soil: '#3a3836', pebble: '#4a4846', walk: '#a8a6a0', walkLine: '#8a8884',
      road: '#3a3a3c', lane: '#d8d8d0', curb: '#8a8884', curbLine: '#5a5854', post: '#2a2a2c', bulb: '#f0f0e8', lampGlow: '240,240,230',
      trunk: '#4a4440', leaf: '#5a6a5a', leafHi: '#6a7a6a', winLit: 'rgba(240,240,225,.8)',
      dayTop: [150, 160, 172], dayHz: [205, 208, 212], nightTop: [10, 12, 16], nightHz: [40, 44, 50],
      styles: [['#9a9894', '#7a7874', '#b8b6b2'], ['#8a8c90', '#6a6c70', '#a8aaae'], ['#a4a09a', '#84807a', '#c0bcb6'], ['#7e8084', '#5e6064', '#9ea0a4']],
    },
    tint: [['saturation', 'rgba(128,128,128,.72)'], ['multiply', 'rgba(232,232,236,1)']],
  },
  synthwave: {
    label: 'Synthwave',
    building: {
      interior: { session: '#3a2a5a', lobby: '#3e2a58', meeting: '#342a5a', cafe: '#442a5a', ceo: '#2e2450', post: '#30284e' },
      wainscot: same(KINDS, '#22163a'), slabTop: '#d8d4f0', slab: '#5a4a7a', slabLine: '#1a1030', roofSlab: '#4a3a6a', roofSlabTop: '#e8e4ff',
      wall: '#2a1e44', wallEdge: '#140c26', footing: '#1e1434', footingLine: '#0e0820', doorFrame: '#ff5ac8', glass: '#ff9a5a', skirting: '#ff3fb4',
      shaft: '#2a1e44', shaftHi: '#8a7ac0', machine: '#2a1e44', machineHi: '#8a7ac0', machineLo: '#140c26', deck: '#2a1e44', deckLine: '#ff3fb4',
      lamp: '255,120,220', roomGlow: 'rgba(80,20,90,.6)',
    },
    city: {
      skyFar: '#5a2a6a', skyNear: '#3a1a52', skyWin: '255,150,80', soil: '#12061e', pebble: '#12061e', walk: '#2a1a3e', walkLine: '#ff3fb4',
      road: '#140a22', lane: '#3ae0ff', curb: '#2a1a3e', curbLine: '#ff3fb4', post: '#2a1a3e', bulb: '#ff9af0', lampGlow: '255,90,210',
      trunk: '#2a1a3e', leaf: '#3a1a5a', leafHi: '#ff5ac8', winLit: 'rgba(255,140,220,.85)',
      dayTop: [40, 10, 80], dayHz: [255, 110, 90], nightTop: [10, 2, 30], nightHz: [150, 30, 120],
      styles: [['#3a2a5a', '#24183a', '#ff3fb4'], ['#2a2a5a', '#1a1a3a', '#3ae0ff'], ['#4a2a4a', '#2a1a2a', '#ff9a3a'], ['#2a1a4a', '#1a0e30', '#b46aff']],
    },
    tint: [['soft-light', 'rgba(255,60,200,.3)'], ['multiply', 'rgba(235,205,255,.9)']],
  },
  noir: {
    label: 'Noir',
    building: {
      interior: { session: '#9a968e', lobby: '#a29e96', meeting: '#8e8e8e', cafe: '#a09a90', ceo: '#8a8478', post: '#949088' },
      wainscot: { ...same(KINDS, '#5a5650'), ceo: '#3a3632' }, slabTop: '#6a6660', slab: '#3a3836', slabLine: '#1a1918', roofSlab: '#2e2c2a', roofSlabTop: '#5a5854',
      wall: '#3e3c3a', wallEdge: '#1e1d1c', footing: '#2a2928', footingLine: '#121212', doorFrame: '#1e1d1c', glass: '#8a9094', skirting: '#2a2826',
      shaft: '#3a3836', shaftHi: '#5a5854', machine: '#3a3836', machineHi: '#5a5854', machineLo: '#1e1d1c', deck: '#4a4846', deckLine: '#2a2826',
      lamp: '255,236,200', roomGlow: 'rgba(20,20,20,.6)',
    },
    city: {
      skyFar: '#4a4a50', skyNear: '#363638', skyWin: '240,230,200', soil: '#1a1a1a', pebble: '#242424', walk: '#5a5a5a', walkLine: '#444444',
      road: '#1e1e20', lane: '#8a8a8a', curb: '#4a4a4a', curbLine: '#2a2a2a', post: '#1a1a1a', bulb: '#f0ead8', lampGlow: '240,230,200',
      trunk: '#2a2a2a', leaf: '#3a3a3a', leafHi: '#4a4a4a', winLit: 'rgba(240,230,200,.8)',
      dayTop: [70, 72, 80], dayHz: [130, 132, 138], nightTop: [4, 4, 8], nightHz: [26, 26, 32],
      styles: [['#5a5856', '#3a3836', '#7a7876'], ['#4a4a4e', '#2e2e32', '#6a6a6e'], ['#6a6662', '#4a4642', '#8a8682'], ['#3e3e40', '#262628', '#5e5e60']],
    },
    tint: [['saturation', 'rgb(128,128,128)'], ['soft-light', 'rgba(0,0,0,.4)']], own: 'rain',
  },
  underwater: {
    label: 'Underwater',
    building: {
      interior: { session: '#a8d0cc', lobby: '#b0d6d0', meeting: '#a0c8d0', cafe: '#b4d8cc', ceo: '#98c0c0', post: '#a4c8c4' },
      wainscot: same(KINDS, '#4a8a8a'), slabTop: '#5a9aa0', slab: '#2a5a6a', slabLine: '#1a3a4a', roofSlab: '#2a5a6a', roofSlabTop: '#6aaab0',
      wall: '#3a7a84', wallEdge: '#24525c', footing: '#2a4a54', footingLine: '#1a3038', doorFrame: '#24525c', glass: '#8ae0f0', skirting: '#2a5a6a',
      shaft: '#3a6a74', shaftHi: '#6aaab4', machine: '#3a6a74', machineHi: '#6aaab4', machineLo: '#24525c', deck: '#5a8a8a', deckLine: '#3a6a6a',
      lamp: '160,240,255', roomGlow: 'rgba(10,50,70,.55)',
    },
    city: {
      skyFar: '#2e7486', skyNear: '#246274', skyWin: '160,240,255', soil: '#8a7a54', pebble: '#a8966a', walk: '#d4c294', walkLine: '#bca878',
      road: '#7a6e54', lane: '#e8dcb4', curb: '#bca878', curbLine: '#9a8a64', post: '#2a4a54', bulb: '#bff4ff', lampGlow: '140,230,255',
      trunk: '#c85a4a', leaf: '#e8705a', leafHi: '#ffa890', winLit: 'rgba(160,240,255,.85)',
      dayTop: [8, 50, 96], dayHz: [40, 150, 170], nightTop: [2, 8, 26], nightHz: [8, 40, 64],
      styles: [['#3a8a8a', '#2a6a6a', '#8ad0c8'], ['#c87a6a', '#a05a4a', '#f0b0a0'], ['#c8b488', '#a89468', '#e8d8b0'], ['#4a7aa0', '#3a5a80', '#8ab8d8']],
    },
    tint: [['multiply', 'rgba(130,215,225,.75)'], ['screen', 'rgba(0,50,80,.22)']], sky: false,
  },
  'space-station': {
    label: 'Space station',
    building: {
      interior: { session: '#c8ccd4', lobby: '#ced2da', meeting: '#c0c8d4', cafe: '#d0d4d8', ceo: '#b8bcc8', post: '#c4c8d0' },
      wainscot: same(KINDS, '#8a909c'), slabTop: '#a0a8b4', slab: '#4a5260', slabLine: '#2a3038', roofSlab: '#5a6270', roofSlabTop: '#b0b8c4',
      wall: '#6a7280', wallEdge: '#3a4048', footing: '#3a4048', footingLine: '#22262c', doorFrame: '#3a4048', glass: '#6ab0ff', skirting: '#3a4048',
      shaft: '#4a5260', shaftHi: '#7a8494', machine: '#5a6270', machineHi: '#8a94a4', machineLo: '#3a4048', deck: '#5a6270', deckLine: '#f0c020',
      lamp: '200,230,255', roomGlow: 'rgba(20,40,70,.55)',
    },
    city: {
      skyFar: '#1a1e2a', skyNear: '#242a38', skyWin: '120,200,255', soil: '#14161c', pebble: '#1e2128', walk: '#4a505c', walkLine: '#2a2e36',
      road: '#2a2e36', lane: '#f0c020', curb: '#5a606c', curbLine: '#3a404c', post: '#3a404c', bulb: '#9ad8ff', lampGlow: '120,200,255',
      trunk: '#3a404c', leaf: '#4a505c', leafHi: '#6ab0ff', winLit: 'rgba(140,210,255,.85)',
      dayTop: [2, 2, 8], dayHz: [10, 12, 28], nightTop: [0, 0, 4], nightHz: [6, 6, 20],
      styles: [['#5a6270', '#3a4048', '#8a94a4'], ['#4a5464', '#2e3644', '#6ab0ff'], ['#6a7080', '#4a5060', '#f0c020'], ['#525a68', '#343a46', '#9aa4b4']],
    },
    tint: [['multiply', 'rgba(205,218,240,.85)']], sky: false,
  },
  gameboy: { label: 'Game Boy', quantise: true },
  blueprint: {
    label: 'Blueprint',
    building: {
      interior: same({ ...KINDS, server: 0 }, '#2a5a9a'), wainscot: same({ ...KINDS, server: 0 }, '#24508a'),
      slabTop: '#3a6aa8', slab: '#1e4a86', slabLine: '#163a6a', roofSlab: '#1e4a86', roofSlabTop: '#3a6aa8',
      wall: '#1e4a86', wallEdge: '#163a6a', footing: '#1a4278', footingLine: '#163a6a', doorFrame: '#163a6a', glass: '#3a6aaa', skirting: '#24508a',
      shaft: '#1e4a86', shaftHi: '#3a6aa8', machine: '#1e4a86', machineHi: '#3a6aa8', machineLo: '#163a6a', deck: '#24508a', deckLine: '#163a6a',
      lamp: '200,225,255', roomGlow: 'rgba(10,30,70,.5)',
    },
    city: {
      skyFar: '#2a5a9a', skyNear: '#24508e', skyWin: '220,235,255', soil: '#173c70', pebble: '#1a4278', walk: '#24508e', walkLine: '#3a6aa8',
      road: '#1e4680', lane: '#dce8f8', curb: '#24508e', curbLine: '#3a6aa8', post: '#dce8f8', bulb: '#ffffff', lampGlow: '200,225,255',
      trunk: '#dce8f8', leaf: '#2a5a9a', leafHi: '#4a7ab8', winLit: 'rgba(220,235,255,.6)',
      dayTop: [24, 70, 140], dayHz: [34, 88, 160], nightTop: [10, 30, 70], nightHz: [20, 50, 100],
      styles: [['#2a5a9a', '#1e4a86', '#4a7ab8'], ['#24508e', '#1a4278', '#3a6aa8'], ['#3060a0', '#22508a', '#5080c0'], ['#2a5490', '#1e4680', '#4070b0']],
    },
    tint: [['color', 'rgb(40,96,176)']], sky: false,
  },
  steampunk: {
    label: 'Steampunk',
    building: {
      interior: { session: '#d8c4a0', lobby: '#d4bc94', meeting: '#ccb894', cafe: '#dcc6a0', ceo: '#c8b088', post: '#c4ae8a' },
      wainscot: same(KINDS, '#6a4424'), slabTop: '#c8963a', slab: '#7a4a2a', slabLine: '#4a2a16', roofSlab: '#8a5a32', roofSlabTop: '#d8a84a',
      wall: '#8a5a3a', wallEdge: '#5a3a22', footing: '#5a4030', footingLine: '#3a2a1a', doorFrame: '#b8862e', glass: '#c8b080', skirting: '#b8862e',
      shaft: '#6a4a2e', shaftHi: '#c8963a', machine: '#8a5a32', machineHi: '#c8963a', machineLo: '#5a3a22', deck: '#7a5a3a', deckLine: '#c8963a',
      lamp: '255,190,110', roomGlow: 'rgba(90,50,20,.6)',
    },
    city: {
      skyFar: '#a89070', skyNear: '#8a7458', skyWin: '255,200,120', soil: '#3a2a1a', pebble: '#4a3826', walk: '#9a8a6a', walkLine: '#7a6a4e',
      road: '#4a3e30', lane: '#c8963a', curb: '#8a7a5a', curbLine: '#5a4a34', post: '#4a3020', bulb: '#ffd890', lampGlow: '255,190,110',
      trunk: '#4a3020', leaf: '#5a6a3a', leafHi: '#7a8a4a', winLit: 'rgba(255,190,100,.9)',
      dayTop: [170, 150, 120], dayHz: [230, 200, 150], nightTop: [20, 14, 10], nightHz: [70, 44, 30],
      styles: [['#8a4a32', '#6a3422', '#c8963a'], ['#6a5a48', '#4a3e30', '#b8862e'], ['#9a6a3a', '#7a4e28', '#d8a84a'], ['#5a4a3a', '#3e3226', '#a07a3a']],
    },
    tint: [['multiply', 'rgba(240,210,160,.75)'], ['soft-light', 'rgba(160,100,40,.35)']],
  },
  'winter-cabin': {
    label: 'Winter cabin',
    building: {
      interior: { session: '#e8d2b0', lobby: '#e4ccaa', meeting: '#dccaa8', cafe: '#ecd6b4', ceo: '#d8c09a', post: '#d4c0a0' },
      wainscot: same(KINDS, '#7a4a2a'), slabTop: '#8a5a32', slab: '#5a3a22', slabLine: '#3a2414', roofSlab: '#dfe6ee', roofSlabTop: '#f4f6fa',
      wall: '#6a4228', wallEdge: '#4a2c18', footing: '#5a5a5e', footingLine: '#3a3a3e', doorFrame: '#4a2c18', glass: '#ffd8a0', skirting: '#4a2c18',
      shaft: '#5a3a22', shaftHi: '#8a5a32', machine: '#6a4228', machineHi: '#f4f6fa', machineLo: '#4a2c18', deck: '#e8eef4', deckLine: '#c8d2de',
      lamp: '255,170,80', roomGlow: 'rgba(110,60,20,.6)',
    },
    city: {
      skyFar: '#b8c4d4', skyNear: '#a4b0c2', skyWin: '255,190,110', soil: '#4a3a2e', pebble: '#5a4a3a', walk: '#eef2f6', walkLine: '#d8e0ea',
      road: '#9aa2ae', lane: '#c8d0da', curb: '#e8eef4', curbLine: '#c8d2de', post: '#2a2a30', bulb: '#ffd890', lampGlow: '255,190,110',
      trunk: '#4a3020', leaf: '#2a5a3a', leafHi: '#f4f8fc', winLit: 'rgba(255,180,90,.95)',
      dayTop: [140, 165, 195], dayHz: [215, 225, 235], nightTop: [8, 12, 30], nightHz: [40, 52, 80],
      styles: [['#9a3a2a', '#7a2a1e', '#eef2f6'], ['#6a4a30', '#4a3220', '#eef2f6'], ['#5a6a5a', '#3e4a3e', '#eef2f6'], ['#8a6a4a', '#6a4e34', '#eef2f6']],
    },
    tint: [['soft-light', 'rgba(200,220,255,.25)']], own: 'snow',
  },
  candy: {
    label: 'Candy',
    building: {
      interior: { session: '#ffe0ec', lobby: '#e0fff0', meeting: '#e6e0ff', cafe: '#fff0d8', ceo: '#ffd8e8', post: '#d8f4ff' },
      wainscot: { session: '#ffb0d0', lobby: '#a8ecd0', meeting: '#c8b8ff', cafe: '#ffd0a0', ceo: '#ff9ac4', post: '#a8e0f8' },
      slabTop: '#ff7ab0', slab: '#b8f0d8', slabLine: '#ff9ac4', roofSlab: '#ffc8e0', roofSlabTop: '#fff4fa',
      wall: '#ffb8d4', wallEdge: '#e88ab4', footing: '#c8a0e0', footingLine: '#a880c0', doorFrame: '#e88ab4', glass: '#b8f0ff', skirting: '#ff7ab0',
      shaft: '#c8f0e0', shaftHi: '#f0fff8', machine: '#ffb8d4', machineHi: '#fff4fa', machineLo: '#e88ab4', deck: '#fff0d8', deckLine: '#ff9ac4',
      lamp: '255,200,230', roomGlow: 'rgba(120,60,90,.4)',
    },
    city: {
      skyFar: '#f0c8e0', skyNear: '#e0b0d0', skyWin: '255,220,240', soil: '#8a5a4a', pebble: '#a87060', walk: '#ffe8f0', walkLine: '#ffc0d8',
      road: '#a87a6a', lane: '#fff4fa', curb: '#b8f0d8', curbLine: '#7ad8b0', post: '#fff4fa', bulb: '#ff7ab0', lampGlow: '255,150,200',
      trunk: '#f4e8d8', leaf: '#ffb8d8', leafHi: '#b8f0ff', winLit: 'rgba(255,200,230,.9)',
      dayTop: [170, 210, 250], dayHz: [255, 220, 236], nightTop: [40, 20, 60], nightHz: [120, 70, 120],
      styles: [['#ffb8d4', '#e88ab4', '#fff4fa'], ['#b8f0d8', '#7ad8b0', '#fff4fa'], ['#c8b8ff', '#a090e0', '#fff4fa'], ['#ffe0a0', '#e8c078', '#fff4fa']],
    },
    tint: [['soft-light', 'rgba(255,170,210,.3)']],
  },
}
const HOLI = new Map(HOLIDAYS.map(h => [h.key, h]))
const CYCLE = [...Object.keys(SKINS), 'halloween', 'christmas', 'newyear', 'valentine', 'lunar', 'hanami', 'goldenweek', 'tanabata', 'obon', 'tsukimi', 'cyberpunk+halloween', 'synthwave+halloween', 'steampunk+christmas']

export default function init(api, tower) {
  const { Z, font } = tower
  const params = api.params
  const DEMO = params.getAll('demo').includes('themes'), urlTheme = params.get('theme'), T0 = Date.now()
  let cur = null, skin = SKINS.classic, theme = parseTheme('auto'), customs = [], preview = null
  const deco = () => skin.base || theme.skin                // a custom theme draws its base skin's decor

  function resolve(t) {
    if (preview) return [customSkin(preview), 'preview:' + JSON.stringify(preview)]
    if (!t.skin.startsWith('custom:')) return [SKINS[t.skin], t.skin]
    const d = customs.find(x => 'custom:' + slugOf(x.name) === t.skin)
    return d ? [customSkin(d), t.skin + JSON.stringify(d)] : [SKINS.classic, 'classic']
  }
  function apply(name) {
    const t = parseTheme(name), [sk, id] = resolve(t), key = id + '|' + t.holiday
    if (cur === key) return
    const rebuild = cur !== null && sk !== skin
    cur = key; theme = t; skin = sk
    setPalette(skin.building); tower.city.setTheme(skin.city ? { id, ...skin.city, sky: skin.sky !== false, own: skin.own || null } : null)
    pinHoliday(t.holiday)
    if (rebuild && tower.floor('lobby')) tower.setOpen('lobby', null)   // a no-op squeeze that rebuilds the cached layers
  }
  const wanted = () => DEMO ? CYCLE[Math.floor((Date.now() - T0) / 8000) % CYCLE.length] : urlTheme || tower.snapshot?.theme || 'auto'
  const d = api.daylight                                     // no sky, no weather: the roof stays open and the light undimmed
  if (d && !d.themed) {
    const kind = d.weatherKind, gloom = d.gloom
    Object.assign(d, { themed: true, weatherKind: () => skin.sky === false ? 'clear' : kind(), gloom: () => skin.sky === false ? 0 : gloom() })
  }
  if (DEMO || urlTheme) apply(wanted())
  tower.on('snapshot', data => { customs = data.customThemes || []; apply(DEMO || urlTheme ? wanted() : data.theme || 'auto') })
  if (DEMO) tower.on('step', () => apply(wanted()))
  api.theme = {
    get name() { return theme.name }, get skin() { return theme.skin }, get holiday() { return theme.holiday }, set: apply,
    list: () => [...Object.keys(SKINS), ...customs.map(d => 'custom:' + slugOf(d.name)), ...HOLI.keys()],
    preview(def) { preview = def || null; apply(wanted()) },           // the Look tab's editor, live on the tower until saved or cancelled
  }
  floorDecor(api, tower)

  const roof = () => tower.floors[tower.floors.length - 1]
  const sessionFloors = () => tower.floors.filter(f => f.kind === 'session' || f.kind === 'meeting' || f.kind === 'cafe')

  // ---------- skin decor ----------
  const SX = BW + SHAFT + 3                                 // neon blade signs hang off the shaft's outer side
  const NEON = ['255,63,180', '58,224,255', '180,106,255', '58,255,192', '255,200,60']
  const signs = () => sessionFloors().filter((f, i) => i % 2 === 0).map((f, i) => ({ f, x: SX, y: f.top + 8, h: Math.min(44, f.y - f.top - 16), col: NEON[(f.n + i) % NEON.length], seed: f.n * 7 + 3 }))
  function blade(c, s, now) {
    const flick = rnd(s.seed + Math.floor(now / 140)) > 0.985 ? 0.25 : 1, a = flick
    R(c, '#10101a', s.x, s.y, 12, s.h); R(c, '#2a2a3a', s.x - 3, s.y + 3, 3, 2); R(c, '#2a2a3a', s.x - 3, s.y + s.h - 5, 3, 2)
    c.fillStyle = `rgba(${s.col},${a})`
    c.fillRect(s.x, s.y, 12, 1); c.fillRect(s.x, s.y + s.h - 1, 12, 1); c.fillRect(s.x, s.y, 1, s.h); c.fillRect(s.x + 11, s.y, 1, s.h)
    for (let gy = s.y + 4, k = 0; gy + 6 < s.y + s.h - 2; gy += 8, k++)   // invented glyphs, a 3x5 pixel stamp each
      for (let px = 0; px < 3; px++) for (let py = 0; py < 5; py++) if (rnd(s.seed * 31 + k * 17 + px * 5 + py) > 0.45 || px === 1 && py % 2 === 0) c.fillRect(s.x + 3 + px * 2, gy + py, 2, 1)
    c.globalCompositeOperation = 'lighter'; pool(c, s.x + 6, s.y + s.h / 2, s.h * 0.8, s.col, 0.22 * a); c.globalCompositeOperation = 'source-over'
  }
  function cyberpunk(c, now, v) {
    const rf = roof()
    c.globalCompositeOperation = 'lighter'
    // tubes: up the street-side wall and along the roof slab
    c.fillStyle = 'rgba(58,224,255,.9)'; c.fillRect(-1, rf.y, 1, -rf.y)
    c.fillStyle = 'rgba(255,63,180,.9)'; c.fillRect(0, rf.y + SLAB - 1, BW, 1)
    c.fillStyle = 'rgba(58,224,255,.12)'; c.fillRect(-4, rf.y, 7, -rf.y)
    c.fillStyle = 'rgba(255,63,180,.12)'; c.fillRect(0, rf.y + SLAB - 4, BW, 7)
    // the wet road throws the signs back
    for (const s of signs()) { const g = c.createLinearGradient(0, 4, 0, 16); g.addColorStop(0, `rgba(${s.col},.22)`); g.addColorStop(1, `rgba(${s.col},0)`); c.fillStyle = g; c.fillRect(s.x - 2 + (s.f.n % 3) * 6, 4, 8, 12) }
    c.globalCompositeOperation = 'source-over'
    for (const s of signs()) blade(c, s, now)
    // rain, always
    const W = v.x1 - v.x0, H = v.y1 - v.y0, n = Math.round(W * H / 5000), t = now / 1000
    c.fillStyle = 'rgba(150,200,255,.35)'
    for (let i = 0; i < n; i++) {
      const sp = 300 + rnd(i) * 120, y = v.y0 + ((rnd(i + 9) * H + t * sp) % H)
      let x = v.x0 + ((rnd(i + 3) * W - t * sp * 0.2) % W); if (x < v.x0) x += W
      c.fillRect(Math.round(x), Math.round(y), 1, 6)
    }
  }
  const ivyAt = f => [f.top + 14, f.y - 8]                    // between one plaque and the next
  function cottage(c, now) {
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.kind === 'server' || f.kind === 'post' || f.kind === 'lobby') continue
      const [y0, y1] = ivyAt(f)
      for (let y = y0; y < y1; y += 2) {
        const sw = Math.round(Math.sin(y / 9 + f.n) * 1.5)
        R(c, '#3a6a2a', sw, y, 2, 2)
        if (rnd(y * 3 + f.n) > 0.55) R(c, rnd(y + f.n) > 0.5 ? '#5a9a3a' : '#4a8a32', sw + (rnd(y + 1) > 0.5 ? 2 : -2), y, 2, 2)
        if (rnd(y * 7 + f.n) > 0.93) R(c, '#f0a0c0', sw + 2, y, 1, 1)
      }
      // a lantern sconce on the outer wall
      const ly = f.y - 40
      R(c, '#3a2a1a', -4, ly, 4, 1); R(c, '#3a2a1a', -6, ly - 1, 4, 1); R(c, '#2a1a0e', -7, ly, 4, 6); R(c, '#ffd88a', -6, ly + 1, 2, 4)
    }
    const lob = tower.floor('lobby')
    if (lob) for (const x of [WALL + 470, WALL + 4]) { R(c, '#8a5a3a', x - 3, lob.y - 6, 8, 6); R(c, '#a06a42', x - 3, lob.y - 6, 8, 1); for (let i = 0; i < 9; i++) R(c, ['#4a8a3a', '#6aa84a', '#e86a8a', '#f0c84a'][i % 4], x - 3 + (i % 4) * 2, lob.y - 9 - Math.floor(i / 4) * 2, 2, 2) }
  }
  function brutalist(c) {
    const rf = roof()
    for (let y = rf.y + 10; y < 0; y += 14) { R(c, 'rgba(40,40,40,.35)', 2, y, 1, 1); R(c, 'rgba(40,40,40,.35)', 5, y, 1, 1); R(c, 'rgba(40,40,40,.35)', BW - 6, y, 1, 1); R(c, 'rgba(40,40,40,.35)', BW - 3, y, 1, 1) }
    for (let y = rf.y + 3; y < 0; y += 7) R(c, 'rgba(255,255,255,.07)', 0, y, WALL, 1)
    for (const f of tower.floors) if (f.kind !== 'roof' && f.y < 0) R(c, 'rgba(0,0,0,.28)', -4, f.y + SLAB, 4, 3)   // the slabs cantilever past the wall
    for (const f of tower.floors) if (f.kind !== 'roof' && f.y < 0) R(c, '#7a7874', -4, f.y, 4, SLAB)
  }

  function rainfall(c, now, v, col, per, len) {
    const W = v.x1 - v.x0, H = v.y1 - v.y0, n = Math.min(900, Math.round(W * H / per)), t = now / 1000
    c.fillStyle = col
    for (let i = 0; i < n; i++) {
      const sp = 300 + rnd(i) * 120, y = v.y0 + ((rnd(i + 9) * H + t * sp) % H)
      let x = v.x0 + ((rnd(i + 3) * W - t * sp * 0.2) % W); if (x < v.x0) x += W
      c.fillRect(Math.round(x), Math.round(y), 1, len)
    }
  }
  function snowfall(c, now, v) {
    const W = v.x1 - v.x0, H = v.y1 - v.y0, n = Math.min(700, Math.round(W * H / 6000)), t = now / 1000
    c.fillStyle = 'rgba(255,255,255,.85)'
    for (let i = 0; i < n; i++) {
      const y = v.y0 + ((rnd(i + 9) * H + t * (18 + rnd(i) * 22)) % H)
      let x = v.x0 + ((rnd(i + 3) * W + Math.sin(t * 0.8 + i) * 6) % W); if (x < v.x0) x += W
      c.fillRect(Math.round(x), Math.round(y), i % 3 ? 2 : 1, i % 3 ? 2 : 1)
    }
  }
  const lampsIn = v => { const out = []; for (let k = Math.floor(v.x0 / 160) - 1; k * 160 < v.x1 + 160; k++) { const lx = k * 160 + 40; if (lx < STREET_L - 24 || lx > BW + SHAFT + 24) out.push(lx) } return out }   // city.js's street lamps

  // synthwave: a slatted sun behind the skyline, a scrolling grid floor under the street, neon round the silhouettes
  function synthSun(c, v) {
    const x = Math.round((v.x0 + v.x1) / 2 * 0.8 + 560), r = 84, y0 = -150
    pool(c, x, y0, r * 1.6, '255,80,170', 0.35)
    for (let dy = -r; dy < r && y0 + dy < 0; dy++) {
      const lo = dy / r
      if (lo > 0 && dy % 12 < 2 + lo * 7) continue
      const hw = Math.sqrt(r * r - dy * dy), t = (dy + r) / (2 * r)
      c.fillStyle = `rgb(255,${Math.round(225 - t * 160)},${Math.round(80 + t * 100)})`
      c.fillRect(Math.round(x - hw), y0 + dy, Math.round(hw * 2), 1)
    }
  }
  function synthGrid(c, v, now) {
    const top = GROUND, bot = v.y1; if (bot <= top) return
    const vx = (v.x0 + v.x1) / 2, vy = top - 40, s = (bot - vy) / (top - vy), ph = (now / 1800) % 1
    c.beginPath(); c.rect(v.x0, top, v.x1 - v.x0, bot - top); c.clip()
    c.strokeStyle = 'rgba(255,70,200,.6)'; c.lineWidth = 1; c.beginPath()
    for (let k = 0; ; k++) { const y = top + Math.round((k + ph) ** 2 * 2.4) + 0.5; if (y > bot) break; c.moveTo(v.x0, y); c.lineTo(v.x1, y) }
    for (let j = Math.floor((v.x0 - vx) / 18); j <= Math.ceil((v.x1 - vx) / 18); j++) { const xt = vx + j * 18; c.moveTo(xt, top); c.lineTo(vx + (xt - vx) * s, bot) }
    c.stroke()
  }
  function synthwave(c, now, v) {
    const rf = roof(), mt = rf.y - 34
    c.globalCompositeOperation = 'lighter'
    const edge = (rgb, x, y, w, h) => { c.fillStyle = `rgba(${rgb},.12)`; c.fillRect(x - 3, y - 3, w + 6, h + 6); c.fillStyle = `rgba(${rgb},.9)`; c.fillRect(x, y, w, h) }
    edge('80,220,255', -1, rf.y, 1, -rf.y); edge('80,220,255', BW + SHAFT + 2, mt, 1, -mt)
    edge('255,90,220', -1, rf.y - 1, BW - 5, 1); edge('255,90,220', BW - 7, mt - 1, SHAFT + 10, 1); edge('255,90,220', BW - 7, mt, 1, 34)
    c.fillStyle = 'rgba(255,90,220,.5)'; c.fillRect(v.x0, 0, v.x1 - v.x0, 1)
    for (const b of tower.street.buildings) if (b.x0 < v.x1 && b.x0 + b.w > v.x0) { c.fillStyle = 'rgba(80,220,255,.75)'; c.fillRect(b.x0 - 2, -b.h - 4, b.w + 4, 1); c.fillRect(b.x0 - 2, -b.h - 4, 1, b.h + 4); c.fillRect(b.x0 + b.w + 1, -b.h - 4, 1, b.h + 4) }
  }

  // noir: everything grey but one red sign, light through venetian blinds, a soft rain
  function noir(c, now, v) {
    c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,248,230,.075)'
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.kind === 'server' || f.y - f.top < 30) continue
      c.save(); c.beginPath(); c.rect(IX, f.top, FW, f.y - f.top); c.clip(); c.beginPath()
      const x0 = IX + 30 + (f.n * 67) % 200
      for (let k = 0; k < 7; k++) { const y = f.top + 2 + k * 9; c.moveTo(x0, y); c.lineTo(x0 + 160, y + 46); c.lineTo(x0 + 160, y + 50); c.lineTo(x0, y + 4) }
      c.fill(); c.restore()
    }
    c.globalCompositeOperation = 'source-over'
    const f = tower.floors[Math.floor(tower.floors.length * 0.55)], sx = -20, sy = f.top + 4, on = rnd(Math.floor(now / 110)) > 0.05
    R(c, '#0e0e10', sx, sy, 12, 68); R(c, '#2a2a2c', sx + 12, sy + 6, 8, 2); R(c, '#2a2a2c', sx + 12, sy + 60, 8, 2)
    c.fillStyle = on ? '#ff2a3a' : '#4a1216'; pixText(c, 'HOTEL', sx + 3, sy + 4, 2, true)
    if (on) {
      c.globalCompositeOperation = 'lighter'; pool(c, sx + 6, sy + 34, 56, '255,40,60', 0.32)
      const g = c.createLinearGradient(0, 4, 0, 18); g.addColorStop(0, 'rgba(255,40,60,.35)'); g.addColorStop(1, 'rgba(255,40,60,0)'); c.fillStyle = g; c.fillRect(sx - 2, 4, 16, 14)
      c.globalCompositeOperation = 'source-over'
    }
    rainfall(c, now, v, 'rgba(210,210,220,.2)', 7000, 7)
  }

  // underwater: rippling caustics, rising bubbles, fish over the street and kelp along it
  let caustic = null
  function causticTile() {
    const n = 96, cv = document.createElement('canvas'); cv.width = cv.height = n
    const c = cv.getContext('2d'), im = c.createImageData(n, n), T = Math.PI * 2 / n
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const a = Math.sin(2 * T * x + 1.6 * Math.sin(3 * T * y)) + Math.sin(3 * T * y + 1.4 * Math.sin(2 * T * x + 1)), i = (y * n + x) * 4
      im.data[i] = 210; im.data[i + 1] = 255; im.data[i + 2] = 255; im.data[i + 3] = Math.max(0, 1 - Math.abs(a) * 2.2) ** 2 * 255
    }
    c.putImageData(im, 0, 0); return cv
  }
  function underwater(c, now, v) {
    const t = now / 1000, W = v.x1 - v.x0, H = v.y1 - v.y0
    caustic ||= c.createPattern(causticTile(), 'repeat')
    c.save(); c.beginPath(); c.rect(v.x0, v.y0, W, Math.max(0, GROUND - v.y0)); c.clip()
    c.globalCompositeOperation = 'lighter'; c.fillStyle = caustic
    for (const [dx, dy, k, a] of [[9, 5, 1, 0.08], [-7, 6, 1.37, 0.06]]) { caustic.setTransform(new DOMMatrix([k, 0, 0, k, t * dx, t * dy])); c.globalAlpha = a; c.fillRect(v.x0, v.y0, W, H) }
    c.restore()
    const n = Math.min(160, Math.round(W * H / 25000))
    for (let i = 0; i < n; i++) {
      const y = v.y1 - ((rnd(i + 7) * H + t * (16 + rnd(i) * 30)) % H), x = v.x0 + rnd(i + 3) * W + Math.sin(t * 2 + i) * 2, s = rnd(i + 11) > 0.7 ? 3 : 2
      R(c, 'rgba(200,245,255,.4)', x, y, s, s); R(c, 'rgba(255,255,255,.7)', x, y, 1, 1)
    }
  }
  const FISH = [['#ff9a3a', '#e86a1a'], ['#ffd84a', '#e8a81a'], ['#5ad0ff', '#2a90d0'], ['#ff6a8a', '#d03a5a']]
  function fish(c, now) {
    const e = tower.street.extent, x0 = e.x0 - 80, L = e.x1 - e.x0 + 160, t = now / 1000
    for (let i = 0; i < 9; i++) {
      const p = (t * (12 + rnd(i + 40) * 16) + rnd(i + 41) * 2 * L) % (2 * L), dir = p < L ? 1 : -1
      const x = Math.round(x0 + (p < L ? p : 2 * L - p)), y = Math.round(-90 - rnd(i + 42) * 420 + Math.sin(t * 1.3 + i) * 4), [body, fin] = FISH[i % FISH.length]
      R(c, body, x, y, 7, 3); R(c, body, x + 1, y - 1, 5, 5); R(c, fin, x + 1, y + 2, 5, 1)
      R(c, fin, dir > 0 ? x - 2 : x + 7, y - 1, 2, 5); R(c, '#101820', dir > 0 ? x + 5 : x + 1, y, 1, 1)
    }
  }
  function kelp(c, now, v) {
    const t = now / 1000
    for (let k = Math.floor(v.x0 / 64) - 1; k * 64 < v.x1 + 64; k++) {
      const x = k * 64 + Math.floor(rnd(k) * 28); if (x > -110 && x < BW + SHAFT + 40) continue
      const n = 10 + Math.floor(rnd(k + 5) * 16)
      for (let j = 0; j < n; j++) {
        const sx = Math.round(x + Math.sin(t * 1.2 + k + j * 0.22) * j * 0.25)
        R(c, j % 2 ? '#2f8a4e' : '#3fa05a', sx, 2 - j * 2, 2, 2)
        if (j % 4 === 2) R(c, '#5ab86a', sx + (j % 8 === 2 ? 2 : -2), 2 - j * 2, 2, 1)
      }
    }
  }

  // space station: stars and a ringed planet for a sky, panelled hull, blinking hull lights, a docking deck for a street
  const PLANET = ['#d88a5a', '#c07048', '#e8a878']
  function space(c, v, now) {
    const W = v.x1 - v.x0, top = v.y0, H = -top; if (H <= 0) return
    R(c, '#04050a', v.x0 - 2, top - 2, W + 4, H + 2)
    const n = Math.min(700, Math.round(W * H / 1800)), sh = (v.x0 + v.x1) / 2 * 0.05
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 7 === 0 && (Math.floor(now / 500) + i) % 5 === 0 ? '#6a7090' : i % 3 ? '#c8ccdc' : '#ffffff'
      c.fillRect(Math.round(v.x0 + (((rnd(i) * W - sh) % W) + W) % W), Math.round(top + rnd(i + 0.5) * H), 1, 1)
    }
    const px = Math.round((v.x0 + v.x1) / 2 * 0.85 - 260), py = Math.round(top + H * 0.3), r = 56
    c.strokeStyle = 'rgba(230,210,180,.55)'; c.lineWidth = 2
    c.beginPath(); c.ellipse(px, py, r * 1.8, r * 0.38, -0.3, Math.PI, Math.PI * 2); c.stroke()
    for (let dy = -r; dy < r; dy++) {
      const hw = Math.sqrt(r * r - dy * dy), sd = Math.sqrt(Math.max(0, r * r - (dy + r * 0.2) ** 2)), edge = Math.max(px - hw, px - r * 0.35 + sd)
      c.fillStyle = PLANET[Math.floor((dy + r + Math.sin(dy / 5) * 2) / 8) % 3]; c.fillRect(Math.round(px - hw), py + dy, Math.round(hw * 2), 1)
      c.fillStyle = 'rgba(4,5,10,.6)'; c.fillRect(Math.round(edge), py + dy, Math.max(0, Math.round(px + hw - edge)), 1)
    }
    c.beginPath(); c.ellipse(px, py, r * 1.8, r * 0.38, -0.3, 0, Math.PI); c.stroke()
  }
  function hull(c) {
    const rf = roof()
    for (let y = rf.y + 12; y < 0; y += 16) {
      R(c, 'rgba(0,0,0,.35)', 0, y, WALL, 1); R(c, 'rgba(0,0,0,.35)', BW - WALL, y, WALL, 1)
      R(c, 'rgba(255,255,255,.35)', 2, y + 3); R(c, 'rgba(255,255,255,.35)', 5, y + 3); R(c, 'rgba(255,255,255,.35)', BW - 6, y + 3); R(c, 'rgba(255,255,255,.35)', BW - 3, y + 3)
    }
  }
  function dock(c, v) {
    R(c, '#1a1a1e', v.x0 - 2, 14, v.x1 - v.x0 + 4, 3)
    for (let x = Math.floor(v.x0 / 8) * 8; x < v.x1; x += 8) for (let r = 0; r < 3; r++) R(c, '#f0c020', x + r, 14 + r, 4, 1)
    for (let x = Math.floor(v.x0 / 24) * 24; x < v.x1; x += 24) { R(c, '#6a707c', x + 3, 1, 1, 1); R(c, '#6a707c', x + 20, 1, 1, 1) }
  }
  function hullLights(c, now) {
    const rf = roof(), on = i => (Math.floor(now / 450) + i) % 6 === 0
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.y > 0) continue
      R(c, on(f.n) ? '#ff4a3a' : '#5a1a1a', -2, f.y - 30, 2, 2); R(c, on(f.n + 3) ? '#4aff8a' : '#1a4a2a', BW + SHAFT, f.y - 30, 2, 2)
    }
    if (now % 1200 < 110) { R(c, '#ffffff', -2, rf.y - 3, 2, 2); R(c, '#ffffff', BW + SHAFT, rf.y - 37, 2, 2); c.globalCompositeOperation = 'lighter'; pool(c, -1, rf.y - 2, 14, '255,255,255', 0.6); pool(c, BW + SHAFT + 1, rf.y - 36, 14, '255,255,255', 0.6) }
  }

  // game boy: the whole world quantised to four greens through an SVG filter (a plain green wash where canvas filters are missing)
  let gbBuf = null
  function gameboy(c) {
    const cv = c.canvas
    if (!('filter' in c)) { c.globalCompositeOperation = 'saturation'; R(c, 'rgb(128,128,128)', -1e5, -1e5, 2e5, 2e5); c.globalCompositeOperation = 'multiply'; R(c, '#9bbc0f', -1e5, -1e5, 2e5, 2e5); return }
    if (!document.getElementById('aoGameboy')) {
      const l = '.35 .69 .13 0 -.06', t = v => v.map(x => (x / 255).toFixed(3)).join(' ')
      document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="aoGameboy" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="${l} ${l} ${l} 0 0 0 1 0"/><feComponentTransfer><feFuncR type="discrete" tableValues="${t([15, 48, 139, 155])}"/>
        <feFuncG type="discrete" tableValues="${t([56, 98, 172, 188])}"/><feFuncB type="discrete" tableValues="${t([15, 48, 15, 15])}"/></feComponentTransfer></filter></svg>`)
    }
    gbBuf ||= document.createElement('canvas')
    if (gbBuf.width !== cv.width || gbBuf.height !== cv.height) { gbBuf.width = cv.width; gbBuf.height = cv.height }
    const b = gbBuf.getContext('2d'); b.clearRect(0, 0, cv.width, cv.height); b.drawImage(cv, 0, 0)
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'copy'; c.filter = 'url(#aoGameboy)'; c.drawImage(gbBuf, 0, 0)
  }

  // blueprint: grid paper for a sky, white line art over the blue, dimension marks beside the tower
  function gridPaper(c, v) {
    const H = -v.y0; if (H <= 0) return
    for (const [step, a] of [[10, 0.07], [50, 0.13]]) {
      c.fillStyle = `rgba(220,235,255,${a})`
      for (let x = Math.floor(v.x0 / step) * step; x < v.x1; x += step) c.fillRect(x, v.y0, 1, H)
      for (let y = Math.floor(v.y0 / step) * step; y < 0; y += step) c.fillRect(v.x0, y, v.x1 - v.x0, 1)
    }
  }
  function blueprint(c, now, v) {
    const rf = roof(), ink = 'rgba(232,242,255,.9)', W = v.x1 - v.x0
    c.strokeStyle = ink; c.lineWidth = 1; c.beginPath()
    const box = (x, y, w, h) => c.rect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1)
    box(0, rf.y, BW, GROUND - rf.y); box(BW - 6, rf.y - 34, SHAFT + 8, 34); box(BW, rf.y, SHAFT, GROUND - rf.y)
    for (const f of tower.floors) if (f.kind !== 'roof' && f.y > f.top) box(IX, f.top, FW, f.y - f.top)
    for (const b of tower.street.buildings) if (b.x0 < v.x1 && b.x0 + b.w > v.x0) box(b.x0 - 2, -b.h - 3, b.w + 4, b.h + 3)
    c.stroke()
    c.fillStyle = 'rgba(232,242,255,.45)'; for (const y of [0, 4, 14, GROUND]) c.fillRect(v.x0, y, W, 1)
    c.fillStyle = ink
    const dx = BW + SHAFT + 14, ys = [...new Set([rf.y, ...tower.floors.filter(f => f.kind !== 'roof' && f.y <= 0).map(f => f.y)])].sort((a, b) => a - b)
    c.fillRect(dx, ys[0], 1, ys.at(-1) - ys[0])
    ys.forEach((y, i) => { c.fillRect(dx - 3, y, 7, 1); if (i) pixText(c, String(Math.round(y - ys[i - 1])), dx + 4, Math.round((y + ys[i - 1]) / 2) - 2, 1) })
    const g = garageRect(tower.floors), by = g.y + g.h + 14
    c.fillRect(0, by, BW, 1); c.fillRect(0, by - 3, 1, 7); c.fillRect(BW - 1, by - 3, 1, 7); c.fillRect(1, by - 1, 2, 3); c.fillRect(BW - 3, by - 1, 2, 3)
    R(c, 'rgba(30,74,134,1)', BW / 2 - 9, by - 3, 18, 7); c.fillStyle = ink; pixText(c, String(BW), BW / 2 - 6, by - 2, 1)
  }

  // steampunk: meshing gears up the facade, a copper steam pipe beside the shaft
  function gear(c, x, y, r, a, col) {
    c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill()
    for (let i = 0, n = r + 3; i < n; i++) { const t = a + i / n * Math.PI * 2; c.fillRect(Math.round(x + Math.cos(t) * (r + 1)) - 1, Math.round(y + Math.sin(t) * (r + 1)) - 1, 2, 2) }
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill()
    R(c, '#3a2614', x - 1, y - 1, 2, 2)
  }
  function steampunk(c, now) {
    const rf = roof(), t = now / 1000, px = BW + SHAFT + 1, top = rf.y - 34
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.y > 0 || f.y - f.top < 40) continue
      const y = f.top + 22, a = t * 0.8 + f.n
      gear(c, 2, y, 7, a, '#b8862e'); gear(c, -3, y + 12, 4, -a * 10 / 7, '#d0a050')
    }
    R(c, '#8a4a2a', px, top, 4, -top); R(c, '#c07a48', px + 1, top, 1, -top)
    for (let y = top + 10; y < 0; y += 36) R(c, '#c8963a', px - 1, y, 6, 2)
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.y > 0 || f.n % 2) continue
      const vy = f.y - 24
      R(c, '#8a4a2a', px + 4, vy, 4, 3); R(c, '#c8963a', px + 7, vy - 1, 1, 5)
      for (let i = 0; i < 4; i++) {
        const p = (t / 2.4 + i / 4 + f.n * 0.37) % 1
        c.fillStyle = `rgba(240,236,228,${0.5 * (1 - p)})`; c.beginPath(); c.arc(px + 10 + p * 12, vy + 1 - p * 22, 1.5 + p * 5, 0, Math.PI * 2); c.fill()
      }
    }
  }

  // winter cabin: snow on every roof and ledge, icicles under them (composes with the holidays' own decor)
  function snowOn(c, x0, w, y, seed) {
    R(c, '#f4f8fc', x0, y - 2, w, 2)
    for (let x = x0; x < x0 + w - 3; x += 5) { const h = Math.floor(rnd(x * 0.37 + seed) * 3); if (h) R(c, '#f4f8fc', x + 1, y - 2 - h, 4, h) }
  }
  function icicles(c, x0, w, y, seed) {
    for (let x = Math.ceil(x0); x < x0 + w; x += 3) { const k = rnd(x * 1.7 + seed); if (k > 0.4) { const n = 1 + Math.floor(k * 6); R(c, '#e8f4ff', x, y, 1, n); R(c, '#a8d0ec', x, y + n - 1, 1, 1) } }
  }
  function cabin(c, v) {
    const rf = roof()
    snowOn(c, -4, BW + 4, rf.y, 1); snowOn(c, BW - 8, SHAFT + 12, rf.y - 34, 2)
    for (const f of tower.floors) if (f.kind !== 'roof' && f.y < 0) { R(c, '#f4f8fc', -3, f.y, WALL + 3, 2); icicles(c, -3, WALL + 3, f.y + 2, f.n) }
    for (const b of tower.street.buildings) if (b.x0 < v.x1 && b.x0 + b.w > v.x0) { snowOn(c, b.x0 - 2, b.w + 4, -b.h - 3, b.seed % 97); icicles(c, b.x0 - 2, b.w + 4, -b.h + 1, b.seed % 89) }
    if (tower.floor('lobby')) { snowOn(c, -30, 34, -50, 3); icicles(c, -30, 34, -46, 5) }
  }

  // candy: sprinkles on the slabs, lollipop street lamps
  const SPRINKLE = ['#ff5a8a', '#5ad8ff', '#ffe05a', '#7aea9a', '#c08aff', '#ffffff']
  function sprinkles(c) {
    for (const f of tower.floors) {
      if (f.y > GROUND) continue
      for (let x = PLAQUE.w + 6; x < BW - 4; x += 7) {
        const r = rnd(x * 0.13 + f.n * 7.7)
        R(c, SPRINKLE[Math.floor(r * 6)], x + Math.floor(r * 4), f.y + 1 + Math.floor(rnd(x + f.n) * 3), r > 0.5 ? 2 : 1, r > 0.5 ? 1 : 2)
      }
    }
  }
  let lolly = null
  function lollipop() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 13
    const c = cv.getContext('2d')
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const dx = x - 6, dy = y - 6, d = Math.hypot(dx, dy); if (d > 6.4) continue
      c.fillStyle = d > 5.6 ? '#e8508a' : Math.floor((Math.atan2(dy, dx) / Math.PI + d / 3.2) * 2 + 10) % 2 ? '#ff5a9a' : '#fff4fa'; c.fillRect(x, y, 1, 1)
    }
    return cv
  }
  function lamps(c, v) {
    lolly ||= lollipop()
    for (const lx of lampsIn(v)) { R(c, '#fff4fa', lx, -48, 2, 48); for (let y = -46; y < 0; y += 6) R(c, '#ff7ab0', lx, y, 2, 2); c.drawImage(lolly, lx - 5, -60) }
  }

  tower.city.behind.push((c, v, now) => {
    if (!tower.floors.length) return
    const d = deco()
    if (d === 'synthwave') synthSun(c, v)
    else if (d === 'space-station') space(c, v, now)
    else if (d === 'blueprint') gridPaper(c, v)
  })
  tower.on('items', (out, now, ctx) => {
    if (!tower.floors.length) return
    const d = deco(), v = ctx.view
    if (d === 'cottage') out.push({ z: Z.OUTSIDE + 1, draw: c => cottage(c, performance.now()) })
    if (d === 'brutalist') out.push({ z: Z.OUTSIDE + 1, draw: brutalist })
    if (d === 'synthwave') out.push({ z: Z.BEHIND, draw: c => synthGrid(c, v, now) })
    if (d === 'underwater') out.push({ z: Z.BEHIND + 1, draw: c => fish(c, now) }, { z: Z.OUTSIDE + 1, draw: c => kelp(c, now, v) })
    if (d === 'space-station') out.push({ z: Z.BEHIND, draw: c => dock(c, v) }, { z: Z.OUTSIDE + 1, draw: hull })
    if (d === 'steampunk') out.push({ z: Z.OUTSIDE + 1, draw: c => steampunk(c, now) })
    if (d === 'winter-cabin') out.push({ z: Z.OUTSIDE + 1, draw: c => cabin(c, v) })
    if (d === 'candy') out.push({ z: Z.BEHIND, draw: c => lamps(c, v) }, { z: Z.OUTSIDE + 1, draw: sprinkles })
  })
  tower.on('glow', (c, now, n) => {
    if (deco() !== 'cottage' || n < 0.05 || !tower.floors.length) return
    c.globalAlpha = Math.min(1, n * 1.2)
    for (const f of tower.floors) if (!['roof', 'server', 'post', 'lobby'].includes(f.kind)) pool(c, -5, f.y - 37, 14, '255,200,120', 0.6)
    c.globalAlpha = 1
  })
  const POST = { cyberpunk, synthwave, noir, underwater, 'space-station': hullLights, blueprint, 'winter-cabin': snowfall, gameboy }
  tower.on('post', (c, now, ctx) => {
    if (!tower.floors.length) return
    const v = ctx.view
    for (const [op, col] of skin.tint || []) { c.globalCompositeOperation = op; c.fillStyle = col; c.fillRect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4) }
    c.globalCompositeOperation = 'source-over'
    if (skin.quantise) return gameboy(c)
    POST[deco()]?.(c, now, v)
  })

  if (DEMO) tower.on('overlay', c => {
    const h = theme.holiday && theme.holiday !== 'none' ? HOLI.get(theme.holiday) : null
    const txt = `🎨 ${skin.label}${h ? ' · ' + h.icon + ' ' + h.name : ''}`
    c.save(); c.font = font(14, 700); c.textBaseline = 'top'
    const w = c.measureText(txt).width + 20
    c.fillStyle = 'rgba(20,20,28,.8)'; c.beginPath(); c.roundRect(16, 86, w, 24, 6); c.fill()
    c.fillStyle = '#fbfaf4'; c.fillText(txt, 26, 91); c.restore()
  })
}

// ---------- custom themes: nine colours stretched over the whole table ----------
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const arr = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const shade = (h, k) => hex(arr(h).map(v => k < 0 ? v * (1 + k) : v + (255 - v) * k))
const towerOf = sk => ({ ...TOWER, ...sk.building, interior: { ...TOWER.interior, ...sk.building?.interior } })
const streetOf = sk => ({ ...STREET, ...sk.city })
export const skinLabel = name => SKINS[name]?.label || name
export const builtinSkin = name => SKINS[name] || null
// the editor's starting colours, from a skin name or a saved custom theme
export function coloursOf(which) {
  if (typeof which === 'object' && which) return { ...which.colours }
  const b = towerOf(SKINS[which] || SKINS.classic), s = streetOf(SKINS[which] || SKINS.classic)
  const all = { sky: hex(s.dayTop), horizon: hex(s.dayHz), night: hex(s.nightHz), skyline: s.skyNear, facade: b.wall, floor: b.interior.session, slab: b.slab, street: s.road, accent: s.lane }
  return Object.fromEntries(THEME_SLOTS.map(k => [k, all[k]]))
}
export function customSkin(def) {
  const base = SKINS[def.base] || SKINS.classic, k = def.colours, s = streetOf(base)
  const floor = { session: k.floor, lobby: shade(k.floor, 0.05), meeting: shade(k.floor, -0.04), cafe: shade(k.floor, 0.08), ceo: shade(k.floor, -0.08), post: shade(k.floor, -0.05) }
  return {
    label: def.name, base: def.base, quantise: base.quantise, sky: base.sky, own: base.own,
    building: {
      ...base.building, interior: floor, wainscot: same(floor, shade(k.floor, -0.28)),
      wall: k.facade, wallEdge: shade(k.facade, -0.3), footing: shade(k.facade, -0.35), footingLine: shade(k.facade, -0.55), doorFrame: shade(k.facade, -0.4),
      shaft: shade(k.facade, -0.1), shaftHi: shade(k.facade, 0.2), machine: k.facade, machineHi: shade(k.facade, 0.2), machineLo: shade(k.facade, -0.3),
      slab: k.slab, slabTop: shade(k.slab, 0.25), slabLine: shade(k.slab, -0.45), roofSlab: shade(k.slab, 0.1), roofSlabTop: shade(k.slab, 0.3),
      deck: shade(k.slab, 0.15), deckLine: shade(k.slab, -0.2), skirting: k.accent, glass: shade(k.sky, 0.35),
    },
    city: {
      ...base.city, dayTop: arr(k.sky), dayHz: arr(k.horizon), nightTop: arr(shade(k.night, -0.6)), nightHz: arr(k.night),
      skyNear: k.skyline, skyFar: shade(k.skyline, 0.12), road: k.street, walk: shade(k.street, 0.45), walkLine: shade(k.street, 0.3),
      curb: shade(k.street, 0.3), curbLine: shade(k.street, 0.1), soil: shade(k.street, -0.45), pebble: shade(k.street, -0.3),
      lane: k.accent, bulb: shade(k.accent, 0.5), lampGlow: arr(k.accent).join(','), winLit: `rgba(${arr(shade(k.accent, 0.4)).join(',')},.85)`,
      styles: s.styles.map(([b, d]) => [b, d, k.accent]),
    },
  }
}
// a 64x44 postcard of a skin (name or custom theme) for the Look tab: sky, skyline, three floors, the street, the skin's filter
export function thumb(cv, which) {
  const sk = typeof which === 'object' ? customSkin(which) : SKINS[which] || SKINS.classic, b = towerOf(sk), s = streetOf(sk)
  const c = cv.getContext('2d'), W = cv.width, H = cv.height
  c.globalCompositeOperation = 'source-over'
  const g = c.createLinearGradient(0, 0, 0, 31); g.addColorStop(0, hex(s.dayTop)); g.addColorStop(1, hex(s.dayHz)); c.fillStyle = g; c.fillRect(0, 0, W, 31)
  R(c, s.skyFar, 0, 16, 9, 15); R(c, s.skyNear, 6, 21, 9, 10); R(c, s.skyFar, 50, 14, 8, 17); R(c, s.skyNear, 56, 20, 8, 11)
  const [st0, st1] = s.styles
  R(c, st0[0], 2, 23, 13, 8); R(c, st0[2], 1, 22, 15, 1); R(c, '#f6d27a', 5, 25, 2, 2); R(c, '#f6d27a', 10, 25, 2, 2)
  R(c, st1[0], 51, 24, 12, 7); R(c, st1[2], 50, 23, 14, 1); R(c, '#f6d27a', 54, 26, 2, 2)
  R(c, b.wall, 19, 4, 26, 27); R(c, b.roofSlab, 19, 4, 26, 2); R(c, b.roofSlabTop, 19, 4, 26, 1)
  ;['meeting', 'session', 'lobby'].forEach((k, i) => { const y = 6 + i * 8; R(c, b.interior[k], 21, y, 22, 6); R(c, b.wainscot[k], 21, y + 4, 22, 2); R(c, b.slab, 19, y + 6, 26, 2); R(c, b.slabTop, 19, y + 6, 26, 1) })
  R(c, `rgb(${b.lamp})`, 27, 6, 2, 1); R(c, `rgb(${b.lamp})`, 36, 14, 2, 1)
  R(c, b.shaft, 45, 1, 5, 30); R(c, b.shaftHi, 45, 1, 1, 30); R(c, b.machine, 44, 0, 7, 3)
  R(c, s.walk, 0, 31, W, 2); R(c, s.road, 0, 33, W, 5); for (let x = 2; x < W; x += 8) R(c, s.lane, x, 35, 4, 1)
  R(c, s.curb, 0, 38, W, 2); R(c, s.soil, 0, 40, W, H - 40)
  R(c, s.post, 57, 20, 1, 11); R(c, s.bulb, 57, 20, 3, 1)
  for (const [op, col] of sk.tint || []) { c.globalCompositeOperation = op; c.fillStyle = col; c.fillRect(0, 0, W, H) }
  c.globalCompositeOperation = 'source-over'
  if (sk.quantise) {
    const im = c.getImageData(0, 0, W, H), d = im.data, GB = [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]]
    for (let i = 0; i < d.length; i += 4) { const q = GB[Math.max(0, Math.min(3, Math.floor((d[i] * 0.35 + d[i + 1] * 0.69 + d[i + 2] * 0.13 - 15) / 64)))]; d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2] }
    c.putImageData(im, 0, 0)
  }
}
