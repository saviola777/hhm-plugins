/**
 * Commands plugin, which allows convenient processing of commands.
 *
 * To make command processing easier, this plugin automatically parses commands
 * and triggers the corresponding events.
 *
 * To receive events for a specific command, you have to add an event handler
 * for the command itself, e.g. onCommand_help, which will be triggered every
 * time the help command is used, or the command and number of arguments, e.g.
 * onCommand0_help, which will only be called when help is used without further
 * arguments. Sub-commands are available by chaining further words divided by
 * underscored, i.e. onCommand_help_command will trigger on '!help command'.
 *
 * It also provides a parseMessage function, which can be called using
 *
 * room.getPlugin(`sav/commands`).parseMessage(message, `!`, ` `), and returns
 * an object like this:
 *
 * {
 *  command: command string without the command prefix, or an empty string if
 *    the message could not be parsed as a command,
 *  arguments: Array of arguments, extracted by splitting the original message
 *    by e.g. spaces, removing any empty parts as well as the command itself,
 *  argumentString: The original message minus the command itself
 * }
 *
 * Example:
 *
 * Someone writes: !kick foo
 *
 * The plugin will trigger the event handlers onCommand_kick and onCommand1_kick
 * (the number indicates the number of arguments after the command), with the
 * following parameters:
 *
 * - player: player object of the issuing player
 * - arguments: Array of space-separated arguments in the command, in this case
 *    ["foo"]
 * - argumentString: String containing all arguments, in this case "foo"
 *
 * Configuration:
 *
 *  - commandPrefix: Any line that starts with this is interpreted as a command.
 *    Defaults to `!`. Lines that only contain this command prefix are ignored.
 *  - hideCommands: How commands should be displayed in the room. 0 = don't hide
 *    commands by default, only hide if the handler returns false; 1 = hide
 *    commands from others, but display them to the player who issued it; 2 =
 *    hide commands from all by default.
 *  - multiCommandPrefixHidesMessage: If set to true, lines that start with two
 *    or more command prefixes (i.e. `!!`) are never displayed to the room, but
 *    are otherwise treated like normal commands
 *
 * TODO add onCommand catch-all support
 *
 * Changelog:
 *
 * 1.4.2:
 *  - do not hide commands by default
 *  - fix a problem where messages containing multiple command prefixes and
 *    nothing else would be interpreted as a command
 *  - adjust to new sendChat API
 *  - add !info function previously in the plugin-control plugin
 *
 * 1.4.1:
 *  - adjust to HHM 0.9.1, player objects are now passed to event handlers
 *
 * 1.4.0:
 *  - add config option to control how commands are displayed
 *
 * 1.3.0:
 *  - player ID instead of player object is passed to command handlers
 *  - command handlers can now decide whether commands are displayed to all
 *    players in the room or only to the issuing player, they can't hide
 *    commands anymore
 *
 * 1.2.0:
 *  - add support for messages starting with multiple command prefixes to be
 *    hidden always
 *  - improve custom message parsing by providing an numArgsMax parameter
 *
 * 1.1.0:
 *  - add sub-command support
 *  - change syntax from onCommandFoo# to onCommand#_foo
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/commands`,
  author: `saviola`,
  version: `1.4.2`,
  config: {
    commandPrefix: `!`,
    hideCommands: 0,
    multiCommandPrefixHidesMessage: true,
  },
};

//
// Plugin functions
//

/**
 * TODO documentation
 */
function removeMultiCommandPrefix(message, commandPrefix) {
  while (message.startsWith(commandPrefix + commandPrefix)) {
    message = message.substr(commandPrefix.length);
  }

  return message;
}

/**
 * Triggers the appropriate events for the given parsed message.
 *
 * The most specific sub-command will be triggered if several candidates are
 * found.
 */
function triggerEvents(playerId, parsedMessage) {
  const eventHandlers = room.getPluginManager().getHandlerNames()
    .filter(handler => handler.startsWith(`onCommand`));

  let subcommand = parsedMessage.command;
  const potentialSubcommands = [subcommand];

  // Find potential subcommands
  // e.g. for !help plugin xyz the potential subcommands would be
  // 'help plugin xyz', 'help plugin', and 'help'
  for (let i = 0; i < parsedMessage.arguments.length; i++) {
    subcommand = subcommand + `_${parsedMessage.arguments[i]}`;
    potentialSubcommands.push(subcommand);
  }

  // Find the handler for the most specific subcommand
  for (let i = potentialSubcommands.length - 1; i >= 0; i--) {
    let subcommandEventHandlers = eventHandlers
    .filter(handler => handler.endsWith(potentialSubcommands[i]));

    // As soon as we have a match, trigger events and return
    if (subcommandEventHandlers.length > 0) {
      const player = room.getPlayer(playerId);
      const j = parsedMessage.arguments.length - i;
      const arguments = parsedMessage.arguments.slice(i);
      const argumentString = arguments.join(parsedMessage.separator);
      let returnValue = true;

      returnValue = room.triggerEvent(
          `onCommand${j}_${potentialSubcommands[i]}`, player, arguments,
          argumentString, parsedMessage.originalMessage) !== false;
      returnValue = room.triggerEvent(`onCommand_${potentialSubcommands[i]}`,
          player, arguments, argumentString, parsedMessage.originalMessage)
          !== false && returnValue;

      return returnValue;
    }
  }
}

/**
 * Parse given message into command and arguments using the given command prefix
 * and separator.
 *
 * @returns Object containing the command, and array of arguments, as well as
 *  a string containing all the arguments and the separator that was used.
 */
function parseMessage(message, numArgsMax, commandPrefix, separator) {
  if (numArgsMax === undefined) {
    numArgsMax = -2;
  }

  numArgsMax++;

  if (commandPrefix === undefined) {
    commandPrefix = room.getConfig().commandPrefix;
  }

  if (separator === undefined) {
    separator = ` `;
  }

  message = removeMultiCommandPrefix(message, commandPrefix);

  if (!message.startsWith(commandPrefix) || message.length < 2) {
    return {
      command: ``,
      arguments: [],
      argumentString: ``,
      separator: separator,
    }
  }

  const parts = message.split(separator, numArgsMax).map(arg => arg.trim())
  .filter(arg => arg.length > 0);

  const argumentString = parts.length > 1 ? message.split(separator, 2)[1] : ``;

  const command = parts[0][commandPrefix.length]
      + (parts[0].length > commandPrefix.length + 1
          ? parts[0].substr(commandPrefix.length + 1) : ``);

  // Remove command from the message parts
  parts.shift();

  return {
    command: command,
    arguments: parts,
    argumentString: argumentString,
    separator: separator,
    originalMessage: message,
  };
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onCommandInfo0Handler() {
  room.sendChat(`Running HHM version ${HHM.version.identifier}, built on `
      + `${HHM.version.buildDate}`);
}

/**
 * Triggers command events if a command was found in the incoming message.
 *
 * TODO needs buffering or similar to avoid displaying command after the fact
 * TODO detect commands that are not handled by any plugin?
 */
function onPlayerChatHandler(player, message, { returnValue }) {
  if (returnValue === false) return false;

  message = room.getConfig().commandPrefix !== ` `
      ? message.trimStart() : message;

  const parsedMessage = room.parseMessage(message);

  if (parsedMessage.command !== ``) {
    const hideMessage = room.getConfig().multiCommandPrefixHidesMessage
        && (message.length !== removeMultiCommandPrefix(message,
            room.getConfig().commandPrefix).length);
    const hideCommands = room.getConfig().hideCommands;

    // Display message, but to player only
    if (!hideMessage && hideCommands === 1) {
      room.sendChat(message, player.id, { prefix: [`CMD`] });
    }

    const eventReturnValue = triggerEvents(player.id, parsedMessage);

    return !hideMessage && hideCommands === 0 && eventReturnValue;
  }

  return true;
}

//
// Exports
//

room.parseMessage = parseMessage;

room.onCommand0_info = onCommandInfo0Handler;
room.onPlayerChat = onPlayerChatHandler;