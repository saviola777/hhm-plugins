/**
 * Meta plugin for loading a set of basic plugins.
 */

const room = HBInit();

room.pluginSpec = {
  name: `sav/core`,
  author: `saviola`,
  version: `1.0.0`,
  dependencies: [
    `sav/commands`,
    `sav/cron`,
    `sav/help`,
    `sav/players-helper`,
    `sav/roles`,
  ],
};