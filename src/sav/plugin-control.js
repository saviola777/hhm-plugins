/**
 * Plugin to manage plugins: loading, enabling/disabling, configuration.
 *
 * Access to the functionality provided by this plugin requires the `host` role.
 * If no such role is defined in the configuration, anyone getting admin by the
 * host or the room script will have access.
 *
 * Changelog:
 *
 * 1.1.4:
 *  - adjust to sav/help version 2.0.0
 *  - add more help texts
 *  - add support for plugin reloading
 *
 * 1.1.3:
 *  - switch to sendAnnouncement
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
  version: `1.1.4`,
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

const onCommandPluginListHandlerData = {
  'sav/help': {
    text: ` [FILTER], list loaded, enabled, and disabled plugins.`,
  },
};

/**
 * TODO documentation
 */
function onCommandPluginListHandler(player, [filter = ``] = []) {
  let manager = room.getPluginManager();
  let loadedPluginIds = manager.getLoadedPluginIds();

  let enabledPluginNames = [];
  let disabledPluginNames = [];

  loadedPluginIds = loadedPluginIds.map((id) => manager.getPlugin(id))
      .filter((plugin) => plugin.getName().includes(filter));
  loadedPluginIds.forEach((plugin => {
        (plugin.isEnabled() ? enabledPluginNames : disabledPluginNames)
            .push(plugin.getName());
      }));

  let filterString = filter === `` ? `` : ` (for filter "${filter}")`;

  room.sendAnnouncement(`Currently ${loadedPluginIds.length} plugins loaded${filterString}.`,
      player.id);
  room.sendAnnouncement(`Enabled plugins: ${enabledPluginNames.join(`, `)}.`, player.id);

  if (disabledPluginNames.length > 0) {
    room.sendAnnouncement(`Disabled plugins: ${disabledPluginNames.join(`, `)}.`, player.id);
  }
}

const onCommandPluginLoadHandlerData = {
  'sav/help': {
    text: ` NAME URL, at least one of NAME or URL must be specified.`,
    roles: [`host`],
  },
};

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
  let pluginId = await manager.addPlugin({ pluginName, pluginUrl });

  if (pluginId === -1) {
    room.sendAnnouncement(`Unable to load plugin from URL or repositories`,
        playerId, { prefix: HHM.log.level.ERROR });
  } else {
    pluginName = room.getPluginManager().getPluginName(pluginId);
    room.sendAnnouncement(`Plugin ${pluginName} successfully loaded and enabled`);
  }
}

const onCommandPluginReloadHandlerData = {
  'sav/help': [
    {
      text: ` NAME, reload the given plugin safely`,
      roles: [`host`],
    },
    {
      text: ` NAME 1, reload the given plugin unsafely`,
      roles: [`host`],
    },
  ],
};

async function onCommandPluginReloadHandler(player, [pluginName, unsafe] = []) {
  const playerId = player.id;
  const safe = !unsafe;

  if (!roles.ensurePlayerRoles(playerId, `host`, room,
      { feature: `plugin reload` })) {
    return;
  }

  if (arguments.length === 0) {
    return help.displayHelp(playerId, `plugin reload`);
  }

  try {
    if (await HHM.manager.reloadPlugin(pluginName, safe)) {
      room.sendAnnouncement(`Plugin ${pluginName} successfully reloaded`,
          playerId);
    } else {
      room.sendAnnouncement(`Failed to reload plugin ${pluginName}, check `
        + `console output`, playerId);
    }
  } catch (e) {
    room.sendAnnouncement(`Error during plugin reload: ${e.message}`, playerId);
  }
}

const onCommandPluginDisable1HandlerData = {
  'sav/help': {
      text: ` NAME`,
      roles: [`host`],
    },
};

function onCommandPluginDisable1Handler(player, [pluginName] = []) {
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
    return room.sendAnnouncement(`Invalid plugin name ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  if (!manager.disablePlugin(pluginName)) {
    // TODO more error information
    return room.sendAnnouncement(`Could not disable plugin ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  room.sendAnnouncement(`Plugin ${pluginName} disabled by player ${player.name}`);
}

const onCommandPluginEnable1HandlerData = {
  'sav/help': {
    text: ` NAME`,
    roles: [`host`],
  },
};

function onCommandPluginEnable1Handler(player, [pluginName] = []) {
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
    return room.sendAnnouncement(`Invalid plugin name ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  if (!manager.enablePlugin(manager.getPluginId(pluginName))) {
    // TODO more error information
    return room.sendAnnouncement(`Could not enable plugin ${pluginName}`, playerId,
        { prefix: HHM.log.level.ERROR });
  }

  room.sendAnnouncement(`Plugin ${pluginName} enabled by player ` +
      room.getPlayer(playerId).name);
}

function onRoomLinkHandler() {
  roles = room.getPlugin(`sav/roles`);
  help = room.getPlugin(`sav/help`);

  if (!roles.hasRole(`host`)) {
    room.log(`The "host" role does not exist, some features of this plugin `
        + `will be unavailable`, HHM.log.level.WARN);
  }
}

//
// Exports
//

room.onCommand_plugin_list = {
  function: onCommandPluginListHandler,
  data: onCommandPluginListHandlerData,
};

room.onCommand_plugin_load = {
  function: onCommandPluginLoadHandler,
  data: onCommandPluginLoadHandlerData,
};

room.onCommand1_plugin_disable = {
  function: onCommandPluginDisable1Handler,
  data: onCommandPluginDisable1HandlerData,
};

room.onCommand1_plugin_enable = {
  function: onCommandPluginEnable1Handler,
  data: onCommandPluginEnable1HandlerData,
};

room.onCommand_plugin_reload = {
  function: onCommandPluginReloadHandler,
  data: onCommandPluginReloadHandlerData,
};

room.onRoomLink = onRoomLinkHandler;
