/**
 * This plugin enforces one nickname per auth and conn.
 *
 * Once a user has joined with a nickname, they will be kicked when joining with
 * another nickname later unless they change both their auth and IP.
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/force-same-name`,
  author: `saviola`,
  version: `1.0.0`,
};

//
// Global variables
//

// Maps auth -> nick
const auths = {};
// Maps conn -> nick
const conns = {};

//
// Event handlers
//


/**
 * Kicks a player if someone with the same auth or conn has joined with a
 * different name before.
 *
 * Stores a mapping between player auth/conn and nick otherwise.
 */
function onPlayerJoinHandler(player) {
  const oldName = auths[player.auth] !== undefined ? auths[player.auth] :
      conns[player.conn] !== undefined ? conns[player.conn] : player.name;

  if (oldName !== player.name) {
    room.kickPlayer(player.id,
        `Please re-join with your original nick ${oldName}`);

    return false;
  }

  auths[player.auth] = player.name;
  conns[player.conn] = player.name;
}

function onPersistHandler() {
  return { auths, conns };
}

function onRestoreHandler(data) {
  if (data === undefined) return;

  Object.assign(auths, data.auths || {});
  Object.assign(conns, data.conns || {});
}

//
// Exports
//

room.onPlayerJoin = onPlayerJoinHandler;
room.onPersist = onPersistHandler;
room.onRestore = onRestoreHandler;