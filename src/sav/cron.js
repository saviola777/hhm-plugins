/**
 * A simple, convenient cronjob plugin.
 *
 * Supports setting up game and real time cron job based on seconds, minutes,
 * and hours. For more frequent jobs simply use onGameTick or set up your own
 * setInterval cronjob.
 *
 * Cronjobs will automatically be picked up as they are defined.
 *
 * Available handlers:
 *
 * - onCronXXSeconds / onCronXXGameSeconds
 * - onCronXXMinutes / onCronXXGameMinutes
 * - onCronXXHours / onCronXXGameHours
 *
 * Insert any number for XX, it can have more than two digits. There are no
 * singular version of the units, so always use Seconds, Minutes or
 * Hours (first letter uppercase).
 *
 * You can add "Once" at the end of each of these to add a
 * one-time cron job. It will be executed once and then deleted.
 *
 * Usage:
 *
 * Simply add `sav/cron` to your dependencies, then start registering cronjobs:
 *
 * room.onCron10GameSeconds = () => room.sendChat("10 ingame seconds have passed");
 * room.onCron10Minutes = () => room.sendChat("10 minutes have passed");
 *
 * Configuration:
 *
 * - gameTicks: Cronjob scheduling will be checked after every X game ticks.
 *  Setting this lower than 60 makes little sense since cronjobs can't be
 *  scheduled more often than once per second. Keeping this a multiple of 60 is
 *  recommended but not required.
 *
 *
 * Changelog:
 *
 * 1.2.0:
 *  - fix issue where new cron jobs would not be picked up at runtime until a
 *    property was set
 *
 * 1.1.2:
 *  - adjust to HHM 0.9.1
 *
 * 1.1.1:
 *  - refactoring
 *
 * 1.1.0:
 *  - add support for one-time cron jobs
 *  - new jobs are picked up via observer pattern
 *
 * 1.0.0:
 *  - initial version, support for game and real time cron jobs
 *  - new jobs are picked up via polling
 *
 *  TODO keep track of and remove unused intervals
 *  TODO add support for removing cronjobs
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/cron`,
  author: `saviola`,
  version: `1.2.0`,
  config: {
    gameTicks: 60,
  }
};

//
// Global variables
//

const units = {
  Seconds: 1,
  Minutes: 60,
  Hours: 60*60,
};

const gameTickCronJobs = {};
const realTimeCronJobs = [];
let gameTicks = 60;
let globalTickCount = 0;

//
// Plugin functions
//

/**
 * TODO documentation
 */
function createCronJob(handlerName, unit) {
  const time = parseInt(handlerName.substr(6, handlerName.length - 6 - unit.length));

  if (isNaN(time)) return;

  const numSeconds = time * units[unit];

  realTimeCronJobs.push(handlerName);

  setInterval(() => room.triggerEvent(handlerName), numSeconds * 1000);
}

/**
 * TODO documentation
 */
function createGameTimeCronJob(handlerName, unit) {
  const time = parseInt(handlerName.substr(6, handlerName.length - 10 - unit.length));

  if (isNaN(time) || time <= 0) return;

  const numTicks = time * units[unit] * 60;

  let tickCounter = 1;

  gameTickCronJobs[handlerName] = function() {
    if (tickCounter === 0) {
      room.triggerEvent(handlerName);
    }

    tickCounter = Math.min(tickCounter + gameTicks, numTicks) % numTicks;
  };
}

/**
 * TODO documentation
 */
function createOneTimeCronJob(handlerName, unit, pluginId) {
  const time = parseInt(handlerName.substr(6, handlerName.length - 6 - unit.length));

  if (isNaN(time)) return;

  const numSeconds = time * units[unit];

  const plugin = room.getPluginManager().getPlugin(pluginId);
  const propertyName = handlerName + `Once`;

  const fn = plugin[propertyName];
  delete plugin[propertyName];

  setTimeout(() => {
    // Either execute or re-queue function
    if (room.getPluginManager().getPlugin(pluginId).isEnabled()) {
      fn();
    } else {
      plugin[propertyName] = fn;
    }
  }, numSeconds * 1000);
}

/**
 * TODO documentation
 */
function setupCronJobs() {
  gameTicks = room.getConfig().gameTicks;
  let handlerNames = room.getPluginManager().getHandlerNames()
      .filter(h => h.startsWith(`onCron`));

  for (let handlerName of handlerNames) {
    // Skip existing cron jobs
    if (realTimeCronJobs.indexOf(handlerName) !== -1
        || Object.getOwnPropertyNames(gameTickCronJobs).indexOf(handlerName)
        !== -1) {
      continue;
    }

    for (let unit of Object.getOwnPropertyNames(units)) {
      if (!handlerName.endsWith(unit)) continue;

      if (handlerName.endsWith(`Game${unit}`)) {
        createGameTimeCronJob(handlerName, unit);
        break;
      }

      createCronJob(handlerName, unit);
      break;
    }
  }

  // Handle one time cron jobs
  for (let plugin of room.getPluginManager().getEnabledPluginIds()
      .map(id => room.getPluginManager().getPlugin(id))) {

    handlerNames = plugin.getHandlerNames()
        .filter(h => h.startsWith(`onCron`) && h.endsWith(`Once`))
        .map(h => h.substr(0, h.length - 4))
        .filter(h => Object.getOwnPropertyNames(units)
          .filter(u => { return h.endsWith(u) }).length === 1);

    if (handlerNames.length === 0) {
      continue;
    }

    handlerNames.forEach(
        e => createOneTimeCronJob(e, Object.getOwnPropertyNames(units).filter(
            u => {return e.endsWith(u) })[0], plugin._id));
  }
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onGameTickHandler() {
  if (globalTickCount === 0) {
    gameTicks = room.getConfig().gameTicks;
    for (let event of Object.getOwnPropertyNames(gameTickCronJobs)) {
      gameTickCronJobs[event]();
    }
  }

  globalTickCount = Math.min(globalTickCount + 1, gameTicks) % gameTicks;
}

function onHhmEventHandlerSetHandler() {
  setupCronJobs();
}

/**
 * Pick up initial cron jobs.
 */
function onRoomLinkHandler() {
  setupCronJobs();
}

//
// Exports
//

room.onGameTick = onGameTickHandler;
room.onRoomLink = onRoomLinkHandler;
room.onHhm_eventHandlerSet = onHhmEventHandlerSetHandler;
