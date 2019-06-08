/**
 * Meta plugin for loading a set of basic plugins.
 *
 * Changelog:
 *
 * 1.2.1:
 *  - add sav/game-state
 *
 * 1.2.0:
 *  - add sav/chat to core
 *
 * 1.1.0:
 *  - add sav/players to core
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/core`,
  author: `saviola`,
  version: `1.2.1`,
  dependencies: [
    `sav/chat`,
    `sav/commands`,
    `sav/cron`,
    `sav/game-state`,
    `sav/help`,
    `sav/players`,
    `sav/players-helper`,
    `sav/roles`,
  ],
};