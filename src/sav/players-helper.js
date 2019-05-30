/**
 * Helper script for player information and management.
 *
 * TODO merge into players plugin?
 *
 * Changelog:
 *
 * 1.0.0:
 *  - provides getPlayerListByTeam() function for convenient access to
 *    team-based player lists
 */
var room = HBInit();

room.pluginSpec = {
  name: `sav/players-helper`,
  author: `saviola`,
  version: `1.0.0`,
};

//
// Plugin functions
//

/**
 * Returns arrays of players by team.
 *
 * If a team is specified, an array of players on that team is returned,
 * otherwise an array of three arrays with players for each team is returned.
 *
 * @param team int one of 0 (spectator), 1 (red), 2 (blue)
 */
function getPlayerListByTeam(team) {
  const players = room.getPlayerList();

  const results = [[], [], []];

  players.forEach(p => results[p.team].push(p));

  return typeof team === `number` ? results[team] : results;
}

//
// Exports
//

room.getPlayerListByTeam = getPlayerListByTeam;