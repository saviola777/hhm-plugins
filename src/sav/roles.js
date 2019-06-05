/**
 * Basic role plugin.
 *
 * Provides four types of events to handle added / removed roles for players:
 *
 *  - onPlayerRole(player, role, added)
 *  - onPlayerRole_role(player, added)
 *  - onPlayerRoleAdded/onPlayerRoleRemoved(player, role)
 *  - onPlayerRoleAdded/onPlayerRoleRemoved_role(player)
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
 * Exported functions:
 *
 *  - addOrUpdateRole(role, password): adds or updates a role
 *  - addPlayerRole(playerId, role, persistent = false): adds a role to the given
 *    player, making it persistent across room restarts if persistent is set to
 *    true
 *  - ensurePlayerRole(playerId, role, plugin, feature, message): This checks
 *    if the player has the given role, returns true if they do, false if they
 *    don't, and sends a  customizable PM to the player if false is returned
 *  - getPlayerRoles(playerId): Returns an array of roles for the given player
 *  - getRole(roleName, { offlinePlayers = false}): Returns information for the
 *    given role (name, password, players in the room having the role)
 *  - getRoles({ offlinePlayers = false }): Like `getRole`, but for all roles
 *  - hasPlayerRole(playerId, role): Returns whether the given player has the
 *    given role
 *  - hasRole(role): Returns whether the given role exists
 *  - removePlayerRole(playerId, role): Removes the given role from the given
 *    player
 *  - removeRole(role): Removes the given role completely
 *  - setPlayerRole(playerId, role, state = true, persistent = false): Add or
 *    remove given role for the given player
 *
 * Changelog:
 *
 * 1.2.1:
 *  - rename `persistent` to `userRole`
 *  - add `userRole` parameter to most of the functions and event handlers
 *
 * 1.2.0:
 *  - rename `getRoles` to `getPlayerRoles`
 *  - add several exported functions for better access to role information
 *  - do not give admin role to every admin, only to those explicitly
 *    authenticated for the role
 *  - rename ensurePlayerRole to ensurePlayerRoles and accept array of roles
 *
 * 1.1.1:
 *  - adjust to HHM 0.9.1
 *
 * 1.1.0:
 *  - authentication information are no longer deleted when a player leaves
 *  - explicitly assigned roles can now be made persistent, so a player can
 *    rejoin later and will have the same roles as before
 *
 * 1.0.0:
 *  - initial implementation of a basic role system
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/roles`,
  author: `saviola`,
  version: `1.2.1`,
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

  room.getConfig().roles[role] = password;
}

/**
 * Add the given role to the given player.
 */
function addPlayerRole(playerId, role, userRole = false) {
  provideAuthenticationInfo(playerId);

  const playerRoles = getPlayerAuth(playerId).roles,
      userRoles = getUserAuth(playerId).roles;

  const returnValue = !playerRoles.has(role);

  if (userRole && !userRoles.has(role)) {
    userRoles.add(role);
  }

  if (returnValue) {
    playerRoles.add(role);
    triggerAuthenticationEvents(playerId, role, userRole);
  }

  return returnValue;
}

function addUserRole(auth, role) {
  const userRoles = getUserAuth(playerId).roles
}

/**
 * Checks whether the given player has at least one of the given roles and
 * prints and error message to chat (only for the issuing user) if not.
 *
 * The message will be
 *
 *  "${message} for ${feature} of plugin ${pluginName}. It requires one of the
 *  following user/player roles: ${roles}"
 *
 *  If ${message} is undefined, it will default to "Access denied".
 *  If ${feature} is undefined, it will only print the plugin name.
 *
 */
function ensurePlayerRoles(playerId, roles, plugin, { userRole = false, feature,
                           message = `Access denied` } = {}) {
  roles = roles.constructor !== Array ? [roles] : roles;
  if (roles.some((role) => room.hasPlayerRole(playerId, role, userRole))) {
    return true;
  }

  const rolesString = roles.join(', ');

  let pluginFeature = `plugin ${plugin._name}`;

  if (feature !== undefined) {
    pluginFeature = `${feature} of ${pluginFeature}`;
  }

  room.sendChat(`${message} for ${pluginFeature}. ` +
      `It requires one of the following ${userRole ? `user` : `player`} roles: `
          + rolesString, playerId, { prefix: HHM.log.level.ERROR });

  return false;
}

/**
 * Returns an array of roles for the given player.
 */
function getPlayerRoles(playerId) {
  provideAuthenticationInfo(playerId);

  return [...getPlayerAuth(playerId).roles];
}

/**
 * Returns role information.
 *
 * Returns an object which contains
 *
 *  - roleName: name of the role
 *  - players: array of player objects currently in the room who have the role
 *  - password: role password
 *
 * Note that this function does not care if the function exists it will still
 * return a valid result (no players, no password).
 */
function getRole(roleName, { offlinePlayers = false } = {}) {
  const roleExists = hasRole(roleName);
  return {
    roleName: roleName,
    players: roleExists ? room.getPlayerList({ offlinePlayers })
      .filter((p) => hasPlayerRole(p.id)) : [],
    password: roleExists ? getRoles()[roleName] : ``,
  };
}

/**
 * Returns role information on all roles.
 *
 * @see getRole
 */
function getRoles({ offlinePlayers = false } = {}) {
  let roles = {};

  Object.getOwnPropertyNames(room.getConfig(`roles`)).forEach((roleName) =>
      roles[roleName] = getRole(roleName, { offlinePlayers }));

  return roles;
}

/**
 * Returns whether the given player has the given (user) role.
 */
function hasPlayerRole(playerId, role, userRole = false) {
  provideAuthenticationInfo(playerId);

  return userRole ? getUserAuth(playerId).roles.has(role)
      : getPlayerAuth(playerId).roles.has(role);
}

/**
 * Returns whether the given role is among the known roles.
 */
function hasRole(role) {
  return room.getConfig().roles.hasOwnProperty(role);
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

  const returnValue = getPlayerAuth(playerId).roles.delete(role);
  const userRole = getUserAuth(playerId).roles.delete(role);

  if (returnValue) {
    triggerAuthenticationEvents(playerId, role, userRole, false);
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
  const returnValue = delete room.getConfig().roles[role];

  room.getPlayerList().forEach((p) => {
    removePlayerRole(p.id, role);
  });

  return returnValue;
}

/**
 * Convenience function for adding / removing a role based on a boolean state.
 */
function setPlayerRole(playerId, role, state = true, userRole = false) {
  state ? room.addPlayerRole(playerId, role, userRole)
      : room.removePlayerRole(playerId, role);
}

/**
 * TODO documentation
 */
function triggerAuthenticationEvents(playerId, role, userRole = false,
                                     added = true) {
  const addedString = added ? `Added` : `Removed`;

  room.triggerEvent(`onPlayerRole`, playerId, role, added, userRole);
  room.triggerEvent(`onPlayerRole_${role}`, playerId, added, userRole);
  room.triggerEvent(`onPlayerRole${addedString}`, playerId, role, userRole);
  room.triggerEvent(`onPlayerRole${addedString}_${role}`, playerId, userRole);
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onCommandAuthHandler(player, arguments, argumentString, message) {

  const roles = room.getConfig().roles;
  const playerId = player.id;

  if (arguments.length < 2) {
    room.getPlugin(`sav/help`).displayHelp(playerId, `auth`);
    return false;
  }

  const role = arguments[0];
  const password =
      room.getPlugin(`sav/commands`).parseMessage(message, 2).arguments[1];

  if (roles.hasOwnProperty(role) && roles[role] === password
      && roles[role] !== ``) {
    room.addPlayerRole(playerId, role, room.getConfig().persistentRoles);
    if (room.getConfig().printAuthEventsToRoom) {
      room.sendChat(`${player.name} authenticated for role ${role}`);
    } else {
      room.sendChat(`You authenticated for role ${role}`, playerId);
    }
  } else {
    if (room.getConfig().printAuthEventsToRoom) {
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
  if (typeof room.getConfig(`roles`) !== `object`) {
    room.log(`Invalid configuration: roles must be object`, HHM.log.level.ERROR);
    room.setConfig(`roles`, {});
  }

  getPlayerAuth = room.getPlugin(`sav/players`)
      .buildPlayerPluginDataGetter(`sav/roles`);
  getUserAuth = room.getPlugin(`sav/players`)
      .buildUserPluginDataGetter(`sav/roles`, true);

  room.getPlugin(`sav/help`).registerHelp(`auth`, ` ROLE PASSWORD`);
}

/**
 * TODO documentation
 */
function onPlayerJoinHandler(player) {
  provideAuthenticationInfo(player.id);
  if (typeof room.getConfig().defaultRole !== `undefined`) {
    room.addPlayerRole(player.id, room.getConfig().defaultRole);
  }

  [...getUserAuth(player.id).roles].forEach((role) => {
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
room.getPlayerRoles = getPlayerRoles;
room.hasPlayerRole = hasPlayerRole;
room.ensurePlayerRoles = ensurePlayerRoles;
room.getRole = getRole;
room.getRoles = getRoles;
room.hasRole = hasRole;
room.removePlayerRole = removePlayerRole;
room.removeRole = removeRole;
room.setPlayerRole = setPlayerRole;

room.onRoomLink = onRoomLinkHandler;
room.onPlayerRole_admin = room.onPlayerRole_host = onPlayerRoleAdminHandler;
room.onCommand_auth = onCommandAuthHandler;
room.onPlayerJoin = onPlayerJoinHandler;
