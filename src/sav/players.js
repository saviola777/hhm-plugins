/**
 * Player management plugin.
 *
 * This module adds a layer above the native Haxball API which fixes issues
 * arising from the async nature of the native API.
 *
 * These will now have immediate effect (i.e. immediately calling
 * room.getPlayer for the affected player will contain the expected state):
 *
 *  - giving a player admin
 *  - changing the team of a player
 *  - kicking a player
 *
 * Changelog:
 *
 * 1.2.2:
 *  - adjust to HHM 0.9.1
 *  - inject player objects into native events
 *
 * 1.2.1:
 *  - add support for persistence of user data
 *  - minor API changes, no more functions on the player / user objects
 *
 * 1.2.0:
 *  - distinguish between user and player, otherwise the plugin would get
 *    confused with several players in the room having the same auth
 *  - onPlayerJoin logic is now executed as a pre-event handler hook, so there
 *    is no longer any need to declare the execution order for every plugin
 *    that wants to use the data backend provided by this plugin
 *
 * 1.1.0:
 *  - add layer which fixes async issues
 *
 * 1.0.0:
 *  - keeps track of player information by auth
 *  - extends getPlayer() and getPlayerList() functions
 *  - allows access to users not in the room
 *  - fully backwards compatible
 *
 * TODO persistence
 * TODO documentation
 * TODO config documentation
 */

const room = HBInit();

room.pluginSpec = {
  name: `sav/players`,
  author: `saviola`,
  version: `1.2.2`,
  config: {
    maxPlayerNameLength: 15,
    addPlayerIdToNickname: true,
  }
};

//
// Global variables
//

/**
 * Maps auth string to user data.
 *
 * This does not contain player data, since several players can have the same
 * auth.
 */
const usersByAuth = {};

/**
 * Maps player IDs to auth strings
 */
const idToAuth = {};

/**
 * Maps connection strings to a set of associated auth strings
 */
const playersByConn = {};

/**
 * Contains player data.
 */
const playersById = {};

/**
 * Initialized in onRoomLinkHandler.
 */
let getPlayerNative;

//
// Plugin functions
//

/**
 * Convenience function to create a player data getter for the given
 * plugin.
 */
function buildPlayerPluginDataGetter(pluginName) {
  return (playerId) => {
    return getPlayerData(playerId, pluginName);
  };
}

/**
 * Convenience function to create a user data getter for the given
 * plugin.
 */
function buildUserPluginDataGetter(pluginName) {
  return (playerId) => {
    return getUserData(idToAuth[playerId], pluginName);
  };
}

/**
 * TODO documentation
 */
function createInitialPlayerObject(player) {
  return {
    'admin': player.admin,
    'id': player.id,
    'name': createPlayerName(player),
    'online': true,
    'originalName': player.name,
    'team': player.team,

    '_pluginData': {
    },
  };
}

/**
 * TODO documentation
 */
function createInitialUserdataObject() {
  return {
    '_pluginData': {
      'sav/players': {
        'seen': new Date(),
        'conns': new Set(),
        'ids': new Set(),
        'names': new Set(),
      },
    },
  };
}

/**
 * TODO documentation
 */
function createPlayerName(player) {
  const nameLength = room.getConfig().maxPlayerNameLength;
  let playerName = player.name;
  if (room.getConfig().maxPlayerNameLength > 0) {
    playerName = playerName.length <= nameLength ? playerName
        : playerName.substr(0, nameLength - 1) + '…';
  }

  if (room.getConfig().addPlayerIdToNickname) {
    playerName += `#${player.id}`;
  }

  return playerName;
}

function getData(object, pluginName) {
  if (object === undefined) {
    return undefined;
  }


  if (object._pluginData[pluginName] === undefined) {
    object._pluginData[pluginName] = {};
  }

  return object._pluginData[pluginName];
}

/**
 * TODO documentation
 */
// TODO handle non-existent IDs
function getPlayer({ previousFunction }, playerId,
                   offlinePlayers = false) {

  let nativePlayer = previousFunction(playerId);
  const player = getPlayerById(playerId);

  return player === undefined || ((nativePlayer === null
      || !player.online) && !offlinePlayers) ? null :
      $.extend(nativePlayer || {}, player);
}

/**
 * TODO documentation
 */
function getPlayerById(playerId, defaultValue = undefined) {
  return playersById[playerId] || defaultValue;
}

/**
 * TODO documentation
 */
function getPlayerData(playerId, pluginName = `sav/players`) {
  const player = getPlayerById(playerId);

  return getData(player, pluginName);
}

/**
 * TODO documentation
 */
function getUserByAuth(auth) {
  return usersByAuth[auth];
}

/**
 * TODO documentation
 */
function getUserById(playerId) {
  return usersByAuth[idToAuth[playerId]];
}

/**
 * TODO documentation
 */
function getUserData(auth, pluginName = `sav/players`) {
  const user = usersByAuth[auth];

  return getData(user, pluginName);
}

/**
 * TODO documentation
 */
function hasPlayer(playerId) {
  return playersById[playerId] !== undefined;
}

/**
 * TODO documentation
 */
function getPlayerList({ previousFunction }, offlinePlayers = false) {

  const playersNative = previousFunction();

  return offlinePlayers ?
      Object.getOwnPropertyNames(idToAuth).map((id) =>
          room.getPlayer(id, true))
      : playersNative.map((p) => room.getPlayer(p.id));
}

/**
 * TODO documentation
 */
function kickPlayer({ previousFunction}, playerId, reason,
                    ban) {
  onPlayerLeaveHandler(room.getPlayer(playerId));

  return previousFunction(playerId, reason, ban);
}

/**
 * TODO documentation
 */
function setPlayerAdmin({ previousFunction }, playerId, admin) {
  getPlayerById(playerId, {}).admin = admin;

  return previousFunction(playerId, admin);
}

/**
 * TODO documentation
 */
function setPlayerTeam({ previousFunction }, playerId,
                       team) {

  getPlayerById(playerId, {}).team = team == 1 ? 1 : (team == 2 ? 2 : 0);

  previousFunction(playerId, team);
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function createPlayerInjectionPreEventHandlerHook(...argumentIndices) {
  if (argumentIndices.length === 0) argumentIndices = [0];
  return ({}, ...args) => {
    for (let index of argumentIndices) {
      // Sanity check
      if (typeof args[index] === `object` && args[index].hasOwnProperty(`id`)) {
        args[index] = room.getPlayer(args[index].id, true);
      }
    }

    return args;
  }
}

/**
 * TODO documentation
 */
function onPersistHandler() {
  return {
    usersByAuth,
    idToAuth,
    playersByConn,
    playersById,
  }
}

/**
 * TODO documentation
 */
function onPlayerJoinEventStateValidator({}, player) {
  return getPlayerById(player.id, {}).online === true;
}

/**
 * TODO documentation
 */
function onPlayerJoinPreEventHandlerHook({}, player) {
  if (player.auth === null) {
    room.kickPlayer(player.id, `Authentication failed, please use a Web `
        + `Crypto API compatible browser: `
        + `https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API#Browser_compatibility`, false);

    return false;
  }

  if (usersByAuth[player.auth] === undefined) {
    usersByAuth[player.auth] = createInitialUserdataObject();
  }

  // TODO keep team / admin over re-joins and automatically join the team if
  //  game not running

  playersById[player.id] = createInitialPlayerObject(player);

  const userData = getUserData(player.auth);
  userData.ids.add(player.id);
  userData.conns.add(player.conn);
  userData.names.add(player.originalName);
  userData.seen = new Date();
  userData.online = true;

  if (playersByConn[player.conn] === undefined) {
    playersByConn[player.conn] = new Set();
  }

  // TODO display warning / info when someone joins with the same conn?
  playersByConn[player.conn].add(player.id);

  idToAuth[player.id] = player.auth;
}

/**
 * TODO documentation
 */
function onPlayerLeaveHandler(playerNative) {
  const player = getPlayerById(playerNative.id);

  if (player === undefined) {
    return;
  }

  const userData = getUserData(idToAuth[playerNative.id]);
  userData.seen = new Date();
  userData.online = false;
  player.online = false;
}

function onPlayerAdminChangePreEventHandlerHook({}, player) {
  getPlayerById(player.id, {}).admin = player.admin;
}

/**
 * TODO documentation
 */
function onPlayerTeamChangePreEventHandlerHook({}, player) {
  getPlayerById(player.id, {}).team = player.team;
}

/**
 * TODO documentation
 *
 * TODO handle restored config
 */
function onRestoreHandler(data, pluginSpec) {
  if (data === undefined) return;

  $.extend(usersByAuth, data.usersByAuth);

  // Remove all references to previous ID
  Object.getOwnPropertyNames(usersByAuth)
      .forEach((auth) => getUserData(auth).ids.clear());
}

/**
 * TODO documentation
 */
function onRoomLinkHandler() {
  getPlayerNative = room.getPlayer;
  room.extend(`getPlayer`, getPlayer);
  room.extend(`getPlayerList`, getPlayerList);
  room.extend(`kickPlayer`, kickPlayer);
  room.extend(`setPlayerAdmin`, setPlayerAdmin);
  room.extend(`setPlayerTeam`, setPlayerTeam);

  room.addEventStateValidator(`onPlayerJoin`,
      onPlayerJoinEventStateValidator);

  room.addPreEventHandlerHook(`onPlayerAdminChange`,
      onPlayerAdminChangePreEventHandlerHook);
  room.addPreEventHandlerHook(`onPlayerJoin`,
      onPlayerJoinPreEventHandlerHook);
  room.addPreEventHandlerHook(`onPlayerTeamChange`,
      onPlayerTeamChangePreEventHandlerHook);

  // Inject our player objects
  room.addPreEventHandlerHook(
      [`onPlayerJoin`,`onPlayerLeave`,`onPlayerChat`, `onPlayerBallKick`,
        `onGameStart`, `onGameStop`, `onGamePause`, `onGameUnpause`,
        `onPlayerActivity`],
      createPlayerInjectionPreEventHandlerHook());
  room.addPreEventHandlerHook([`onPlayerAdminChange`, `onPlayerTeamChange`],
      createPlayerInjectionPreEventHandlerHook(0, 1));
  room.addPreEventHandlerHook(`onStadiumChange`,
      createPlayerInjectionPreEventHandlerHook(1));
  room.addPreEventHandlerHook(`onPlayerKicked`,
      createPlayerInjectionPreEventHandlerHook(0, 3));

  // Create authentication data entry for host
  // TODO solve cleaner
  // TODO handle players already in the room
  const hostPlayer = getPlayerNative(0);
  playersById[0] = createInitialPlayerObject(hostPlayer);
  usersByAuth[`HOST_AUTH`] = createInitialUserdataObject();
  const userData = getUserData(`HOST_AUTH`);
  userData.ids.add(0);
  userData.conns.add(`HOST_CONN`);
  userData.names.add(hostPlayer.name); // TODO make dynamic
  userData.seen = new Date();
  userData.online = true;
  playersByConn[`HOST_CONN`] = new Set().add(`HOST_AUTH`);
  idToAuth[0] = `HOST_AUTH`;
}

//
// Exports
//

room.buildPlayerPluginDataGetter = buildPlayerPluginDataGetter;
room.buildUserPluginDataGetter = buildUserPluginDataGetter;
room.getPlayerData = getPlayerData;
room.getUser = getUserById;
room.getUserData = getUserData;
room.hasPlayer = hasPlayer;

room.onPersist = onPersistHandler;
room.onPlayerLeave = onPlayerLeaveHandler;
room.onRestore = onRestoreHandler;
room.onRoomLink = onRoomLinkHandler;
