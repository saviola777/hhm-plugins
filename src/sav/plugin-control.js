/**
 * Plugin to manage plugins: loading, enabling/disabling, configuration.
 *
 * Access to the functionality provided by this plugin requires the `host` role.
 * If no such role is defined in the configuration, anyone getting admin by the
 * host or the room script will have access.
 *
 * TODO test and extend
 *
 * Changelog:
 *
 * 1.1.0:
 *  - fix wrong call to string.contains
 *  - add "!info" command
 *  - add "!plugin list [filter]" command
 *  - update plugin loading/adding logic to current API
 *
 * 1.0.2:
 *  - adjust to HHM 0.9.1
 *
 * 1.0.1:
 *  - add support for enabling and disabling plugins from within the room
 *
 * 1.0.0:
 *  - initial implementation with support for loading plugins from configured
 *    repositories, from raw URL and from pastebin
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/plugin-control`,
  author: `saviola`,
  version: `1.1.0`,
  dependencies: [
    `sav/help`,
    `sav/roles`,
  ],
};

//
// Global variables
//

/**
 * TODO documentation
 */
let roles, help;

//
// Plugin functions
//

/**
 * TODO documentation
 */
function makeRawUrl(url) {
  if (url.includes(`pastebin`) && !url.includes(`raw`)) {
    return `https://pastebin.com/raw/${url.substr(url.lastIndexOf(`/`) + 1)}`;
  }

  return url;
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onCommandInfoHandler() {
  room.sendChat(`Running HHM version ${HHM.version.identifier}, built on `
      + `${HHM.version.buildDate} from URL ${HHM.baseUrl}`);
}

/**
 * TODO documentation
 */
function onCommandPluginListHandler(player, [filter = ``] = []) {
  let manager = room.getPluginManager();
  let loadedPluginIds = manager.getLoadedPluginIds();

  let enabledPluginNames = [];
  let disabledPluginNames = [];

  loadedPluginIds = loadedPluginIds.map((id) => manager.getPluginById(id))
      .filter((plugin) => plugin.getName().indexOf(filter) !== -1);
  loadedPluginIds.forEach((plugin => {
        (plugin.isEnabled() ? enabledPluginNames : disabledPluginNames)
            .push(plugin.getName());
      }));

  let filterString = filter === `` ? `` : ` (for filter "${filter}")`;

  room.sendChat(`Currently ${loadedPluginIds.length} plugins loaded${filterString}.`,
      player.id);
  room.sendChat(`Enabled plugins: ${enabledPluginNames.join(`, `)}.`, player.id);

  if (disabledPluginNames.length > 0) {
    room.sendChat(`Disabled plugins: ${disabledPluginNames.join(`, `)}.`, player.id);
  }
}

/**
 * TODO documentation
 */
async function onCommandPluginLoadHandler(player, arguments) {
  const playerId = player.id;

  if (!roles.ensurePlayerRole(playerId, `host`, room, `plugin load`)) {
    return;
  }

  if (arguments.length === 0) {
    return help.displayHelp(playerId, `plugin load`);
  }

  let pluginName, pluginUrl;

  if (arguments.length > 1) {
    pluginName = arguments[0];
    pluginUrl = makeRawUrl(arguments[1]);
  } else if (arguments[0].startsWith(`http`)) {
    pluginUrl = makeRawUrl(arguments[0]);
  } else {
    pluginName = arguments[0];
  }

  const manager = room.getPluginManager();
  const pluginLoader = room.getPluginManager().getPluginLoader();
  let pluginId = await manager.addPlugin({ pluginName, pluginUrl});

  if (pluginId === -1) {
    room.sendChat(`Unable to load plugin from URL ${pluginUrl}.`,
        playerId, { prefix: HHM.log.level.ERROR });
  } else {
    pluginName = room.getPluginManager().getPluginName(pluginId);
    room.sendChat(`Plugin ${pluginName} successfully loaded and enabled`);
  }
}

/**
 * TODO documentation
 */
function onCommandPluginDisableHandler(player, [pluginName] = []) {
  const playerId = player.id;

  if (!roles.ensurePlayerRole(playerId, `host`, room, `plugin disable`)) {
    return;
  }

  if (pluginName === undefined) {
    return help.displayHelp(playerId, `plugin disable`);
  }

  const manager = room.getPluginManager();

  if (!room.hasPlugin(pluginName)) {
    return room.sendChat(`Invalid plugin name ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  if (!manager.disablePluginById(manager.getPluginId(pluginName))) {
    // TODO more error information
    return room.sendChat(`Could not disable plugin ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  room.sendChat(`Plugin ${pluginName} disabled by player ${player.name}`);
}

/**
 * TODO documentation
 */
function onCommandPluginEnableHandler(player, [pluginName] = []) {
  const playerId = player.id;

  if (!roles.ensurePlayerRole(playerId, `host`, room, `plugin enable`)) {
    return;
  }

  if (pluginName === undefined) {
    return help.displayHelp(playerId, `plugin enable`);
  }

  const manager = room.getPluginManager();

  if (!room.hasPlugin(pluginName)) {
    return room.sendChat(`Invalid plugin name ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  if (!manager.enablePluginById(manager.getPluginId(pluginName))) {
    // TODO more error information
    return room.sendChat(`Could not enable plugin ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  room.sendChat(`Plugin ${pluginName} enabled by player ` +
      room.getPlayer(playerId).name);
}

/**
 * TODO documentation
 */
function onRoomLinkHandler() {
  roles = room.getPlugin(`sav/roles`);
  help = room.getPlugin(`sav/help`);

  if (!roles.hasRole(`host`)) {
    roles.addOrUpdateRole(`host`);
    room.onPlayerAdminChange = (player, byPlayer) => {
      if (typeof byPlayer !== `undefined` && byPlayer.id !== 0) return;

      roles.setPlayerRole(player.id, `host`, player.admin);
    }
  }

  help.registerHelp(`plugin list`,
      ` [FILTER], list loaded, enabled, and disabled plugins.`)
      .registerHelp(`plugin load`,
      ` NAME URL, at least one of NAME or URL must be specified.`)
      .registerHelp(`plugin disable`, ` NAME`)
      .registerHelp(`plugin enable`, ` NAME`);
}

//
// Exports
//

room.onCommand_info = onCommandInfoHandler;
room.onCommand_plugin_list = onCommandPluginListHandler;
room.onCommand_plugin_load = onCommandPluginLoadHandler;
room.onCommand_plugin_disable = onCommandPluginDisableHandler;
room.onCommand_plugin_enable = onCommandPluginEnableHandler;
room.onRoomLink = onRoomLinkHandler;
