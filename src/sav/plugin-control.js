/**
 * Plugin to manage plugins: loading, enabling/disabling, configuration.
 *
 * Access to the functionality provided by this plugin requires the `host` role.
 * If no such role is defined in the configuration, anyone getting admin by the
 * host or the room script will have access.
 *
 * Changelog:
 *
 * 1.1.2:
 *  - adjust to new `sav/roles` API
 *  - loading, enabling and disabling plugins now requires host role
 *  - host role is no longer automatically created
 *  - !info function moved to command plugin
 *
 * 1.1.1:
 *  - adjust to new `sav/help` API
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
  version: `1.1.2`,
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

//
// Event handlers
//

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

  if (!roles.ensurePlayerRoles(playerId, `host`, room,
      { feature: `plugin load` })) {
    return;
  }

  if (arguments.length === 0) {
    return help.displayHelp(playerId, `plugin load`);
  }

  let pluginName, pluginUrl;

  if (arguments.length > 1) {
    pluginName = arguments[0];
    pluginUrl = arguments[1];
  } else if (arguments[0].startsWith(`http`)) {
    pluginUrl = arguments[0];
  } else {
    pluginName = arguments[0];
  }

  const manager = room.getPluginManager();
  const pluginLoader = room.getPluginManager().getPluginLoader();
  let pluginId = await manager.addPlugin({ pluginName, pluginUrl});

  if (pluginId === -1) {
    room.sendChat(`Unable to load plugin from URL or repositories`,
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

  if (!roles.ensurePlayerRoles(playerId, `host`, room,
      { feature: `plugin disable` })) {
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

  if (!roles.ensurePlayerRoles(playerId, `host`, room,
      { feature: `plugin enable` })) {
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
    room.log(`The "host" role does not exist, some features of this plugin `
        + `will be unavailable`);
  }

  help.registerHelp(`plugin list`,
      ` [FILTER], list loaded, enabled, and disabled plugins.`)
      .registerHelp(`plugin load`,
      ` NAME URL, at least one of NAME or URL must be specified.`, { roles: [`host`] })
      .registerHelp(`plugin disable`, ` NAME`, { roles: [`host`] })
      .registerHelp(`plugin enable`, ` NAME`, { roles: [`host`] });
}

//
// Exports
//

room.onCommand_plugin_list = onCommandPluginListHandler;
room.onCommand_plugin_load = onCommandPluginLoadHandler;
room.onCommand_plugin_disable = onCommandPluginDisableHandler;
room.onCommand_plugin_enable = onCommandPluginEnableHandler;
room.onRoomLink = onRoomLinkHandler;
