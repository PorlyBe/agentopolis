// The tower's plugin registry: every feature module in start order, the hook table they register on, and the Z bands
// their items draw in. The API itself is documented at the top of tower.js. scripts/new-feature.mjs adds an import
// after the last feature import here and an entry at the end of FEATURES.
import ceoOffice from './features/ceo-office.js'
import deskKit from './features/desk-kit.js'
import workSignals from './features/work-signals.js'
import interactions from './features/interactions.js'
import social from './features/social.js'
import ambience from './features/ambience.js'
import mess from './features/mess.js'
import myPrs from './features/my-prs.js'
import moveInOut from './features/move-in-out.js'
import deployRocket from './features/deploy-rocket.js'
import waitingLine from './features/waiting-line.js'
import printerJam from './features/printer-jam.js'
import groundhog from './features/groundhog.js'
import fireDrill from './features/fire-drill.js'
import securityDesk from './features/security-desk.js'
import vending from './features/vending.js'
import library from './features/library.js'
import testLab from './features/test-lab.js'
import planWhiteboard from './features/plan-whiteboard.js'
import parkingGarage from './features/parking-garage.js'
import fridayDrinks from './features/friday-drinks.js'
import lostFound from './features/lost-found.js'
import interofficeMail from './features/interoffice-mail.js'
import walkabout from './features/walkabout.js'
import milestoneCake from './features/milestone-cake.js'
import reviewerVisits from './features/reviewer-visits.js'
import refactorCrane from './features/refactor-crane.js'
import timeClock from './features/time-clock.js'
import holidays from './features/holidays.js'
import windowCleaner from './features/window-cleaner.js'
import phoneBooth from './features/phone-booth.js'
import itTech from './features/it-tech.js'
import helipad from './features/helipad.js'
import ciSubway from './features/ci-subway.js'
import releaseParty from './features/release-party.js'
import tugOfWar from './features/tug-of-war.js'
import drones from './features/drones.js'
import commitStamps from './features/commit-stamps.js'
import mergeStamp from './features/merge-stamp.js'
import priceBillboard from './features/price-billboard.js'
import screensaver from './features/screensaver.js'
import standup from './features/standup.js'
import lunchRush from './features/lunch-rush.js'
import seismograph from './features/seismograph.js'
import windowHeatmap from './features/window-heatmap.js'
import hallOfRecords from './features/hall-of-records.js'
import blimp from './features/blimp.js'
import uniforms from './features/uniforms.js'
import wardrobe from './features/wardrobe.js'
import themes from './features/themes.js'
import skylineTowers from './features/skyline-towers.js'
import avatar from './features/avatar.js'
import readableMonitors from './features/readable-monitors.js'
import floorSounds from './features/floor-sounds.js'
import stormCloud from './features/storm-cloud.js'
import easterEggs from './features/easter-eggs.js'
import catChaos from './features/cat-chaos.js'
import tamagotchiPlant from './features/tamagotchi-plant.js'
import directorMode from './features/director-mode.js'
import ghostAnnex from './features/ghost-annex.js'
import memoryArchive from './features/memory-archive.js'
import agentXp from './features/agent-xp.js'
import branchMetro from './features/branch-metro.js'
import courtroom from './features/courtroom.js'
import bugSquash from './features/bug-squash.js'
import ivyWear from './features/ivy-wear.js'
import smokestack from './features/smokestack.js'
import postRoom from './features/post-room.js'
import expressElevator from './features/express-elevator.js'

const FEATURES = [['ceo-office', ceoOffice], ['desk-kit', deskKit], ['work-signals', workSignals], ['interactions', interactions], ['social', social], ['ambience', ambience], ['mess', mess], ['my-prs', myPrs], ['move-in-out', moveInOut], ['waiting-line', waitingLine], ['deploy-rocket', deployRocket],
  ['printer-jam', printerJam], ['groundhog', groundhog], ['fire-drill', fireDrill], ['security-desk', securityDesk], ['vending', vending], ['library', library], ['test-lab', testLab], ['plan-whiteboard', planWhiteboard], ['parking-garage', parkingGarage], ['friday-drinks', fridayDrinks], ['lost-found', lostFound], ['interoffice-mail', interofficeMail], ['post-room', postRoom],
  ['walkabout', walkabout], ['milestone-cake', milestoneCake], ['reviewer-visits', reviewerVisits], ['refactor-crane', refactorCrane], ['time-clock', timeClock], ['holidays', holidays], ['window-cleaner', windowCleaner], ['phone-booth', phoneBooth], ['it-tech', itTech], ['helipad', helipad],
  ['ci-subway', ciSubway], ['release-party', releaseParty], ['tug-of-war', tugOfWar], ['drones', drones], ['commit-stamps', commitStamps], ['merge-stamp', mergeStamp], ['price-billboard', priceBillboard], ['screensaver', screensaver], ['standup', standup], ['lunch-rush', lunchRush],
  ['seismograph', seismograph], ['window-heatmap', windowHeatmap], ['hall-of-records', hallOfRecords], ['blimp', blimp], ['uniforms', uniforms], ['wardrobe', wardrobe], ['themes', themes], ['skyline-towers', skylineTowers], ['avatar', avatar],
  ['readable-monitors', readableMonitors], ['floor-sounds', floorSounds], ['storm-cloud', stormCloud], ['easter-eggs', easterEggs], ['cat-chaos', catChaos], ['tamagotchi-plant', tamagotchiPlant],
  ['director-mode', directorMode], ['ghost-annex', ghostAnnex], ['memory-archive', memoryArchive], ['agent-xp', agentXp], ['branch-metro', branchMetro], ['courtroom', courtroom], ['bug-squash', bugSquash], ['ivy-wear', ivyWear], ['smokestack', smokestack], ['express-elevator', expressElevator]]
export const Z = { BEHIND: -100, WALL: 10, FLOOR: 50, SEATED: 120, STAND: 130, WALK: 140, RIDE: 150, FRONT: 200, OUTSIDE: 300, TOP: 400 }

export function createHooks() {
  const hooks = { snapshot: [], sync: [], layout: [], step: [], items: [], glow: [], post: [], overlay: [], click: [], dblclick: [], hover: [], leaving: [], mode: [], plaque: [] }
  // a throw is logged once per distinct message, so a bug that throws every frame does not flood the console
  const seen = new Set()
  const report = (tag, e) => { const k = tag + ' ' + (e?.message ?? e); if (seen.has(k)) return; if (seen.size > 500) seen.clear(); seen.add(k); console.error(`[tower:${tag}]`, e) }
  const run = (name, ...args) => { for (const fn of hooks[name]) { try { fn(...args) } catch (e) { report(name, e) } } }
  const ask = (name, ...args) => { for (const fn of hooks[name]) { try { const r = fn(...args); if (r) return r } catch (e) { report(name, e) } } return null }
  const on = (name, fn) => { if (!hooks[name]) throw new Error('unknown tower hook ' + name); hooks[name].push(fn) }
  return { hooks, report, run, ask, on }
}

// features switched off in the settings panel are skipped; they come back on a reload
export async function startFeatures(api, tower) {
  const switchedOff = new Set(api.settings?.effective?.disabled || [])
  for (const [name, fn] of FEATURES) { if (switchedOff.has(name)) continue; try { await fn(api, tower) } catch (e) { console.error(`tower feature ${name} failed to start`, e) } }
}
