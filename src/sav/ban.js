/**
 * Provides an improved persistent ban system based on auth and conn which
 * works across room restarts.
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/ban`,
  author: `saviola`,
  version: `1.0.0`,
  dependencies: [
    `hhm/persistence`,
  ],
};

//
// Global variables
//

const bannedAuths = new Map();
const bannedConns = new Set();

const recentlyClearedBans = new Set();


//
// Plugin functions
//


function clearBan({ previousFunction }, playerId) {
  let auth = (room.getPlayer(playerId, { offlinePlayers: true }) || {}).auth;
  if (auth !== undefined) {
    bannedAuths.get(auth).forEach((conn) => {
      bannedConns.delete(conn);
    })
    bannedAuths.delete(auth)
    recentlyClearedBans.add(auth);
  }
  previousFunction(playerId);
}

function clearBans({ previousFunction }) {
  Array.from(bannedAuths.keys()).forEach(
      (auth) => recentlyClearedBans.add(auth));

  bannedAuths.clear();
  bannedConns.clear();

  previousFunction();
}

//
// Event handlers
//

function onPersistHandler() {
  return {
    bannedAuths: Object.fromEntries(bannedAuths),
    bannedConns: Object.fromEntries(bannedConns)
  };
}

/**
 * Bans the player if their auth / conn among the banned auths / conns.
 */
function onPlayerJoinHandler(player) {
  if (bannedAuths.has(player.auth) || bannedConns.has(player.conn)) {
    bannedConns.add(player.conn);
    bannedAuths.set(player.auth,
        [...new Set([player.conn, ...(bannedAuths.get(player.auth) || [])])]);
    room.kickPlayer(player.id, "ban by sav/ban", true);
  }
}

function onPlayerKickedHandler(kickedPlayer, reason, ban, byPlayer) {
  const banRecentlyCleared = recentlyClearedBans.has(kickedPlayer.auth);
  recentlyClearedBans.clear();

  if (bannedAuths.has(kickedPlayer.auth) || banRecentlyCleared) return;

  if (ban) {
    bannedAuths.set(kickedPlayer.auth, [kickedPlayer.conn]);
  }
}

function onRestoreHandler(data) {
  if (data === undefined) return;

  room.getPlugin(`hhm/persistence`).restoreMap(data.bannedAuths, bannedAuths);
  room.getPlugin(`hhm/persistence`).restoreMap(data.bannedConns, bannedConns);
}

function onRoomLinkHandler() {
  room.extend(`clearBan`, clearBan);
  room.extend(`clearBans`, clearBans);
}

function onTestHandler(actor) {
  const player = actor.addPlayer("test");
  room.kickPlayer(player.id, "sav/ban test", true);

  let playerSameAuth = actor.addPlayer("testSameAuth", { auth: player.auth});
  actor.assertEquals(null, room.getPlayer(playerSameAuth.id),
      "Player with banned auth should have been banned");

  room.clearBan(player.id);

  playerSameAuth = actor.addPlayer("testSameAuth", { auth: player.auth});
  actor.assertNotEquals(null, room.getPlayer(playerSameAuth.id),
      "Player should not have been banned after clearBan()");

  room.kickPlayer(playerSameAuth.id, "sav/ban test2", true);

  room.clearBans();

  playerSameAuth = actor.addPlayer("testSameAuth", { auth: player.auth});
  actor.assertNotEquals(null, room.getPlayer(playerSameAuth.id),
      "Player should not have been banned after clearBans()");

  let playerBannedPreviously = actor.addPlayer("testBannedPreviously");
  actor.removePlayer(playerBannedPreviously.id);

  // Simulate ban from previous room start
  bannedAuths.set(playerBannedPreviously.auth, [playerBannedPreviously.conn])
  bannedConns.add(playerBannedPreviously.conn);

  let playerBannedPreviouslyAuth = actor.addPlayer("testBannedPreviouslyAuth",
      { auth: playerBannedPreviously.auth });
  actor.assertEquals(null, room.getPlayer(playerBannedPreviouslyAuth.id),
      "Player with previously banned auth should have been banned");

  let playerBannedPreviouslyConn = actor.addPlayer("testBannedPreviouslyConn",
      { conn: playerBannedPreviously.conn });
  actor.assertEquals(null, room.getPlayer(playerBannedPreviouslyConn.id),
      "Player with previously banned conn should have been banned");

  room.clearBans();

  playerBannedPreviouslyAuth = actor.addPlayer("testBannedPreviouslyAuth",
      { auth: playerBannedPreviously.auth });
  actor.assertNotEquals(null, room.getPlayer(playerBannedPreviouslyAuth.id),
      "Player with previously banned auth should not have been banned after clearBans()");

  playerBannedPreviouslyConn = actor.addPlayer("testBannedPreviouslyConn",
      { conn: playerBannedPreviously.conn });
  actor.assertNotEquals(null, room.getPlayer(playerBannedPreviouslyConn.id),
      "Player with previously banned conn should not have been banned after clearBans()");
}

//
// Exports
//

room.onPlayerJoin = onPlayerJoinHandler;
room.onPlayerKicked = onPlayerKickedHandler;
room.onPersist = onPersistHandler;
room.onRestore = onRestoreHandler;
room.onRoomLink = onRoomLinkHandler;
room.onTest = onTestHandler;