/**
 * Help plugin, provides basic help support for available commands.
 *
 * To register help, use an object handler, supported properties are
 *
 * - text: the help text
 * - roles: array of roles which are allowed to see the help for this command
 *
 * Example:
 *
 * room.onCommand_auth = {
 *   function: () => { // handler code here
 *
 *   },
 *   data: {
 *    'sav/help': {
 *      text: ` ROLE PASSWORD`,
 *      roles: ['user'] // just an example, only players with this role see help
 *    }
 *   }
 * }
 *
 * Which will result in the output:
 *
 * [PM] Help:
 * from sav/roles: !auth ROLE PASSWORD
 *
 * To display help programmatically, you can use
 *
 * room.getPlugin(`sav/help`).displayHelp(playerId, `auth`);
 *
 * for this example.
 *
 * Changelog:
 *
 * 2.0.0:
 *  - support object handlers and pick up help text that way by default
 *  - fix problem with roles property where help was incorrectly hidden when
 *    specifying several roles
 *  - remove programmatic help specification
 *
 * 1.1.1:
 *  - switch to sendAnnouncement
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
 * TODO Display help when calling command without parameters
 * TODO Display sub-commands when calling help for main command without help
 *
 */
var room = HBInit();

room.pluginSpec = {
  name: `sav/help`,
  author: `saviola`,
  version: `2.0.0`,
  dependencies: [
    `sav/commands`,
  ],
};

const commandHelpInfo = new Map();

//
// Plugin functions
//

function canPlayerUseCommand(playerId, handlerName, rolesPlugin) {
  if (!commandHelpInfo.has(handlerName)) {
    return true;
  }

  const helpInfos = Array.from(commandHelpInfo.get(handlerName).values())
      .flat();

  return helpInfos.some((helpInfo) => helpInfo.roles.length === 0
      || helpInfo.roles.some((r) => rolesPlugin.hasPlayerRole(playerId, r)));
}

/**
 * TODO documentation
 */
function createCommandList(playerId) {
  const rolesPlugin = getRolesPlugin();

  return [...new Set(room.getPluginManager()
        .getHandlerNames()
        .filter((h) => h.startsWith(`onCommand`))
        .filter((h) => !h.startsWith(`onCommand_help_`) &&
            canPlayerUseCommand(playerId, h, rolesPlugin))
        .map((h) => h.split(`_`).slice(1).join(` `))
        .filter((h) => h.length > 0)),
  ];
}

/**
 * Programmatically display help for the given command and to the given player.
 */
function displayHelp(playerId, command) {

  return onCommandHelpHandler(room.getPlayer(playerId), command.split(` `));
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
      .filter(h => h.startsWith(`onCommand`));

  let commandHandlerNames = [];
  for (let i = commandParts.length; i > 0; i--) {
    commandHandlerNames = handlerNames.filter(
        h => h.split(`_`, 2)[1].startsWith(commandParts.slice(0, i).join(`_`)));

    if (commandHandlerNames.length > 0) {
      break;
    }
  }

  return manager.getEnabledPluginIds()
      .filter(id => manager.getPlugin(id).getHandlerNames()
      .filter(h => commandHandlerNames.includes(h)).length > 0)
      .map(id => manager.getPluginName(id));
}

function getRolesPlugin() {
  return room.getPlugin(`sav/roles`) || {hasPlayerRole: () => true};
}

function findHelpForCommand(commandParts = []) {
  const manager = room.getPluginManager();

  let handlerNames = [];

  commandParts = commandParts.slice();
  commandParts.push('');

  do {
    commandParts = commandParts.slice(0, -1);

    const handlerNameRegExp = new RegExp('^onCommand(\\d+)?_'
        + commandParts.join(`_`) + `_?(.*)?$`);

    handlerNames = manager.getHandlerNames()
        .map((h) => handlerNameRegExp.exec(h))
        .filter((h) => h !== null && commandHelpInfo.has(h[0])
            && Array.from(commandHelpInfo.get(h[0]).values())
            .flat().length > 0);

  } while (handlerNames.length === 0 && commandParts.length > 1);

  return handlerNames;
}

function findSubCommandsForCommand(commandParts = [], playerId) {
  const rolesPlugin = getRolesPlugin();

  const handlerNameRegExp = new RegExp('^onCommand(\\d+)?_'
      + commandParts.join(`_`) + `_(.*)$`);

  return room.getPluginManager().getHandlerNames()
      .map(h => handlerNameRegExp.exec(h))
      .filter((h) => h !== null
        && canPlayerUseCommand(playerId, h[0], rolesPlugin))
      .map((h) => h[2].replace(`_`, ` `));
}

function prepareCommand(command) {
  if (command.includes(` `)) {
    command = command.split(` `).join(`_`);
  }

  return command;
}

//
// Event handlers
//

/**
 * General help command, which lists all available commands.
 */
function onCommandHelp0Handler(player) {
  room.sendAnnouncement(`List of available commands, type `
      + `${getCommandPrefix()}help COMMAND to get help for a specific command:\n`
      + createCommandList(player.id).join(`, `),
      player.id);
}

function onCommandHelpHandler(player, commandParts = []) {
  if (commandParts.length === 0) return;

  // regular expression output:
  //  0 - full handler name
  //  1 - numArgs
  //  2 - sub-command
  const handlerInfos = findHelpForCommand(commandParts);

  const rolesPlugin = getRolesPlugin();

  let helpText = ``;

  // Collect commands (no sub-commands)
  handlerInfos.filter((handlerInfo) => handlerInfo[2] === undefined)
      .forEach((handlerInfo) => {

    Array.from(commandHelpInfo.get(handlerInfo[0]).entries())
        .forEach(([pluginId, helpInfos]) => {

      if (helpInfos.length === 0) return;

      helpInfos.forEach((helpInfo) => {
        if (helpInfo.roles !== undefined && helpInfo.roles.length > 0
            && !helpInfo.roles.some((role) => rolesPlugin.hasPlayerRole(
                player.id, role))) {

          return;
        }

        helpText += `${getCommandPrefix()}${commandParts.join(` `)}`
            + helpInfo.text + `\n` + (pluginId >= 0 ?
            `(${room.getPluginManager().getPluginName(pluginId)})` : ``);
      });
    });
  });

  // Sub-commands
  let subCommands = findSubCommandsForCommand(commandParts, player.id)
      .join(`, `);

  if (helpText !== `` || subCommands !== ``) {
    helpText = helpText !== `` ? `Help:\n${helpText}` : `No help available`;
    subCommands = subCommands !== `` ? `\nSub-commands:\n${subCommands}` : ``;
    return room.sendAnnouncement(`${helpText}${subCommands}`, player.id);
  }

  const pluginNames = getPluginNamesForCommand(commandParts);

  if (pluginNames.length === 0) {
    room.sendAnnouncement(`No help available for the given command, is the `
        + `plugin loaded and enabled?`, player.id);
    return;
  }

  room.sendAnnouncement(`No help available for this command or you have no `
      + `permission to execute it, it is handled by `
      + `the following plugin(s):\n${pluginNames.join(`, `)}`, player.id);
}

function onHhmEventHandlerSetHandler({ handler }) {
  if (!handler.meta.name.startsWith(`onCommand`)
      || handler.data[`sav/help`] === undefined) return;

  const helpData = (typeof handler.data[`sav/help`] !== `object`
  || handler.data[`sav/help`].constructor !== Array
      ? [handler.data[`sav/help`]] : handler.data[`sav/help`])
      .map((h) => $.extend({roles: []}, h));

  if (!commandHelpInfo.has(handler.meta.name)) {
    commandHelpInfo.set(handler.meta.name, new Map());
  }

  if (!commandHelpInfo.get(handler.meta.name).has(handler.meta.plugin.getId())) {
    commandHelpInfo.get(handler.meta.name).set(handler.meta.plugin.getId(), []);
  }

  commandHelpInfo.get(handler.meta.name).get(handler.meta.plugin.getId())
      .push(...helpData);
}

//
// Exports
//

room.displayHelp = displayHelp;
room.registerHelp = () => {
  room.log(`registerHelp has been removed, please use object handlers`,
    HHM.log.level.WARN);
}

room.onCommand0_help = onCommandHelp0Handler;
room.onCommand_help = onCommandHelpHandler;
room.onHhm_eventHandlerSet = onHhmEventHandlerSetHandler;
