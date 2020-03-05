/**
 * HHM test plugin.
 *
 * The goal of this plugin is to allow automatic testing without the need for
 * a real haxball room. This is done by implementing a mock room interface.
 *
 * For now, this plugin only supports a limited subset of the headless host API,
 * see below for a list of API functions and events that are not currently
 * supported.
 *
 * To use this plugin to test your own plugin, simply load the plugin and
 * declare test handlers (beginning with "onTest"), which will be executed
 * automatically. Each test function receives an actor object as an argument,
 * which can be used to interact with the room.
 *
 * Use the tests in this plugin as examples.
 *
 * Unsupported:
 *
 * API:
 *  - setCustomStadium
 *  - setTeamColors
 *  - getScores: supported but always returns the same values
 *  - getBallPosition: supported but always returns the same value
 *  - stopRecording: supported but always returns the same value
 *  - setKickRateLimit
 *  - setPlayerAvatar
 *  - setDiscProperties
 *  - getDiscProperties
 *  - setPlayerDiscProperties
 *  - getPlayerDiscProperties
 *  - getDiscCount
 *
 * Events:
 *
 *  - onTeamVictory
 *  - onPlayerBallKick
 *  - onTeamGoal
 *  - onGameTick
 *  - onPositionsReset
 *  - onPlayerActivity
 *  - onKickRateLimitSet
 *
 * TODO:
 *  - keep track of and allow setting the time
 *  - (re)set player/ball position
 *  - set player avatar
 *  - set disc properties
 *  - score goals
 *  - simulate game ticks -> how to deal with floating point error? test
 *  - simulate player ball kick
 *  - simulate player activity
 *  - set custom stadium
 *  - store kick rate limit settings
 *  - disable all plugins that are not dependencies of the tested plugin by
 *    default and allow specifying additional plugins to be loaded
 *
 * Changelog:
 *
 * 0.8.0:
 *  - initial version
 *  - supports basic API
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/test`,
  author: `saviola`,
  version: `0.8.0`,
  dependencies: [
  ],
  order: {
  },
  config: {
    'debugOutput': false,
    'pluginBlacklist': [], // if you don't want to test certain plugins
    'pluginWhitelist': [], // if you only want to test specific plugins
    'selfTest': false, // whether to run test for this plugin as well
  }
};

//
// Global variables
//

class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AssertionError";
  }
}

let apiOverrideActive = false;

const roomState = {
  password: null,
  gamePaused: false,
  gameStarted: false,
  recording: false,
  scoreLimit: 0,
  stadium: `Classic`,
  timeLimit: 0,
  teamsLock: false,
};

let players = [];

let playersOnline = new Set();

const defaultStadiumNames = [`Classic`, `Easy`, `Small`, `Big`, `Rounded`,
                              `Hockey`, `Big Hockey`, `Big Easy`, `Big Rounded`,
                              `Huge`];

let bannedConns = [];

const teamIds = [0, 1, 2];
const teamNames = [`Spectators`, `Red Team`, `Blue Team`];

let messages = [];

const actor = {
  addPlayer: actorAddPlayer,
  assertChatContains: actorAssertChatContains,
  assertFalse: actorAssertFalse,
  assertEquals: actorAssertEquals,
  assertNotEquals: actorAssertNotEquals,
  assertRoomState: actorAssertRoomState,
  assertThrows: actorAssertThrows,
  assertTrue: actorAssertTrue,
  changePlayerTeam: actorChangePlayerTeam,
  changeStadium: actorChangeStadium,
  createEventMonitor: actorCreateEventMonitor,
  fail: actorFail,
  getRoomState: actorGetRoomState,
  kickPlayer: actorKickPlayer,
  removePlayer: actorRemovePlayer,
  sendChat: actorSendChat,
  startStopGame: actorStartStopGame,
  togglePlayerAdmin: actorTogglePlayerAdmin,
  toggleGamePause: actorToggleGamePause,
};

//
// Plugin functions
//


/**
 * TODO documentation
 */
function onHhm_userPluginsLoadedHandler() {
  room.log(`Running tests`);

  const roomManager = room.getRoomManager();

  const whitelist = room.getConfig().pluginWhitelist || [];
  const blacklist = room.getConfig().pluginBlacklist || [];

  const eventHandlerObjects = roomManager.getAllEventHandlerNames()
      .filter((h) => h.startsWith(`onTest`))
      .map((h) => roomManager.getAllEventHandlerObjects(h))
      .flatMap((m) => Array.from(m.values()))
      .filter((o) => (whitelist.length === 0
        || whitelist.includes(o.meta.plugin.getName()))
        && !blacklist.includes(o.meta.plugin.getName()));

  const testPluginIds = eventHandlerObjects.map((o) => o.meta.plugin.getId());

  const numTestsByPlugin = new Map();

  testPluginIds.map((i) => [i, testPluginIds.filter((j) => i === j).length])
      .forEach((e) => numTestsByPlugin.set(e[0], e[1]));

  room.log(`Found ${eventHandlerObjects.length} test(s) from `
      + `${numTestsByPlugin.size} plugin(s)`);

  let i = 1;
  let j = 1;
  let failures = 0;
  let timeStart = Date.now();
  let pluginId = -1;
  for (const eventHandlerObject of eventHandlerObjects) {
    cleanUpRoom();

    if (pluginId !== eventHandlerObject.meta.plugin.getId()) {
      j = 1;
      pluginId = eventHandlerObject.meta.plugin.getId();
    }

    const pluginName = eventHandlerObject.meta.plugin.getName();
    const testName = eventHandlerObject.getData(`sav/test`, `name`,
        eventHandlerObject.meta.name);
    const testOutput = `[${i}/${eventHandlerObjects.length}] Plugin `
        + `${pluginName}: ${testName} (${j}/${numTestsByPlugin.get(pluginId)})`;

    try {
      const metadata = eventHandlerObject.execute(undefined, actor);

      // If an error was thrown during handler execution, re-throw it
      if (metadata.getMostRecentReturnValue() instanceof Error) {
        throw metadata.getMostRecentReturnValue();
      }

      room.log(testOutput + ` ... ok`);
    } catch (e) {
      failures++;
      room.log(testOutput + ` ... FAILED`);
      if (e.name === `AssertionError`) {
        room.log(`Assertion error: ${e.message}`);
      } else {
        room.log(`${e.name}: ${e.message}`);
        console.trace(e);
      }
    }

    j++;
    i++;
  }

  let testTime = (Date.now() - timeStart)/1000;

  room.log(`Ran ${eventHandlerObjects.length} tests in ${testTime} seconds`);
  room.log(`Result: ${failures > 0 ? `FAILED (${failures} failures)` : `OK`}`);
}

const handlerWhiteList = ["onHhm_userPluginsLoaded", "onTest", "onRoomLink"];

function activateApiOverride() {
  apiOverrideActive = true;

  // Override native API functions
  room.extend(`sendAnnouncement`, apiSendAnnouncement);
  room.extend(`sendChat`, apiSendChat);
  room.extend(`setPlayerAdmin`, apiSetPlayerAdmin);
  room.extend(`setPlayerTeam`, apiSetPlayerTeam);
  room.extend(`kickPlayer`, apiKickPlayer);
  room.extend(`clearBan`, apiClearBan);
  room.extend(`clearBans`, apiClearBans);
  room.extend(`setScoreLimit`, apiSetScoreLimit);
  room.extend(`setTimeLimit`, apiSetTimeLimit);
  room.extend(`setCustomStadium`, apiSetCustomStadium);
  room.extend(`setDefaultStadium`, apiSetDefaultStadium);
  room.extend(`setTeamsLock`, apiSetTeamsLock);
  room.extend(`setTeamColors`, apiSetTeamColors);
  room.extend(`startGame`, apiStartGame);
  room.extend(`stopGame`, apiStopGame);
  room.extend(`pauseGame`, apiPauseGame);
  room.extend(`getPlayer`, apiGetPlayer);
  room.extend(`getPlayerList`, apiGetPlayerList);
  room.extend(`getScores`, apiGetScores);
  room.extend(`getBallPosition`, apiGetBallPosition);
  room.extend(`reorderPlayers`, apiReorderPlayers);
  room.extend(`startRecording`, apiStartRecording);
  room.extend(`stopRecording`, apiStopRecording);
  room.extend(`setPassword`, apiSetPassword);
}

function actorAddPlayer(name, { auth = generateRandomString(32),
  conn = generateRandomString(32), roomPassword = null } = {}) {

  if (roomState.password !== roomPassword) {
    const passwordSubstring = roomPassword === null ? `no password`
        : `the password ${roomPassword}`;
    room.log(`[ACTOR] Player ${name} was unable to join because `
        + `they gave ${passwordSubstring} while the room password was `
        + roomState.password, HHM.log.level.DEBUG);
    return null;
  }

  // TODO are bans conn-based only? Or also auth-based?
  if (bannedConns.includes(conn)) {
    room.log(`[ACTOR] Player ${name} was unable to join because they`
        + `are banned`, HHM.log.level.DEBUG);
    return null;
  }

  const playerId = players.length;

  players[playerId] = {
    id: playerId,
    name,
    team: 0,
    admin: false,
    position: null,
    auth,
    conn,
  };

  playersOnline.add(playerId);

  const playerCopy = $.extend({}, players[playerId]);

  room.log(`[ACTOR] Player ${name} (${playerId}) joined`, HHM.log.level.DEBUG);

  room.triggerEvent(`onPlayerJoin`, playerCopy);

  return playerCopy;
}

// Source can be "any", numOccurences can be true to accept any number greater 0
function actorAssertChatContains(message, numOccurences, source,
                                 properties = {}, ...args) {

  const messagesFound = findMessages(message, source, properties);

  const isEqual = messagesFound.length === numOccurences
      || (numOccurences === true && messagesFound.length > 0);

  console.assert(isEqual, ...args);

  if (!isEqual) {
    throw new AssertionError(`Expected ${numOccurences}, found ` +
        `${messagesFound.length} occurences`);
  }
}

function actorAssertEquals(expected, actual, ...args) {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    for (let i = 0; i < expected.length; i++) {
      actorAssertEquals(expected[i], actual[i])
    }
  } else {
    const isEqual = expected === actual;

    console.assert(isEqual, ...args);

    if (!isEqual) {
      throw new AssertionError(`${expected} !== ${actual}`);
    }
  }
}

function actorAssertFalse(condition, ...args) {
  actorAssertEquals(false, condition, ...args);
}

function actorAssertNotEquals(unexpected, actual, ...args) {
  if (Array.isArray(unexpected) && Array.isArray(actual)) {
    for (let i = 0; i < unexpected.length; i++) {
      actorAssertNotEquals(unexpected[i], actual[i])
    }
  } else {
    const isEqual = unexpected === actual;

    console.assert(!isEqual, ...args);

    if (isEqual) {
      throw new AssertionError(`${unexpected} === ${actual}`);
    }
  }
}

function actorAssertRoomState(property, expectedValue, ...args) {
  actorAssertEquals(expectedValue, roomState[property], ...args);
}

function actorAssertThrows(func, expectedErrorName, ...args) {
  try {
    func();
  } catch (actualError) {
    return actorAssertEquals(expectedErrorName, actualError.name, ...args);
  }

  throw new AssertionError(`Expected error ${expectedErrorName} not thrown`);
}

function actorAssertTrue(condition, ...args) {
  actorAssertEquals(true, condition, ...args);
}

function actorChangePlayerTeam(playerIdBy, team,
                               playerIdChanged = playerIdBy) {

  const logPrefix = `[ACTOR] changePlayerTeam(${playerIdBy}, `
      + `${team}, ${playerIdChanged})`;

  room.log(logPrefix, HHM.log.level.DEBUG);

  if (!teamIds.includes(team)) {
    return room.log(`${logPrefix}: invalid team ID ${team}`,
        HHM.log.level.DEBUG);
  }

  if (!playersOnline.has(playerIdChanged)) {
    return room.log(`${logPrefix}: unknown or offline `
        + `target player ${playerIdChanged}`, HHM.log.level.DEBUG);
  }

  if (players[playerIdChanged].team === team) {
    return room.log(`${logPrefix}: `
        + `old and new team are the same for player ${playerIdChanged}`,
        HHM.log.level.DEBUG);
  }

  if (!playersOnline.has(playerIdBy)) {
    return room.log(`${logPrefix}: unknown or offline `
        + `acting player ${playerIdBy}`, HHM.log.level.DEBUG);
  }

  if (!players[playerIdBy].admin) {
    if (playerIdChanged !== playerIdBy) {
      return room.log(`${logPrefix}: access denied for player `
          + `${playerIdBy} (not admin)`, HHM.log.level.DEBUG);
    }

    if (roomState.teamsLock) {
      return room.log(`${logPrefix}: access denied for player `
          + `${playerIdBy} (not admin and teams locked)`, HHM.log.level.DEBUG);
    }

    if (roomState.gameStarted) {
      return room.log(`${logPrefix}: access denied for player `
          + `${playerIdBy} (not admin and game underway)`,
          HHM.log.level.DEBUG);
    }
  }

  room.log(`[ACTOR] Player ${playerIdBy} moved player ${playerIdChanged} from `
      + `team ${players[playerIdChanged].team} to team ${team} successfully`,
      HHM.log.level.DEBUG);

  // Update player position in the player list
  playersOnline.delete(playerIdChanged);
  playersOnline.add(playerIdChanged);

  players[playerIdChanged].team = team;

  room.triggerEvent(`onPlayerTeamChange`,
      $.extend({}, players[playerIdChanged]),
      $.extend({}, players[playerIdBy]), team);
}

function actorChangeStadium(playerIdBy, stadium) {
  const logPrefix = `[ACTOR] changeStadium(${playerIdBy}, `
      + `${stadium.substring(0, 10)})`;

  if (!playersOnline.has(playerIdBy)) {
    return room.log(`${logPrefix}: unknown or offline `
        + `player ${playerIdBy}`, HHM.log.level.DEBUG);
  }

  if (!players[playerIdBy].admin) {
    return room.log(`${logPrefix}: access denied for player `
        + `${playerIdBy} (not admin)`, HHM.log.level.DEBUG);
  }

  //  check stadium
  if (!defaultStadiumNames.includes(stadium)) {
    return room.log(`${logPrefix}: setting custom stadiums is unsupported`,
        HHM.log.level.DEBUG);
  }

  roomState.stadium = stadium;

  room.log(`${logPrefix}: changed stadium to ${stadium}`, HHM.log.level.DEBUG);

  room.triggerEvent(`onStadiumChange`, stadium, $.extend({}, players[playerIdBy]));
}

function actorCreateEventMonitor(handlerName) {
  if (handlerWhiteList.some((h) => handlerName.startsWith(h))) {
    throw new Error(`Invalid event monitor for reserved event ${handlerName}`);
  }

  const monitor = {
    eventMetadata: [],
    clear: function() {
      this.eventMetadata = [];
    },

    get length() {
      return this.eventMetadata.length;
    },

    hasEvents: function() {
      return this.length > 0
    },

    get last() {
      return this.eventMetadata[this.length - 1];
    },
  };

  room.addPostEventHook(handlerName, ({ metadata }) => {
    monitor.eventMetadata.push(metadata);
  });

  return monitor;
}

function actorFail(...args) {
  console.assert(false, ...args);

  throw new AssertionError();
}

function actorGetRoomState() {
  return $.extend({}, roomState);
}

function actorKickPlayer(playerIdBy, playerIdKicked, reason,
                         ban = false) {
  const logPrefix = `[ACTOR] kickPlayer(${playerIdBy}, ${playerIdKicked}, `
    + `"${reason}", ${ban})`;

  if (!playersOnline.has(playerIdBy)) {
    return room.log(`${logPrefix}: unknown or offline `
        + `acting player ${playerIdBy}`, HHM.log.level.DEBUG);
  }

  if (!players[playerIdBy].admin) {
    return room.log(`${logPrefix}: acting player ${playerIdBy} `
        + `is not admin`, HHM.log.level.DEBUG);
  }

  const playerKicked = room.getPlayer(playerIdKicked);
  const playerBy = room.getPlayer(playerIdBy);

  if (!playersOnline.delete(playerIdKicked)) {
    return room.log(`${logPrefix}: Unable to kick unknown or offline player `
        + playerIdKicked, HHM.log.level.DEBUG);
  }

  if (ban) {
    bannedConns.push(players[playerIdKicked].conn);
  }

  room.triggerEvent(`onPlayerLeave`, $.extend({}, playerKicked));
  room.triggerEvent(`onPlayerKicked`, $.extend({}, playerKicked), reason,
      !!ban, $.extend({}, playerBy));
}

function actorRemovePlayer(playerId) {
  if (!playersOnline.delete(playerId)) {
    return room.log(`[ACTOR] removePlayer(${playerId}): unknown or offline `
    + `player`, HHM.log.level.DEBUG);
  }

  room.log(`[ACTOR] removePlayer(${playerId})`, HHM.log.level.DEBUG);

  room.triggerEvent(`onPlayerLeave`, $.extend({}, players[playerId]));
}

function actorSendChat(playerId, message) {
  if (!playersOnline.has(playerId)) {
    return room.log(`[ACTOR] Unable to send message from unknown or offline `
        + `player ${playerId}`, HHM.log.level.DEBUG);
  }

  const messageId = generateRandomString(6);

  room.log(`[ACTOR][${messageId}] Incoming message (${playerId}): "${message}"`,
      HHM.log.level.DEBUG);

  const eventHandlerReturnValue = room.triggerEvent(`onPlayerChat`,
      room.getPlayer(playerId), message);

  if (eventHandlerReturnValue) {
    room.log(`[CHAT][ACTOR][${playerId}] ${message}`, HHM.log.level.DEBUG);
    registerChatMessage(message, "actor", { playerId, messageId });
  } else {
    room.log(`[ACTOR][${messageId}] Message not echoed to room`,
        HHM.log.level.DEBUG);
  }
}

function actorStartStopGame(playerId) {
  if (!playersOnline.has(playerId)) {
    return room.log(`[ACTOR] startStopGame(${playerId}): unknown or offline `
        + `player`, HHM.log.level.DEBUG);
  }

  if (!players[playerId].admin) {
    return room.log(`[ACTOR] startStopGame(${playerId}): access denied `
        + `(not admin)`, HHM.log.level.DEBUG);
  }

  room.log(`[ACTOR] startStopGame(${playerId}): game `
      + `${roomState.gameStarted ? `stopped` : `started`}`, HHM.log.level.DEBUG);

  if (!roomState.gameStarted) {
    roomState.gameStarted = true;
    room.triggerEvent(`onGameStart`, $.extend({}, players[playerId]));
  } else {
    roomState.gameStarted = false;
    room.triggerEvent(`onGameStop`, $.extend({}, players[playerId]));
  }
}

function actorToggleGamePause(playerId) {
  const logPrefix = `[ACTOR] toggleGamePause`;

  if (!roomState.gameStarted) {
    return room.log(`${logPrefix}: `+
        `Game not started for player ${playerId}`, HHM.log.level.DEBUG);
  }

  if (!playersOnline.has(playerId)) {
    return room.log(`${logPrefix}: unknown or offline `
        + `player ${playerId}`, HHM.log.level.DEBUG);
  }

  if (!players[playerId].admin) {
    return room.log(`${logPrefix}: access denied for player `
        + `${playerId} (not admin)`, HHM.log.level.DEBUG);
  }

  const newPauseState = !roomState.gamePaused;

  room.log(`[ACTOR] Game ${newPauseState ? `paused` : `unpaused`} by player `
      + playerId, HHM.log.level.DEBUG);

  roomState.gamePaused = newPauseState;

  room.triggerEvent(newPauseState ? `onGamePause` : `onGameUnpause`,
      room.getPlayer(playerId));
}

function actorTogglePlayerAdmin(playerIdBy, playerIdChanged) {
  const logPrefix = `[ACTOR] togglePlayerAdmin(${playerIdBy}, `
        + `${playerIdChanged}):`;

  if (!playersOnline.has(playerIdChanged)) {
    return room.log(`${logPrefix}: unknown or offline target player`,
        HHM.log.level.DEBUG);
  }

  if (!playersOnline.has(playerIdBy)) {
    return room.log(`${logPrefix} unknown or offline acting player`,
        HHM.log.level.DEBUG);
  }

  if (!players[playerIdBy].admin) {
    return room.log(`${logPrefix}: access denied (not admin)`,
        HHM.log.level.DEBUG);
  }

  if (playerIdChanged === 0) {
    return room.log(`${logPrefix}: invalid action (can't remove host admin)`,
        HHM.log.level.DEBUG);
  }

  if (players[playerIdChanged].admin) {
    players[playerIdChanged].admin = false;
    room.log(`${logPrefix}: removed admin`, HHM.log.level.DEBUG);
  } else {
    players[playerIdChanged].admin = true;
    room.log(`${logPrefix}: gave admin`, HHM.log.level.DEBUG);
  }

  room.triggerEvent(`onPlayerAdminChange`, $.extend({},
      players[playerIdChanged]), $.extend({}, players[playerIdBy]));
}

function apiClearBan({ callingPluginName, previousFunction }, playerId) {
  if (!apiOverrideActive) return previousFunction(playerId);

  if (players[playerId] === undefined) {
    return room.log(`Unable to clear ban for unknown player ID ${playerId}`);
  }

  const connIndex = bannedConns.indexOf(players[playerId].conn);

  bannedConns.splice(connIndex, connIndex >= 0 ? 1 : 0);

  room.log(`[API] Ban cleared for player ID ${playerId}`, HHM.log.level.DEBUG);
}

function apiClearBans({ previousFunction }) {
  if (!apiOverrideActive) return previousFunction();

  bannedConns = [];

  room.log(`[API] All bans cleared`, HHM.log.level.DEBUG);
}

function apiGetBallPosition({ previousFunction }, ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  // TODO insert manually set ball position instead
  return roomState.gameStarted ? { x: 0, y: 0 } : null;
}

function apiGetPlayer({ previousFunction }, playerId) {
  if (!apiOverrideActive) return previousFunction(playerId);

  if (playersOnline.has(playerId)) {
    return {
      id: playerId,
      name: players[playerId].name,
      team: players[playerId].team,
      admin: players[playerId].admin,
      position: $.extend({}, players[playerId].position),
    };
  }

  return null;
}

function apiGetPlayerList({ previousFunction }) {
  if (!apiOverrideActive) return previousFunction();

  const playerList = [];

  playersOnline.forEach((id) => playerList.push($.extend({}, players[id])));

  return playerList;
}

function apiGetScores({ previousFunction }) {
  if (!apiOverrideActive) return previousFunction();

  // TODO support custom scores and time
  if (roomState.gameStarted) {
    return { red: 0, blue: 0, time: 0.00,
      scoreLimit: roomState.scoreLimit, timeLimit: roomState.timeLimit,
    }
  }

  return null;
}

function apiKickPlayer({ previousFunction }, playerId,
                       reason, ban = false) {
  if (!apiOverrideActive) return previousFunction(playerId, reason, ban);

  if (!playersOnline.delete(playerId)) {
    return room.log(`[API] Unable to kick unknown or offline player `
        + playerId, HHM.log.level.DEBUG);
  }

  const player = players[playerId];

  room.log(`[API] Player ${playerId} ${ban ? `banned` : `kicked`}`
      + (reason !== undefined ? `(${reason})` : ``),
      HHM.log.level.DEBUG);

  // TODO is this correct?
  if (ban) {
    bannedConns.push(player.conn);
  }

  room.triggerEvent(`onPlayerLeave`, $.extend({}, player));
  room.triggerEvent(`onPlayerKicked`, $.extend({}, player), reason,
      !!ban, HHM.config.room.noPlayer ? null : $.extend({}, players[0]));
}

function apiPauseGame({ previousFunction }, pauseState) {
  if (!apiOverrideActive) return previousFunction(pauseState);

  pauseState = !!pauseState;
  const previousPauseState = roomState.gamePaused;

  if (roomState.gameStarted) {
    roomState.gamePaused = pauseState;

    if (pauseState !== previousPauseState) {
      room.log(`[API] Game ${pauseState ? `paused` : `unpaused`}`,
          HHM.log.level.DEBUG);

      room.triggerEvent(pauseState ? `onGamePause` : `onGameUnpause`,
          HHM.config.room.noPlayer ? null : $.extend({}, players[0]));
    }
  }
}

function apiReorderPlayers({ previousFunction },
                           playerIdList, moveToTop) {

  // Filter invalid players, remove duplicates
  playerIdList = [...new Set(playerIdList.filter(
      (id) => playersOnline.has(id)))];
  playerIdList.forEach((id) => playersOnline.delete(id));

  if (moveToTop) {
    playersOnline.forEach((id) => playerIdList.push(id));
    playersOnline = new Set(playerIdList);
  } else {
    playerIdList.forEach((id) => playersOnline.add(id));
  }

  room.log(`New player order: ${[...playersOnline].join(`,`)}`,
      HHM.log.level.DEBUG);
}

function apiSendAnnouncement({ callingPluginName, previousFunction }, message,
                             playerId, color = `#FFFFFF`,
                             style = `normal`, sound = 0) {
  if (!apiOverrideActive) return previousFunction(message, playerId,
      color, style, sound);

  registerChatMessage(message, `api`, { playerId, pluginName: callingPluginName,
      color, style, sound });

  room.log(`[CHAT][API]${playerId !== undefined ?
      `[to ${playerId}]` : ``} ${message}`, HHM.log.level.DEBUG);
}

function apiSendChat({ callingPluginName, previousFunction }, message, playerId) {
  if (!apiOverrideActive) return previousFunction(message, playerId);

  registerChatMessage(message, "api",
      { playerId, pluginName: callingPluginName });

  room.log(`[CHAT][API]${playerId !== undefined ?
      `[to ${playerId}]` : ``} ${message}`, HHM.log.level.DEBUG);
}

// TODO support setting custom stadium and retrieving the string
function apiSetCustomStadium({ previousFunction },
                             ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  room.log(`[API] setCustomStadium not implemented`, HHM.log.level.DEBUG);
}

function apiSetDefaultStadium({ previousFunction },
                              stadiumName) {
  if (!apiOverrideActive) return previousFunction(stadiumName);

  if (!defaultStadiumNames.includes(stadiumName)) {
    return room.log(`[API] setDefaultStadium("${stadiumName}"): invalid ` +
        `stadium`, HHM.log.level.DEBUG);
  }

  roomState.stadium = stadiumName;

  room.log(`[API] setDefaultStadium("${stadiumName}")`, HHM.log.level.DEBUG);

  room.triggerEvent(`onStadiumChange`, stadiumName,
      HHM.config.room.noPlayer ? null : $.extend({}, players[0]));
}

function apiSetPassword({ previousFunction },
                        password = null) {
  if (!apiOverrideActive) return previousFunction(password);

  roomState.password = password;

  room.log(`[API] setPassword(${password === null ? `null` : `"${password}"`})`,
      HHM.log.level.DEBUG);
}

function apiSetPlayerAdmin({ previousFunction }, playerId,
                           admin) {
  if (!apiOverrideActive) return previousFunction(playerId, admin);

  if (!playersOnline.has(playerId)) {
    return room.log(`[API] setPlayerAdmin(${playerId}, ${admin}): `
      + `unknown or offline player ${playerId}`, HHM.log.level.DEBUG);
  }

  players[playerId].admin = admin;

  room.log(`[API] setPlayerAdmin(${playerId}, ${admin})`, HHM.log.level.DEBUG);

  room.triggerEvent(`onPlayerAdminChange`, $.extend({}, players[playerId]),
      null);
}

function apiSetPlayerTeam({ previousFunction }, playerId,
                          team) {
  if (!apiOverrideActive) return previousFunction(playerId, team);

  if (!playersOnline.has(playerId)) {
    return room.log(`[API] setPlayerTeam(${playerId}, ${team}): `
        + `unknown or offline player ${playerId}`, HHM.log.level.DEBUG);
  }

  if (!teamIds.includes(team)) {
    return room.log(`[API] setPlayerTeam(${playerId}, ${team}): `
        + `invalid team`, HHM.log.level.DEBUG);
  }

  // Update player position in player list
  playersOnline.delete(playerId);
  playersOnline.add(playerId);

  players[playerId].team = team;

  room.log(`[API] setPlayerTeam(${playerId}, ${team})`, HHM.log.level.DEBUG);

  room.triggerEvent(`onPlayerTeamChange`, $.extend({}, players[playerId]),
      HHM.config.room.noPlayer ? null : $.extend({}, players[0]));
}

function apiSetScoreLimit({ previousFunction }, scoreLimit) {
  if (!apiOverrideActive) return previousFunction(scoreLimit);

  // TODO check if numeric and integer
  if (!roomState.gameStarted) {
    roomState.scoreLimit = scoreLimit;

    room.log(`[API] setScoreLimit(${scoreLimit})`, HHM.log.level.DEBUG);
  }
}

function apiSetTeamColors({ previousFunction }, ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  room.log(`[API] setTeamColours not implemented`, HHM.log.level.DEBUG);
}

function apiSetTeamsLock({ previousFunction }, teamsLock) {
  if (!apiOverrideActive) return previousFunction(teamsLock);

  roomState.teamsLock = !!teamsLock;

  room.log(`[API] setTeamsLock(${!!teamsLock ? `true` : `false`})`,
      HHM.log.level.DEBUG);
}

function apiSetTimeLimit({ previousFunction }, timeLimit) {
  if (!apiOverrideActive) return previousFunction(timeLimit);

  if (!roomState.gameStarted) {
    // TODO check if numeric and integer
    roomState.timeLimit = timeLimit;

    room.log(`[API] setTimeLimit(${timeLimit})`, HHM.log.level.DEBUG);
  }
}

function apiStartGame({ previousFunction }, ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  if (!roomState.gameStarted) {
    roomState.gameStarted = true;
    roomState.gamePaused = false;

    // TODO trigger event?
    room.log(`[API] startGame()`, HHM.log.level.DEBUG);
    room.triggerEvent(`onGameStart`, null);
  }
}

function apiStartRecording({ previousFunction }, ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  if (!roomState.recording) {
    roomState.recording = true;

    room.log(`[API] startRecording()`, HHM.log.level.DEBUG);
  }
}

function apiStopGame({ previousFunction }, ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  if (roomState.gameStarted) {
    roomState.gameStarted = false;
    roomState.gamePaused = false;

    room.log(`[API] stopGame()`, HHM.log.level.DEBUG);

    room.triggerEvent(`onGameStop`, null);
  }
}

function apiStopRecording({ previousFunction }, ...args) {
  if (!apiOverrideActive) return previousFunction(...args);

  if (roomState.recording) {
    roomState.recording = false;

    room.log(`[API] stopRecording()`, HHM.log.level.DEBUG);

    // TODO calculate length
    return new Uint8Array(1000);
  }

  return null;
}

function cleanUpRoom() {
  room.log(`Cleaning up room`, HHM.log.level.DEBUG);
  // Remove players
  room.getPlayerList().filter((p) => p.id !== 0)
      .forEach((p) => actor.removePlayer(p.id));
  // Clear bans
  room.clearBans();
  // stop game
  room.stopGame();
  // stop recording
  room.stopRecording();
  // reset default stadium (classic)
  room.setDefaultStadium(`Classic`);
  // reset time/score limit (3/3)
  room.setTimeLimit(3);
  room.setScoreLimit(3);
  // unlock teams
  room.setTeamsLock(false);
  // reset password
  room.setPassword(null);
  messages = [];
  clearHooks();
}

function clearHooks() {
  room.getRoomManager().postEventHooks.forEach(
      (handlers) => handlers.delete(room.getId()));
}

function findMessages(message, source = "any", properties = {}) {

  const messageTimes = Array.from(messages.keys());
  messageTimes.sort((a, b) => b - a);

  const messagesFound = [];
  messageLoop: for (const messageObject of messages) {

    if (!messageObject.message.endsWith(message)) {
      continue;
    }

    if (source !== "any" && messageObject.source !== source) {
      continue;
    }

    for (const p of Object.getOwnPropertyNames(properties)) {
      if (messageObject.properties[p] !== properties[p]) {
        continue messageLoop;
      }
    }

    messagesFound.push(messageObject);
  }

  return messagesFound;
}

// https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
function generateRandomString(length) {
  let result = ``;
  const characters =
      `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
  const charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

// Register a new chat message
function onRoomLinkHandler() {
  if (!apiOverrideActive) {
    activateApiOverride();
  }

  if (room.getConfig().debugOutput) {
    HHM.log.setLevel(HHM.log.level.DEBUG);
  }

  if (!room.getConfig().selfTest) {
    room.getConfig().pluginBlacklist.push(`sav/test`);
  }

  if (!HHM.config.room.noPlayer) {
    players[0] = {
      id: 0,
      name: `host`, // TODO dynamic name
      team: 0,
      admin: true,
      position: null,
      auth: `HOST_AUTH`,
      conn: `HOST_CONN`,
    };
    playersOnline.add(0);
  } else {
    players[0] = null;
  }
}

//
// Exports
//

function registerChatMessage(message, source, properties = {}) {
  const time = Date.now();

  if (properties.messageId === undefined) {
    properties.messageId = generateRandomString(6);
  }

  messages.push({ message, source, properties, time });

  return properties.messageId;
}

//
// Event handlers
//

function testActorAddPlayer(actor) {
  const player = actor.addPlayer(`test`);
  actor.assertNotEquals(null, player);
  actor.assertEquals(`test`, room.getPlayer(player.id).name);
}

function testActorChangePlayerTeam(actor) {
  const player = actor.addPlayer(`test`);

  actor.changePlayerTeam(player.id, 1);

  actor.assertEquals(1, room.getPlayer(player.id).team);

  room.setTeamsLock(true);

  actor.changePlayerTeam(player.id, 2);

  actor.assertEquals(1, room.getPlayer(player.id).team);

  room.setTeamsLock(false);

  room.startGame();

  actor.changePlayerTeam(player.id, 2);

  actor.assertEquals(1, room.getPlayer(player.id).team);

  room.setPlayerAdmin(player.id, true);

  actor.changePlayerTeam(player.id, 2);

  actor.assertEquals(2, room.getPlayer(player.id).team);
}

function testActorChangeStadium(actor) {
  const player = actor.addPlayer(`test`);

  actor.changeStadium(player.id, `Big`);

  actor.assertRoomState(`stadium`, `Classic`);

  room.setPlayerAdmin(player.id, true);

  actor.changeStadium(player.id, `Big`);

  actor.assertRoomState(`stadium`, `Big`);

  actor.changeStadium(player.id, `SomethingElse`);

  actor.assertRoomState(`stadium`, `Big`);
}

function testActorKickPlayer(actor) {
  const player1 = actor.addPlayer(`test1`);
  const player2 = actor.addPlayer(`test2_1`);

  actor.kickPlayer(player1.id, player2.id, `kick without admin`, false);

  actor.assertNotEquals(null, room.getPlayer(player2.id));

  room.setPlayerAdmin(player1.id, true);

  actor.kickPlayer(player1.id, player2.id, `kick with admin`, false);

  actor.assertEquals(null, room.getPlayer(player2.id));

  const player3 = actor.addPlayer(`test2_2`, player2);

  actor.assertNotEquals(null, player3);

  actor.kickPlayer(player1.id, player3.id, `ban with admin`, true);

  actor.assertEquals(null, room.getPlayer(player3.id));

  const player4 = actor.addPlayer(`test2_3`, player2);

  actor.assertEquals(null, player4);
}

function testActorRemovePlayer(actor) {
  const player = actor.addPlayer(`test`);

  actor.removePlayer(player.id);

  actor.assertEquals(null, room.getPlayer(player.id));
}

function testActorSendChat(actor) {
  const player = actor.addPlayer(`test`);

  actor.sendChat(player.id, `test message`);

  actor.assertChatContains(`test message`, 1, `actor`,
      { playerId: player.id });
}

function testActorStartStopGame(actor) {
  const player = actor.addPlayer(`test`);

  actor.startStopGame(player.id);

  actor.assertRoomState(`gameStarted`, false);

  room.setPlayerAdmin(player.id, true);

  actor.startStopGame(player.id);

  actor.assertRoomState(`gameStarted`, true);

  actor.startStopGame(player.id);

  actor.assertRoomState(`gameStarted`, false);
}

function testActorToggleGamePause(actor) {
  const player = actor.addPlayer(`test`);

  room.startGame();

  actor.toggleGamePause(player.id);

  actor.assertRoomState(`gamePaused`, false);

  room.setPlayerAdmin(player.id, true);

  actor.toggleGamePause(player.id);

  actor.assertRoomState(`gamePaused`, true);

  actor.toggleGamePause(player.id);

  actor.assertRoomState(`gamePaused`, false);
}

function testActorTogglePlayerAdmin(actor) {
  const player1 = actor.addPlayer(`test1`);
  const player2 = actor.addPlayer(`test2`);

  actor.togglePlayerAdmin(player1.id, player2.id);

  actor.assertFalse(room.getPlayer(player2.id).admin);

  room.setPlayerAdmin(player1.id, true);

  actor.togglePlayerAdmin(player1.id, player2.id);

  actor.assertTrue(room.getPlayer(player2.id).admin);

  actor.togglePlayerAdmin(player2.id, player1.id);

  actor.assertFalse(room.getPlayer(player1.id).admin);
}

function testApiBan(actor) {
  const player = actor.addPlayer(`test`);
  room.kickPlayer(player.id, `test ban`, true);

  actor.assertEquals(null, actor.addPlayer(`test2`, player));
}

function testApiClearBan(actor) {
  const player = actor.addPlayer(`test`);
  room.kickPlayer(player.id, `test clear ban`, true);
  room.clearBan(player.id);
  actor.assertEquals(player.conn, actor.addPlayer(`test3`, player).conn);
}

function testApiClearBans(actor) {
  const player = actor.addPlayer(`test`);
  const player2 = actor.addPlayer(`test2`);
  room.kickPlayer(player.id, `test clear bans`, true);
  room.kickPlayer(player2.id, `test clear bans`, true);

  room.clearBans();
  actor.assertEquals(player.conn, actor.addPlayer(`test3`, player).conn);
  actor.assertEquals(player2.conn, actor.addPlayer(`test4`, player2).conn);
}

function testApiGetPlayer(actor) {
  // add player, retrieve player, compare nick
  const player = actor.addPlayer(`test`);
  actor.assertEquals(`test`, room.getPlayer(player.id).name);
  // retrieve non-existent player
  actor.assertEquals(null, room.getPlayer(player.id+1));
}

function testApiGetPlayerList(actor) {
  // add players, get player list, check order
  const p1 = actor.addPlayer(`test`);
  const p2 = actor.addPlayer(`test2`);
  const p3 = actor.addPlayer(`test3`);

  let playerList = room.getPlayerList();

  actor.assertEquals(p1.id, playerList[0].id);
  actor.assertEquals(p2.id, playerList[1].id);
  actor.assertEquals(p3.id, playerList[2].id);

  // move player to other team, check order
  room.setPlayerTeam(p1.id, 1);

  playerList = room.getPlayerList();

  actor.assertEquals(p2.id, playerList[0].id);
  actor.assertEquals(p3.id, playerList[1].id);
  actor.assertEquals(p1.id, playerList[2].id);

  room.setPlayerTeam(p2.id, 2);

  playerList = room.getPlayerList();

  actor.assertEquals(p3.id, playerList[0].id);
  actor.assertEquals(p1.id, playerList[1].id);
  actor.assertEquals(p2.id, playerList[2].id);
}

function testApiKickPlayer(actor) {
  // add player
  let player = actor.addPlayer(`test`);
  // kick player, make sure they're gone but can rejoin
  room.kickPlayer(player.id);
  actor.assertEquals(null, room.getPlayer(player.id));

  player = actor.addPlayer(`test2`, player);
  actor.assertEquals(`test2`, player.name);

  // ban player
  room.kickPlayer(player.id, `test`, true);
  actor.assertEquals(null, room.getPlayer(player.id));

  // make sure they can't rejoin
  player = actor.addPlayer(`test3`, player);
  actor.assertEquals(null, player);
}

function testApiPauseGame(actor) {
  // start game, pause game, check that it's paused
  room.startGame();

  room.pauseGame(true);
  actor.assertRoomState(`gamePaused`, true);

  // pause again, make sure it's still paused
  room.pauseGame(true);
  actor.assertRoomState(`gamePaused`, true);

  // unpause, check that it's unpaused
  room.pauseGame(false);
  actor.assertRoomState(`gamePaused`, false);

  // unpause again, check that it's still unpaused
  room.pauseGame(false);
  actor.assertRoomState(`gamePaused`, false);

  room.stopGame();

  // make sure pause has no effect when game is not started
  room.pauseGame(true);
  actor.assertRoomState(`gamePaused`, false);
}

function testApiReorderPlayers(actor) {
  // add some players
  const p1 = actor.addPlayer(`test`);
  const p2 = actor.addPlayer(`test2`);
  const p3 = actor.addPlayer(`test3`);

  // reorder and check new order
  room.reorderPlayers([p2.id, p1.id], false);

  let playerList = room.getPlayerList();

  actor.assertEquals(p3.id, playerList[0].id, `${p3.id} should be first`);
  actor.assertEquals(p2.id, playerList[1].id, `${p2.id} should be second`);
  actor.assertEquals(p1.id, playerList[2].id, `${p1.id} should be last`);

  room.reorderPlayers([p2.id, p1.id], true);

  playerList = room.getPlayerList();

  actor.assertEquals(p2.id, playerList[0].id, `${p2.id} should be first`);
  actor.assertEquals(p1.id, playerList[1].id, `${p1.id} should be second`);
  actor.assertEquals(p3.id, playerList[2].id, `${p3.id} should be last`);
}

function testApiSendAnnouncement(actor) {
  room.sendAnnouncement(`testApiSendAnnouncement`);
  actor.assertChatContains(`testApiSendAnnouncement`, 1, `api`,
      { color: `#FFFFFF`, style: `normal`, sound: 0 });
  room.sendAnnouncement(`testApiSendAnnouncement`);
  actor.assertChatContains(`testApiSendAnnouncement`, 2, `api`);

  const testPlayer = actor.addPlayer(`tester`);
  room.sendAnnouncement(`testApiSendAnnouncement to player`, testPlayer.id);
  actor.assertChatContains(`testApiSendAnnouncement to player`, 1, `api`,
      { playerId: testPlayer.id });

  room.sendAnnouncement(`testApiSendAnnouncement with formatting`, undefined,
      `#CCCCCC`, `small`, 1);
  actor.assertChatContains(`testApiSendAnnouncement with formatting`, 1, `api`,
      { color: `#CCCCCC`, style: `small`, sound: 1 });
}

function testApiSendChat(actor) {
  room.sendChat(`testApiSendChat`);
  actor.assertChatContains(`testApiSendChat`, 1, `api`);
  room.sendChat(`testApiSendChat`);
  actor.assertChatContains(`testApiSendChat`, 2, `api`);

  const testPlayer = actor.addPlayer(`tester`);
  room.sendChat(`testApiSendChat to player`, testPlayer.id);
  actor.assertChatContains(`testApiSendChat to player`, 1, `api`,
      { playerId: testPlayer.id });
}

function testApiSetDefaultStadium(actor) {
  for (let stadium of defaultStadiumNames) {
    room.setDefaultStadium(stadium);

    actor.assertRoomState(`stadium`, stadium);
  }

  room.setDefaultStadium(`Classic`);
  room.setDefaultStadium(`invalid`);

  actor.assertRoomState(`stadium`, `Classic`);
}

function testApiSetPassword(actor) {
  room.setPassword(`test`);

  actor.assertRoomState(`password`, `test`);

  let player = actor.addPlayer(`test`, { roomPassword: `wrong`} );
  actor.assertEquals(player, null);

  player = actor.addPlayer(`test2`, { roomPassword: `test`} );
  actor.assertEquals(`test2`, player.name);
}

function testApiSetPlayerAdmin(actor) {
  const player = actor.addPlayer(`tester`);

  actor.assertEquals(false, room.getPlayer(player.id).admin);

  room.setPlayerAdmin(player.id, true);

  actor.assertEquals(true, room.getPlayer(player.id).admin);

  room.setPlayerAdmin(player.id, false);

  actor.assertEquals(false, room.getPlayer(player.id).admin);
}

function testApiSetPlayerTeam(actor) {
  const player = actor.addPlayer(`tester1`);
  actor.addPlayer(`tester2`);

  actor.assertEquals(player.id, room.getPlayerList()[0].id);

  actor.assertEquals(0, room.getPlayer(player.id).team);

  room.setPlayerTeam(player.id, 1);

  actor.assertEquals(1, room.getPlayer(player.id).team);
  actor.assertEquals(player.id, room.getPlayerList()[1].id);

  room.setPlayerTeam(player.id, 2);

  actor.assertEquals(2, room.getPlayer(player.id).team);

  room.setPlayerTeam(player.id, 0);

  actor.assertEquals(0, room.getPlayer(player.id).team);
}

function testApiSetScoreLimit(actor) {
  // Check initial score limit is set and that setting score limit has no
  // effect when the game is running
  room.startGame();
  room.setScoreLimit(10);
  actor.assertRoomState(`scoreLimit`, 3);
  room.stopGame();

  room.setScoreLimit(7);
  room.startGame();
  actor.assertRoomState(`scoreLimit`, 7);
}

// TODO Store team colors
function testApiSetTeamsLock(actor) {
  actor.assertRoomState(`teamsLock`, false);

  room.setTeamsLock(true);

  actor.assertRoomState(`teamsLock`, true);

  room.setTeamsLock(false);

  actor.assertRoomState(`teamsLock`, false);
}

function testApiSetTimeLimit(actor) {
  // Check initial time limit is set and that setting time limit has no
  // effect when the game is running
  room.startGame();
  room.setTimeLimit(10);
  actor.assertRoomState(`timeLimit`, 3);
  room.stopGame();

  room.setTimeLimit(7);
  room.startGame();
  actor.assertRoomState(`timeLimit`, 7);
}

function testApiStartGame(actor) {
  // make sure game is not started
  actor.assertRoomState(`gameStarted`, false);

  // start game, make sure it's started
  room.startGame();
  actor.assertRoomState(`gameStarted`, true);

  // start game again, make sure it's still started
  room.startGame();
  actor.assertRoomState(`gameStarted`, true);

  room.stopGame();
  actor.assertRoomState(`gameStarted`, false);
}

function testApiStartRecording(actor) {
  // make sure it's not recording
  actor.assertEquals(false, roomState.recording);

  // start recording, make sure it's started
  room.startRecording();
  actor.assertEquals(true, roomState.recording);

  // start recording again, make sure it's still started
  room.startRecording();
  actor.assertEquals(true, roomState.recording);
}

function testApiStopGame(actor) {
  // start game
  room.startGame();

  // stop game, make sure it's stopped
  room.stopGame();
  actor.assertRoomState(`gameStarted`, false);

  // stop game again, make sure it's still stopped
  room.stopGame();
  actor.assertRoomState(`gameStarted`, false);
}

function testApiStopRecording(actor) {

  // start recording
  room.startRecording();

  // TODO handle return values from stop recording

  // stop recording, make sure it's stopped
  room.stopRecording();
  actor.assertRoomState(`recording`, false);

  // stop recording again, make sure it's still stopped
  room.stopRecording();
  actor.assertRoomState(`recording`, false);
}

function testEventOnGamePause(actor) {
  const monitor = actor.createEventMonitor(`onGamePause`);

  room.startGame();

  room.pauseGame(true);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(null, monitor.last.args[0]);

  room.pauseGame(false);
  room.pauseGame(true);

  actor.assertEquals(2, monitor.length);

  room.stopGame();

  const player = actor.addPlayer(`test`);

  room.setPlayerAdmin(player.id, true);

  room.startGame();

  actor.toggleGamePause(player.id);

  actor.assertEquals(3, monitor.length);
  actor.assertEquals(player.id, monitor.last.args[0].id);
}

function testEventOnGameStart(actor) {
  const monitor = actor.createEventMonitor(`onGameStart`);

  room.startGame();

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(null, monitor.last.args[0]);

  room.stopGame();

  const player = actor.addPlayer(`test`);
  room.setPlayerAdmin(player.id, true);

  actor.startStopGame(player.id);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player.id, monitor.last.args[0].id);
}

function testEventOnGameStop(actor) {
  const monitor = actor.createEventMonitor(`onGameStop`);

  room.startGame();

  room.stopGame();

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(null, monitor.last.args[0]);

  room.startGame();

  const player = actor.addPlayer(`test`);
  room.setPlayerAdmin(player.id, true);

  actor.startStopGame(player.id);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player.id, monitor.last.args[0].id);
}

function testEventOnGameUnpause(actor) {
  const monitor = actor.createEventMonitor(`onGameUnpause`);

  room.startGame();

  room.pauseGame(true);
  room.pauseGame(false);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(null, monitor.last.args[0]);

  room.pauseGame(true);
  room.pauseGame(false);

  actor.assertEquals(2, monitor.length);

  room.stopGame();

  const player = actor.addPlayer(`test`);

  room.setPlayerAdmin(player.id, true);

  room.startGame();
  room.pauseGame(true);

  actor.toggleGamePause(player.id);

  actor.assertEquals(3, monitor.length);
  actor.assertEquals(player.id, monitor.last.args[0].id);
}

function testEventOnPlayerAdminChange(actor) {
  const monitor = actor.createEventMonitor(`onPlayerAdminChange`);

  const player1 = actor.addPlayer(`test1`);
  room.setPlayerAdmin(player1.id, true);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(player1.id, monitor.last.args[0].id);
  actor.assertEquals(null, monitor.last.args[1]);

  const player2 = actor.addPlayer(`test2`);

  actor.togglePlayerAdmin(player1.id, player2.id);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player2.id, monitor.last.args[0].id);
  actor.assertEquals(player1.id, monitor.last.args[1].id);
}

function testEventOnPlayerChat(actor) {
  const monitor = actor.createEventMonitor(`onPlayerChat`);

  const player = actor.addPlayer(`test`);

  actor.sendChat(player.id, `test message`);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(player.id, monitor.last.args[0].id);
  actor.assertEquals(`test message`, monitor.last.args[1]);

  room.onPlayerChat = () => false;

  actor.sendChat(player.id, `muted message`);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player.id, monitor.last.args[0].id);
  actor.assertEquals(`muted message`, monitor.last.args[1]);
  actor.assertEquals(false, monitor.last.getReturnValue());
}

function testEventOnPlayerJoin(actor) {
  const monitor = actor.createEventMonitor(`onPlayerJoin`);

  const player1 = actor.addPlayer(`test1`);

  actor.assertEquals(1, monitor.eventMetadata.length);
  actor.assertEquals(player1.id, monitor.last.args[0].id);

  const player2 = actor.addPlayer(`test2`);

  actor.assertEquals(2, monitor.eventMetadata.length);
  actor.assertEquals(player2.id, monitor.last.args[0].id);
}

function testEventOnPlayerKicked(actor) {
  const monitor = actor.createEventMonitor(`onPlayerKicked`);

  const player1 = actor.addPlayer(`test1`);
  const player2 = actor.addPlayer(`test2`);
  room.setPlayerAdmin(player2.id, true);
  const player3 = actor.addPlayer(`test3`);
  const player4 = actor.addPlayer(`test4`);

  room.kickPlayer(player1.id, `test api kick`, false);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(player1.id, monitor.last.args[0].id);
  actor.assertEquals(`test api kick`, monitor.last.args[1]);
  actor.assertEquals(false, monitor.last.args[2]);
  actor.assertEquals(null, monitor.last.args[3]);

  actor.kickPlayer(player2.id, player3.id, `test actor kick`);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player3.id, monitor.last.args[0].id);
  actor.assertEquals(`test actor kick`, monitor.last.args[1]);
  actor.assertEquals(false, monitor.last.args[2]);
  actor.assertEquals(player2.id, monitor.last.args[3].id);

  actor.kickPlayer(player2.id, player4.id, `test actor kickban`, true);

  actor.assertEquals(3, monitor.length);
  actor.assertEquals(player4.id, monitor.last.args[0].id);
  actor.assertEquals(`test actor kickban`, monitor.last.args[1]);
  actor.assertEquals(true, monitor.last.args[2]);
  actor.assertEquals(player2.id, monitor.last.args[3].id);
}

function testEventOnPlayerLeave(actor) {
  const monitor = actor.createEventMonitor(`onPlayerLeave`);

  const player1 = actor.addPlayer(`test1`);
  const player2 = actor.addPlayer(`test2`);
  const player3 = actor.addPlayer(`test3`);
  const player4 = actor.addPlayer(`test4`);

  actor.removePlayer(player1.id);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(player1.id, monitor.last.args[0].id);

  room.kickPlayer(player2.id);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player2.id, monitor.last.args[0].id);

  room.setPlayerAdmin(player3.id, true);
  actor.kickPlayer(player3.id, player4.id, `test`);

  actor.assertEquals(3, monitor.length);
  actor.assertEquals(player4.id, monitor.last.args[0].id);
}

function testEventOnPlayerTeamChange(actor) {
  const monitor = actor.createEventMonitor(`onPlayerTeamChange`);

  const player1 = actor.addPlayer(`test1`);
  room.setPlayerAdmin(player1.id, true);
  room.setPlayerTeam(player1.id, 2);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(player1.id, monitor.last.args[0].id);
  actor.assertEquals(null, monitor.last.args[1]);

  const player2 = actor.addPlayer(`test2`);

  actor.changePlayerTeam(player1.id, 2, player2.id);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(player2.id, monitor.last.args[0].id);
  actor.assertEquals(player1.id, monitor.last.args[1].id);
}

function testEventOnStadiumChange(actor) {
  const monitor = actor.createEventMonitor(`onStadiumChange`);

  room.setDefaultStadium(`Big`);

  actor.assertEquals(1, monitor.length);
  actor.assertEquals(`Big`, monitor.last.args[0]);
  actor.assertEquals(null, monitor.last.args[1]);

  const player = actor.addPlayer(`test`);
  room.setPlayerAdmin(player.id, true);

  actor.changeStadium(player.id, `Huge`);

  actor.assertEquals(2, monitor.length);
  actor.assertEquals(`Huge`, monitor.last.args[0]);
  actor.assertEquals(player.id, monitor.last.args[1].id);
}

room.onHhm_userPluginsLoaded = onHhm_userPluginsLoadedHandler;
room.onRoomLink = onRoomLinkHandler;

room.onTest_actorAddPlayer = testActorAddPlayer;
room.onTest_actorChangePlayerTeam = testActorChangePlayerTeam;
room.onTest_actorChangeStadium = testActorChangeStadium;
room.onTest_actorKickPlayer = testActorKickPlayer;
room.onTest_actorRemovePlayer = testActorRemovePlayer;
room.onTest_actorSendChat = testActorSendChat;
room.onTest_actorStartStopGame = testActorStartStopGame;
room.onTest_actorToggleGamePause = testActorToggleGamePause;
room.onTest_actorTogglePlayerAdmin = testActorTogglePlayerAdmin;
room.onTest_apiBan = testApiBan;
room.onTest_apiClearBan = testApiClearBan;
room.onTest_apiClearBans = testApiClearBans;
room.onTest_apiGetPlayer = testApiGetPlayer;
room.onTest_apiGetPlayerList = testApiGetPlayerList;
room.onTest_apiKickPlayer = testApiKickPlayer;
room.onTest_apiPauseGame = testApiPauseGame;
room.onTest_apiReorderPlayers = testApiReorderPlayers;
room.onTest_apiSendAnnouncement = testApiSendAnnouncement;
room.onTest_apiSendChat = testApiSendChat;
room.onTest_apiSetDefaultStadium = testApiSetDefaultStadium;
room.onTest_apiSetPassword = testApiSetPassword;
room.onTest_apiSetPlayerAdmin = testApiSetPlayerAdmin;
room.onTest_apiSetPlayerTeam = testApiSetPlayerTeam;
room.onTest_apiSetScoreLimit = testApiSetScoreLimit;
room.onTest_apiSetTeamsLock = testApiSetTeamsLock;
room.onTest_apiSetTimeLimit = testApiSetTimeLimit;
room.onTest_apiStartGame = testApiStartGame;
room.onTest_apiStartRecording = testApiStartRecording;
room.onTest_apiStopGame = testApiStopGame;
room.onTest_apiStopRecording = testApiStopRecording;
room.onTest_eventOnGamePause = testEventOnGamePause;
room.onTest_eventOnGameStart = testEventOnGameStart;
room.onTest_eventOnGameStop = testEventOnGameStop;
room.onTest_eventOnGameUnpause = testEventOnGameUnpause;
room.onTest_eventOnPlayerAdminChange = testEventOnPlayerAdminChange;
room.onTest_eventOnPlayerChat = testEventOnPlayerChat;
room.onTest_eventOnPlayerJoin = testEventOnPlayerJoin;
room.onTest_eventOnPlayerKicked = testEventOnPlayerKicked;
room.onTest_eventOnPlayerLeave = testEventOnPlayerLeave;
room.onTest_eventOnPlayerTeamChange = testEventOnPlayerTeamChange;
room.onTest_eventOnStadiumChange = testEventOnStadiumChange;
