/**
 * Basic role plugin.
 *
 * Provides four types of events to handle added / removed roles for players:
 *
 * - onPlayerRole(player, role, added)
 * - onPlayerRole_role(player, added)
 * - onPlayerRoleAdded/onPlayerRoleRemoved(player, role)
 * - onPlayerRoleAdded/onPlayerRoleRemoved_role(player)
 *
 * Players leaving does not trigger any authentication events.
 *
 * Use the config to add roles and passwords, e.g.
 *
 * HHM.config.plugins = {
*    'sav/roles': {
 *      roles: {
 *        user: ``,
 *        admin: `somepw`,
 *      },
 *      defaultRole: `user`,
 * },
 *
 * Roles with empty passwords cannot be acquired using !auth.
 *
 * Changelog:
 *
 * 1.1.0:
 *  - authentication information are no longer deleted when a player leaves
 *  - explicitly assigned roles can now be made persistent, so a player can
 *    rejoin later and will have the same roles as before
 *
 * 1.0.0:
 *  - initial implementation of a basic role system
 */

const room = HBInit();

room.pluginSpec = {
  name: `sav/roles`,
  author: `saviola`,
  version: `1.1.0`,
  dependencies: [
    `sav/commands`,
    `sav/help`,
    `sav/players`
  ],
  config: {
    roles: {},
    defaultRole: undefined,
    persistentRoles: true, // TODO document
    printAuthEventsToRoom: false, // TODO document
  },
};

//
// Global variables
//

/**
 * TODO documentation
 */
let getPlayerAuth, getUserAuth;

//
// Plugin functions
//

/**
 * Adds the given role with the given password, or updates the password for the
 * given role if it aleady existed.
 */
function addOrUpdateRole(role, password) {
  if (password === undefined) {
    password = ``;
  }

  room.getPluginConfig().roles[role] = password;
}

/**
 * Add the given role to the given player.
 */
function addPlayerRole(playerId, role, persistent = false) {
  provideAuthenticationInfo(playerId);

  const playerRoles = getPlayerAuth(playerId).roles,
      userRoles = getUserAuth(playerId).roles;

  const returnValue = !playerRoles.has(role);

  if (persistent && !userRoles.has(role)) {
    userRoles.add(role);
  }

  if (returnValue) {
    playerRoles.add(role);
    triggerAuthenticationEvents(playerId, role);
  }

  return returnValue;
}

/**
 * TODO documentation
 */
function ensurePlayerRole(playerId, role, plugin, feature, message) {
  if (room.hasPlayerRole(playerId, role)) {
    return true;
  }

  if (message === undefined) {
    message = `Access denied`;
  }

  const pluginFeature = feature === undefined ? plugin._name
      : `${feature} of plugin ${plugin._name}`;

  room.sendChat(`${message} for "${pluginFeature}". Player ` +
      `${room.getPlayer(playerId).name} does not have role ${role}`,
      playerId, HHM.log.level.ERROR);

  return false;
}

/**
 * Returns an array of roles for the given player.
 */
function getRoles(playerId) {
  provideAuthenticationInfo(playerId);

  return [...getPlayerAuth(playerId).roles];
}

/**
 * Returns whether the given player has the given role.
 */
function hasPlayerRole(playerId, role) {
  provideAuthenticationInfo(playerId);

  return getPlayerAuth(playerId).has(role);
}

/**
 * Returns whether the given role is among the known roles.
 */
function hasRole(role) {
  return room.getPluginConfig().roles.hasOwnProperty(role);
}

/**
 * TODO documentation
 */
function provideAuthenticationInfo(playerId) {
  const playerAuth = getPlayerAuth(playerId);
  const userAuth = getUserAuth(playerId);

  playerAuth.roles = playerAuth.roles || new Set();
  userAuth.roles = userAuth.roles || new Set();
}

/**
 * Removes the given role from the given player and returns whether the player
 * actually had the given role beforehand.
 */
function removePlayerRole(playerId, role) {
  provideAuthenticationInfo(playerId);

  const returnValue = getPlayerAuth(playerId).delete(role);
  getUserAuth(playerId).delete(role);

  if (returnValue) {
    triggerAuthenticationEvents(playerId, role, false);
  }

  return returnValue;
}

/**
 * Removes the given role.
 *
 * This will trigger authentication events for every player that had the given
 * role.
 *
 * TODO add option to disable triggering events?
 */
function removeRole(role) {
  const returnValue = delete room.getPluginConfig().roles[role];

  room.getPlayerList().map((p) => {
    removePlayerRole(p.id, role);
  });

  return returnValue;
}

/**
 * Convenience function for adding / removing a role based on a boolean state.
 */
function setPlayerRole(playerId, role, state = true, persistent = false) {
  state ? room.addPlayerRole(playerId, role, persistent)
      : room.removePlayerRole(playerId, role);
}

/**
 * TODO documentation
 */
function triggerAuthenticationEvents(playerId, role, added) {
  if (added === undefined) {
    added = true;
  }

  const addedString = added ? `Added` : `Removed`;

  room.triggerEvent(`PlayerRole`, playerId, role, added);
  room.triggerEvent(`PlayerRole_${role}`, playerId, added);
  room.triggerEvent(`PlayerRole${addedString}`, playerId, role);
  room.triggerEvent(`PlayerRole${addedString}_${role}`, playerId);
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onCommandAuthHandler(playerId, arguments, argumentString, message) {

  const roles = room.getPluginConfig().roles;
  const player = room.getPlayer(playerId);

  if (arguments.length < 2) {
    room.getPlugin(`sav/help`).displayHelp(playerId, `auth`);
    return false;
  }

  const role = arguments[0];
  const password =
      room.getPlugin(`sav/commands`).parseMessage(message, 2).arguments[1];

  if (roles.hasOwnProperty(role) && roles[role] === password
      && roles[role] !== ``) {
    room.addPlayerRole(playerId, role, room.getPluginConfig().persistentRoles);
    if (room.getPluginConfig().printAuthEventsToRoom) {
      room.sendChat(`${player.name} authenticated for role ${role}`);
    } else {
      room.sendChat(`You authenticated for role ${role}`, playerId);
    }
  } else {
    if (room.getPluginConfig().printAuthEventsToRoom) {
      room.sendChat(`${player.name} failed to authenticate for role ${role}`);
    } else {
      room.sendChat(`Unknown role ${role} or wrong password`, playerId);
    }
  }

  return false;
}

/**
 * TODO documentation
 */
function onRoomLinkHandler() {
  getPlayerAuth = room.getPlugin(`sav/players`)
      .buildPlayerNamespaceGetter(`sav/roles`);
  getUserAuth = room.getPlugin(`sav/players`)
      .buildUserNamespaceGetter(`sav/roles`);

  room.getPlugin(`sav/help`).registerHelp(`auth`, ` ROLE PASSWORD`);
}

/**
 * TODO documentation
 */
function onPlayerAdminChangeHandler(player) {
  room.setPlayerRole(player.id, `admin`, player.admin);
}

/**
 * TODO documentation
 */
function onPlayerJoinHandler(player) {
  provideAuthenticationInfo(player.id);
  if (typeof room.getPluginConfig().defaultRole !== `undefined`) {
    room.addPlayerRole(player.id, room.getPluginConfig().defaultRole);
  }

  [...getUserAuth(player.id).roles].map((role) => {
    addPlayerRole(player.id, role);
  });
}

/**
 * TODO documentation
 */
function onPlayerRoleAdminHandler(playerId, added) {
  room.setPlayerAdmin(playerId, added);
}

//
// Exports
//

room.addPlayerRole = addPlayerRole;
room.addOrUpdateRole = addOrUpdateRole;
room.getRoles = getRoles;
room.hasPlayerRole = hasPlayerRole;
room.ensurePlayerRole = ensurePlayerRole;
room.hasRole = hasRole;
room.removePlayerRole = removePlayerRole;
room.removeRole = removeRole;
room.setPlayerRole = setPlayerRole;

room.onRoomLink = onRoomLinkHandler;
room.onPlayerRole_admin = room.onPlayerRole_host = onPlayerRoleAdminHandler;
room.onPlayerAdminChange = onPlayerAdminChangeHandler;
room.onCommand_auth = onCommandAuthHandler;
room.onPlayerJoin = onPlayerJoinHandler;
