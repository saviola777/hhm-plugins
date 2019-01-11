/**
 * Player management plugin.
 *
 * TODO persistence
 * TODO documentation
 * TODO config documentation
 *
 * Changelog:
 *
 * 1.0.0:
 *  - keeps track of player information by auth
 *  - extends getPlayer() and getPlayerList() functions
 *  - allows access to users not in the room
 *  - fully backwards compatible
 */

const room = HBInit();

room.pluginSpec = {
  name: `sav/players`,
  author: `saviola`,
  version: `1.0.0`,
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
 */
const playersByAuth = {};

/**
 * Maps player IDs to auth strings
 */
const idToAuth = {};

/**
 * Maps connection strings to a set of associated auth strings
 */
const playersByConn = {};

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
function createInitialPlayerObject() {
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

    'getLastSeen': function() {
      return this.getNamespace().seen;
    },

    'isOnline': function() {
      return this.getNamespace().online;
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
function getPlayerById({ previousFunction: getPlayerNative }, id,
                       offlinePlayers = false) {

  let nativePlayer = getPlayerNative(id);

  return idToAuth[id] === undefined
      || (nativePlayer === null && !offlinePlayers) ? null :
      $.extend(nativePlayer || {}, playersByAuth[idToAuth[id]]);
}

/**
 * TODO documentation
 */
function getPlayerList({ previousFunction: getPlayerListNative },
                       offlinePlayers = false) {

  const playersNative = getPlayerListNative();

  return offlinePlayers ?
      Object.getOwnPropertyNames(idToAuth).map((id) =>
          room.getPlayer(id, true))
      : playersNative.map((p) => room.getPlayer(p.id));
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onLoadHandler() {
  // Create authentication data entry for host
  // TODO solve cleaner
  playersByAuth[`HOST_AUTH`] = createInitialPlayerObject();
  const ns = playersByAuth[`HOST_AUTH`].getNamespace();
  ns.ids.add(0);
  ns.conns.add(`HOST_CONN`);
  ns.names.add(room.getPlayer(0).name); // TODO make dynamic
  ns.seen = new Date();
  ns.online = true;
  playersByConn[`HOST_CONN`]= new Set().add(`HOST_AUTH`);
  idToAuth[0] = `HOST_AUTH`;

  room.extend(`getPlayer`, getPlayerById);
  room.extend(`getPlayerList`, getPlayerList);
}

/**
 * TODO this has to be run before other handlers, implement as hook?
 */
function onPlayerJoinHandler(player) {
  if (player.auth === null) {
    room.kickPlayer(player.id, `Authentication failed, please use a Web `
        + `Crypto API compatible browser: `
        + `https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API#Browser_compatibility`, false);

    return false;
  }

  if (playersByAuth[player.auth] === undefined) {
    playersByAuth[player.auth] = createInitialPlayerObject();
  } else {
    delete playersByAuth[player.auth].id;
  }

  playersByAuth[player.auth].name = createPlayerName(player);
  playersByAuth[player.auth].originalName = player.name;

  const ns = playersByAuth[player.auth].getNamespace();
  ns.ids.add(player.id);
  ns.conns.add(player.conn);
  ns.names.add(player.name);
  ns.seen = new Date();
  ns.online = true;

  if (playersByConn[player.conn] === undefined) {
    playersByConn[player.conn] = new Set();
  }

  // TODO display warning / info when someone joins with the same conn?
  playersByConn[player.conn].add(player.auth);

  idToAuth[player.id] = player.auth;
}

/**
 * TODO documentation
 */
function onPlayerLeaveHandler(player) {
  if (playersByAuth[player.auth] === undefined) {
    return;
  }

  const ns = playersByAuth[player.auth].getNamespace();
  ns.seen = new Date();
  ns.online = false;
  playersByAuth[player.auth].id = player.id;
  playersByAuth[player.auth].name = player.name;
}

//
// Exports
//

room.buildNamespaceGetter = buildNamespaceGetter;

room.onLoad = onLoadHandler;
room.onPlayerJoin = onPlayerJoinHandler;
room.onPlayerLeave = onPlayerLeaveHandler;
