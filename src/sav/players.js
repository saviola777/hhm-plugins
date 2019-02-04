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
  version: `1.2.0`,
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

//
// Plugin functions
//

/**
 * Convenience function to  create namespace getter for the given namespace.
 */
function buildNamespaceGetter(namespace) {
  return (playerId) => {
    return room.getPlayer(playerId, true).getNamespace(namespace);
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

    '_namespaces': {
    },

    'getNamespace': function(namespace = `_`) {
      if (this._namespaces[namespace] === undefined) {
        this._namespaces[namespace] = {};
      }

      return this._namespaces[namespace];
    },

    'getUser': function() {
      return usersByAuth[idToAuth[player.id]];
    }
  };
}

/**
 * TODO documentation
 */
function createInitialUserdataObject() {
  return {
    '_namespaces': {
      '_': {
        'seen': new Date(),
        'conns': new Set(),
        'ids': new Set(),
        'names': new Set(),
      },
    },

    'getNamespace': function(namespace = `_`) {
      if (this._namespaces[namespace] === undefined) {
        this._namespaces[namespace] = {};
      }

      return this._namespaces[namespace];
    },
  };
}

/**
 * TODO documentation
 */
function createPlayerName(player) {
  const nameLength = room.getPluginConfig().maxPlayerNameLength;
  let playerName = player.name;
  if (room.getPluginConfig().maxPlayerNameLength > 0) {
    playerName = playerName.length <= nameLength ? playerName
        : playerName.substr(0, nameLength - 1) + '…';
  }

  if (room.getPluginConfig().addPlayerIdToNickname) {
    playerName += `#${player.id}`;
  }

  return playerName;
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
function onRoomLinkHandler() {
  // Create authentication data entry for host
  // TODO solve cleaner
  // TODO handle players already in the room
  hostPlayer = room.getPlayer(0);
  playersById[0] = createInitialPlayerObject(hostPlayer);
  usersByAuth[`HOST_AUTH`] = createInitialUserdataObject();
  const ns = usersByAuth[`HOST_AUTH`].getNamespace();
  ns.ids.add(0);
  ns.conns.add(`HOST_CONN`);
  ns.names.add(room.getPlayer(0).name); // TODO make dynamic
  ns.seen = new Date();
  ns.online = true;
  playersByConn[`HOST_CONN`] = new Set().add(`HOST_AUTH`);
  idToAuth[0] = `HOST_AUTH`;

  room.extend(`getPlayer`, getPlayer);
  room.extend(`getPlayerList`, getPlayerList);
  room.extend(`kickPlayer`, kickPlayer);
  room.extend(`setPlayerTeam`, setPlayerTeam);

  room.addEventStateValidator(`onPlayerJoin`,
      onPlayerJoinEventStateValidator);

  room.addPreEventHandlerHook(`onPlayerTeamChange`,
      onPlayerTeamChangePreEventHandlerHook);
  room.addPreEventHandlerHook(`onPlayerAdminChange`,
      onPlayerAdminChangePreEventHandlerHook);
  room.addPreEventHandlerHook(`onPlayerJoin`,
      onPlayerJoinPreEventHandlerHook);
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

  const ns = usersByAuth[player.auth].getNamespace();
  ns.ids.add(player.id);
  ns.conns.add(player.conn);
  ns.names.add(player.originalName);
  ns.seen = new Date();
  ns.online = true;

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

  const ns = usersByAuth[idToAuth[playerNative.id]].getNamespace();
  ns.seen = new Date();
  ns.online = false;
  player.online = false;
}

function onPlayerAdminChangePreEventHandlerHook({}, player) {
  getPlayerById(player.id, {}).admin = player.admin;
}

/**
 * TODO documentation
 */
function onPlayerTeamChangePreEventHandlerHook({}, player) {
  usersByAuth[idToAuth[player.id]].team = player.team;
}

//
// Exports
//

room.buildNamespaceGetter = buildNamespaceGetter;

room.onRoomLink = onRoomLinkHandler;
room.onPlayerLeave = onPlayerLeaveHandler;
