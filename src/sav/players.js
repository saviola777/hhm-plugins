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
 * Additionally, the plugin extends the following native API functions:
 *
 *  - getPlayer(playerId, { offlinePlayers = false }): returns a player object
 *    with the additional property _pluginData. Also
 *    supports retrieving player objects for players no longer in the room. auth
 *    and conn properties are always available.
 *  - getPlayerList({ offlinePlayers = false }): returns player objects including
 *    offline players if the parameter is set to true.
 *
 * Other exported functions:
 *
 *  - buildPlayerPluginDataGetter: factory for player plugin data getters
 *  - buildUserPluginDataGetter: factory for user plugin data getters
 *  - getPlayerData: returns player data for a given plugin
 *  - getUserById: returns a user object for a given auth, which contains the
 *    properties seen, conns, ids and names for the plugin sav/players.
 *  - getUserData: returns user data for a given plugin
 *  - hasPlayer: returns whether the player with the given ID exists (they don't
 *    have to be in the room though)
 *
 * Changelog:
 *
 * 1.3.2:
 *  - fix ghost kick which did not check player auth
 *  - add functions findMostRecentPlayerByAuth and getUserAuths
 *
 * 1.3.1:
 *  - fix buggy ghost kick which still used originalName property
 *  - move onPlayerLeave logic to pre-event handler hook
 *  - no longer extend kick function which was unreliable if the API tries to
 *    kick the host
 *  - fix null elements in getPlayerList()
 *  - add error messages in case of invalid parameters for the data getters
 *
 * 1.3.0:
 *  - add documentation
 *  - add ghost kick functionality which automatically kicks a player if
 *    another player with the same auth and nickname joins
 *  - remove feature where player IDs were added to the nickname
 *  - change buildUserPluginDataGetter API to allow auth/playerID selection
 *  - less pollution of the player object by moving the online property into
 *    the plugin data
 *  - export some useful functions like getPlayersByAuth, isUserOnline
 *  - change getPlayerList and getPlayer API to expect destructuring argument
 *  - add null check for player injection hook
 *  - players with invalid auth are now immediately kicked and do not trigger
 *    onPlayerJoin or onPlayerLeave
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
 * TODO config documentation
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/players`,
  author: `saviola`,
  version: `1.3.2`,
  config: {
    ghostKick: true,
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
 *
 * TODO turn into map
 */
const userDataByAuth = {};

/**
 * Maps player IDs to auth strings
 *
 * TODO turn into map
 */
const idToAuth = {};

/**
 * Maps connection strings to a set of associated auth strings
 *
 * TODO turn into map
 */
const playersByConn = {};

/**
 * Contains player data.
 *
 * TODO turn into map
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
    if (playerId === undefined) throw new Error(`playerId unexpectedly undefined`);
    return getPlayerData(playerId, pluginName);
  };
}

/**
 * Convenience function to create a user data getter for the given
 * plugin or namespace.
 */
function buildUserPluginDataGetter(pluginName, byPlayerId = false) {
  return byPlayerId ? (playerId) => {
        if (playerId === undefined) throw new Error(`playerId unexpectedly undefined`);
        return getUserData(idToAuth[playerId], pluginName);
      } :
      (auth) => {
        if (auth === undefined) throw new Error(`auth unexpectedly undefined`);
        return getUserData(auth, pluginName);
      };
}

/**
 * Checks if there are other players with the same name and auth already in the
 * room and kicks them.
 */
function checkGhosts(playerId) {
  const player = room.getPlayer(playerId);

  room.getPlayerList()
      .filter((p) => p.id < playerId && p.name === player.name
        && p.auth === player.auth)
      .forEach((p) => {
        room.setPlayerTeam(playerId, p.team);
        room.kickPlayer(p.id, `Ghost kick`)
  });
}

/**
 * TODO documentation
 */
function createInitialPlayerObject(player) {
  return {
    'auth': player.auth,
    'admin': player.admin,
    'conn': player.conn,
    'id': player.id,
    'name': player.name,
    'team': player.team,

    '_pluginData': {
      'sav/players': {
        'online': true,
      }
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
function findMostRecentPlayerByAuth(auth, { offlinePlayers = true }) {
  let players = getPlayersByAuth(auth, { offlinePlayers });

  if (players.length === 0) {
    return;
  }

  if (isUserOnline(auth)) {
    players = players.filter((p) => isPlayerOnline(p.id));
  }

  return players.slice(-1)[0];
}

/**
 * TODO documentation
 *
 * TODO is it okay to copy it?
 */
function getUserAuths({ offlineUsers = true }) {
  return Object.getOwnPropertyNames(userDataByAuth)
    .filter((auth) => offlineUsers || isUserOnline(auth));
}

/**
 * TODO documentation
 */
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
function getPlayer({ previousFunction }, playerId, { offlinePlayers = false } = {}) {
  let nativePlayer = previousFunction(playerId);
  const player = getPlayerById(playerId);

  return player === undefined || ((nativePlayer === null
      || !isPlayerOnline(playerId)) && !offlinePlayers) ? null :
      $.extend({ position: null }, nativePlayer || {}, player);
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
function getPlayersByAuth(auth, { offlinePlayers = false } = {}) {
  return playersById.filter((p) => p.auth === auth)
      .map((p) => room.getPlayer(p.id, { offlinePlayers }));
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
  return userDataByAuth[auth];
}

/**
 * TODO documentation
 */
function getUserByPlayerId(playerId) {
  return userDataByAuth[idToAuth[playerId]];
}

/**
 * TODO documentation
 */
function getUserData(auth, pluginName = `sav/players`) {
  const user = userDataByAuth[auth];

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
function isPlayerOnline(playerId) {
  return getPlayerData(playerId).online;
}

/**
 * TODO documentation
 */
function isUserOnline(auth) {
  return Array.from(getUserData(auth).ids.values())
      .filter((id) => isPlayerOnline(id)).length > 0;
}

/**
 * TODO documentation
 */
function getPlayerList({ previousFunction }, { offlinePlayers = false } = {}) {
  const playersNative = previousFunction();

  return offlinePlayers ?
      Object.getOwnPropertyNames(idToAuth).map((id) =>
          room.getPlayer(id, { offlinePlayers: true }))
      : playersNative.map((p) => room.getPlayer(p.id))
        .filter((p) => p !== null);
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
      if (typeof args[index] === `object` && args[index] !== null
          && args[index].hasOwnProperty(`id`) && hasPlayer(args[index].id)) {
        args[index] = room.getPlayer(args[index].id, { offlinePlayers: true });
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
    usersByAuth: userDataByAuth,
    idToAuth,
    playersByConn,
    playersById,
  }
}

/**
 * TODO documentation
 */
function onPlayerJoinEventStateValidator({}, player) {
  return hasPlayer(player.id) && isPlayerOnline(player.id);
}

/**
 * TODO documentation
 */
function onPlayerLeaveEventStateValidator({}, player) {
  return hasPlayer(player.id);
}

/**
 * TODO documentation
 */
function onPlayerJoinPreEventHandlerHook({}, player) {

  if (player.auth === null) {
    room.kickPlayer(player.id,
        `Authentication failed, please use a Web `
        + `Crypto API compatible browser and / or clear your LocalStorage`,
        false);

    return false;
  }

  if (userDataByAuth[player.auth] === undefined) {
    userDataByAuth[player.auth] = createInitialUserdataObject();
  }

  // TODO keep team / admin over re-joins and automatically join the team if
  //  game not running

  playersById[player.id] = createInitialPlayerObject(player);

  const userData = getUserData(player.auth);
  userData.ids.add(player.id);
  userData.conns.add(player.conn);
  userData.names.add(player.name);
  userData.seen = new Date();

  if (playersByConn[player.conn] === undefined) {
    playersByConn[player.conn] = new Set();
  }

  // TODO display warning / info when someone joins with the same conn?
  playersByConn[player.conn].add(player.id);

  idToAuth[player.id] = player.auth;

  if (room.getConfig(`ghostKick`) === true) {
    checkGhosts(player.id);
  }
}

/**
 * TODO documentation
 */
function onPlayerLeavePreEventHandlerHook({}, player) {
  if (player === null) {
    room.log(`Player object is null in onPlayerLeaveHandler, this should `
        + `not have happened`, HHM.log.level.WARN);
    return false;
  }

  const userData = getUserData(idToAuth[player.id]);
  userData.seen = new Date();

  const playerData = getPlayerData(player.id);
  playerData.online = false;
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

  $.extend(userDataByAuth, data.usersByAuth);

  // Remove all references to previous ID
  Object.getOwnPropertyNames(userDataByAuth)
      .forEach((auth) => getUserData(auth).ids.clear());
}

/**
 * TODO documentation
 */
function onRoomLinkHandler() {
  getPlayerNative = room.getPlayer;
  room.extend(`getPlayer`, getPlayer);
  room.extend(`getPlayerList`, getPlayerList);
  room.extend(`setPlayerAdmin`, setPlayerAdmin);
  room.extend(`setPlayerTeam`, setPlayerTeam);

  room.addEventStateValidator(`onPlayerJoin`,
      onPlayerJoinEventStateValidator);
  room.addEventStateValidator(`onPlayerLeave`,
      onPlayerLeaveEventStateValidator);

  room.addPreEventHandlerHook(`onPlayerAdminChange`,
      onPlayerAdminChangePreEventHandlerHook);
  room.addPreEventHandlerHook(`onPlayerJoin`,
      onPlayerJoinPreEventHandlerHook);
  room.addPreEventHandlerHook(`onPlayerLeave`,
      onPlayerLeavePreEventHandlerHook);
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
  hostPlayer.auth = `HOST_AUTH`;
  hostPlayer.conn = `HOST_CONN`;
  playersById[0] = createInitialPlayerObject(hostPlayer);
  userDataByAuth[hostPlayer.auth] = createInitialUserdataObject();
  const userData = getUserData(hostPlayer.auth);
  userData.ids.add(0);
  userData.conns.add(hostPlayer.conn);
  userData.names.add(hostPlayer.name); // TODO make dynamic
  userData.seen = new Date();
  playersByConn[hostPlayer.conn] = new Set().add(hostPlayer.auth);
  idToAuth[0] = hostPlayer.auth;
}

//
// Exports
//

room.buildPlayerPluginDataGetter = buildPlayerPluginDataGetter;
room.buildUserPluginDataGetter = buildUserPluginDataGetter;
room.findMostRecentPlayerByAuth = findMostRecentPlayerByAuth;
room.getPlayerData = getPlayerData;
room.getPlayersByAuth = getPlayersByAuth;
room.getUserByPlayerId = getUserByPlayerId;
room.getUserByAuth = getUserByAuth;
room.getUserData = getUserData;
room.getUserAuths = getUserAuths;
room.hasPlayer = hasPlayer;
room.isPlayerOnline = isPlayerOnline;
room.isUserOnline = isUserOnline;

room.onPersist = onPersistHandler;
room.onRestore = onRestoreHandler;
room.onRoomLink = onRoomLinkHandler;
