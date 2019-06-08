/**
 * Help plugin, provides basic help support for available commands.
 *
 * Provided helpers:
 *
 * - `registerHelp`: Registers a help text for the given command, the command
 *  can be passed as 'cmd subcmd' or 'cmd_subcmd'. The help text will always
 *  start with 'Usage: !cmd subcmd', after that the given help text will be
 *  inserted.
 *
 * Example:
 *
 * room.getPlugin(`sav/help`).registerHelp(`auth`, ` ROLE PASSWORD.`);
 *
 * Which will result in the output `Usage: !auth ROLE PASSWORD.` when typing
 * `!help auth`. You can specify an array of roles for which to display the
 * help as the third parameter.
 *
 * To display help programmatically, you can use
 *
 * room.getPlugin(`sav/help`).displayHelp(playerId, `auth`);
 *
 * for this example.
 *
 * Changelog:
 *
 * 1.1.0:
 *  - `!help` command now excludes commands known to be unavailable to the
 *    calling player based on their roles (if the roles plugin is loaded)
 *  - `!help` command now also lists sub-commands
 *  - `registerHelp()` now accepts `roles` and `numArgs` parameters
 *
 * 1.0.2:
 *  - adjust to HHM 0.9.1
 *
 * 1.0.1:
 *  - add programmatic way to display help texts using displayHelp().
 *
 * 1.0.0:
 *  - initial version
 *
 *
 *  TODO Display help when calling command without parameters
 *  TODO Display sub-commands when calling help for main command without help
 */
var room = HBInit();

room.pluginSpec = {
  name: `sav/help`,
  author: `saviola`,
  version: `1.1.0`,
  dependencies: [
    `sav/commands`
  ],
};

const commandHelpInfo = {};

//
// Plugin functions
//

/**
 * TODO documentation
 */
function createCommandList(playerId) {
  const rolesPlugin = room.getPlugin(`sav/roles`) ||
      { hasPlayerRole : () => true };

  return [...new Set(room.getPluginManager().getHandlerNames()
      .filter((h) => h.startsWith(`onCommand`))
      .filter((h) => {
        return !h.startsWith(`onCommand_help_`) &&
            (commandHelpInfo[h] === undefined
            || commandHelpInfo[h].roles.length === 0
            || commandHelpInfo[h].roles.some((r) =>
                rolesPlugin.hasPlayerRole(playerId, r)))})
      .map((h) => h.split(`_`).slice(1).join(` `) || ``)
      .filter((h) => h.length > 0))
  ];
}

/**
 * Programmatically display help for the given command and to the given player.
 */
function displayHelp(playerId, command) {
  command = prepareCommand(command);
  const handlerName = `onCommand_help_${command}`;

  if (room[handlerName] !== undefined) {
    room[handlerName](playerId);
  }
}

/**
 * TODO documentation
 */
function getCommandPrefix() {
  return room.getPlugin(`sav/commands`).getConfig().commandPrefix;
}

/**
 * TODO documentation
 */
function getPluginNamesForCommand(commandParts) {
  const manager = room.getPluginManager();

  const handlerNames = manager.getHandlerNames()
      .filter(h => h.startsWith(`onCommand_`));

  let commandHandlerNames = [];
  for (let i = commandParts.length; i > 0; i--) {
    commandHandlerNames = handlerNames.filter(
        h => h.split(`_`, 2)[1].startsWith(commandParts.slice(0, i).join(`_`)));

    if (commandHandlerNames.length > 0) {
      break;
    }
  }

  return manager.getEnabledPluginIds()
      .filter(id => manager.getPluginById(id).getHandlerNames()
      .filter(h => commandHandlerNames.indexOf(h) !== -1).length > 0)
      .map(id => manager.getPluginName(id));
}

function prepareCommand(command) {
  if (command.includes(` `)) {
    command = command.split(` `).join(`_`);
  }

  return command;
}

/**
 * Helper function to register a help text for the given command.
 */
function registerHelp(command, helpText, { numArgs = "", roles = [] } = {}) {
  command = prepareCommand(command);

  helpText = `Usage: ${getCommandPrefix()}`
      + `${command.split(`_`).join(` `)}${helpText}`;

  commandHelpInfo[`onCommand${numArgs}_${command}`] = {
    helpText,
    numArgs,
    roles,
  };

  room[`onCommand_help_${command}`] = (player) => room.sendChat(helpText, player.id);

  return room;
}

//
// Event handlers
//

/**
 * General help command, which lists all available commands.
 */
function onCommandHelp0Handler(player) {
  room.sendChat(`List of available commands, type ${getCommandPrefix()}help `
    + `command to get help for a specific command:`, player.id);
  room.sendChat(createCommandList(player.id).join(`, `), player.id);
}

/**
 * Catch-all help function which gets called if no specific help was registered
 * for a given help command.
 */
function onCommandHelpHandler(player, arguments) {
  if (arguments.length === 0) return;

  const manager = room.getPluginManager();

  const handlerNames = manager.getHandlerNames()
      .filter(h => h.endsWith(arguments.join(`_`)));

  const pluginNames = getPluginNamesForCommand(arguments);

  if (pluginNames.length === 0) {
    room.sendChat(`No help available for the given topic, is the plugin loaded `
        + `and enabled?`, player.id, HHM.log.ERROR);
    return;
  }

  room.sendChat(`No help available for this command, it is handled by the `
      + `following plugin(s): ${pluginNames.join(`, `)}`, player.id);
}

//
// Exports
//

room.displayHelp = displayHelp;
room.registerHelp = registerHelp;

room.onCommand0_help = onCommandHelp0Handler;
room.onCommand_help = onCommandHelpHandler;
