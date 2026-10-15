import { start } from './core.js'
import day_night from './features/day-night.js'
import notify from './features/notify.js'
import ticker from './features/ticker.js'
import side_panel from './features/side-panel.js'
import soundscape from './features/soundscape.js'
import navigator from './features/navigator.js'
import replay from './features/replay.js'
import gazette from './features/gazette.js'
import photo_booth from './features/photo-booth.js'
import tower from './tower/tower.js'

// Order matters: notify adjusts the snapshot (?demo=attention) before the tower reads it, and the navigator's
// header chips exist before the tower wires them up.
start([
  ['day-night', day_night],
  ['notify', notify],
  ['ticker', ticker],
  ['side-panel', side_panel],
  ['soundscape', soundscape],
  ['navigator', navigator],
  ['replay', replay],
  ['gazette', gazette],
  ['photo-booth', photo_booth],
  ['tower', tower],
])
