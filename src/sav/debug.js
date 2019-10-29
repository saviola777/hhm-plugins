/**
 * Debugging plugin which subscribes to all HHM events and prints event
 * information to console.
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/debug`,
  author: `saviola`,
  version: `1.0.0`,
};

//
// Global variables
//

//
// Event handlers
//

function onHhmEventHandler(args) {
  if (args.plugin) {
    args.plugin = args.plugin.getName();
  }

  console.log(args);
}

//
// Exports
//

room.onHhm = onHhmEventHandler;