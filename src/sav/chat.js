/**
 * Chat plugin, extending the basic chat capabilities.
 *
 * If your plugin wants to hide chat messages, please include
 *
 * order: {
 *   'onPlayerChat': {
 *     'before': 'sav/chat',
 *   }
 * }
 *
 * in your plugin specification.
 *
 * Changelog:
 *
 * 0.9.2:
 *  - fix problem were using `sendChat` with non-string values would lead to
 *    errors
 *  - adjust to HHM 0.9.1
 *
 * 0.9.1:
 *  - disable channels by default
 *  - add lots of config parameters for better control
 *  - moved sendChatMaxLength to the chat plugin
 *
 * 0.9.0:
 *  - support for auto channels (global and team-based)
 *  - support for channel switching
 *  - timestamps
 *  - username + ID
 *  - prefixes including plugin name and PM / channel name
 *  - flood protection for plugin messages
 *
 * TODO add logging function for channels?
 * TODO add config documentation
 *
 * sendChatMaxLength:
 *
 * Overlong messages are automatically split in the HHM sendChat
 * implementation. To avoid (accidental) chat flooding, no message can be
 * longer than this value.
 *
 * By default this limits the output to 20 lines.
 */

const room = HBInit();

room.pluginSpec = {
  name: `sav/chat`,
  author: `saviola`,
  version: `0.9.2`,
  dependencies: [
    `sav/commands`,
    `sav/players`
  ],
  order: {
    'onPlayerChat': {
      'after': [`sav/commands`],
    },
  },
  config: {
    commandShortcuts: true,
    enableChannels: false,
    hhmPrefix: false,
    sendChatMaxLength: 2686,
    pluginPrefix: false,
    pmPrefix: true,
    timestampPrefix: true,
    prefixStart: ``,
    prefixEnd: ` ::`,
    prefixElementStart: ``,
    prefixElementEnd: `|`,
    playerPrefix: ` `,
  }
};

//
// Global variables
//

const channels = {};
const channelTypes = { AUTO: `auto`, MANUAL: `manual`};
const config = room.getConfig();
const teamChannelNames = [`spec`, `red`, `blue`];
const reservedChannelNames = { GLOBAL: `global` };

// Initialized in onRoomLinkHandler
let sendChatNative, getChatInfo;

//
// Plugin functions
//

/**
 * TODO documentation
 */
function createChannel(channel, password) {
  if (channels.hasOwnProperty(channel)) {
    return false;
  }

  channels[channel] = {
    password: password,
    players: new Set(),
    type: channelTypes.AUTO,
  };

  return true;
}

/**
 * TODO documentation
 */
function createChannelsObject() {
  return {
    muted: new Set(),
    current: ``,
    last: ``,
  }
}

/**
 * TODO documentation
 */
function initializeAutoChannels() {
  [...teamChannelNames, reservedChannelNames.GLOBAL].forEach(
      (name) => {
        createChannel(name, false);
  });
}

/**
 * TODO documentation
 */
function isPlayerInChannel(playerId, channel) {
  return channels.hasOwnProperty(channel)
      && channels[channel].players.has(playerId);
}

/**
 * TODO documentation
 * TODO document return value, -1 = not joined (wrong PW or didn't exist), 0 =
 *  already in channel, 1 = joined + logged
 *  TODO document password parameter, false necessary to join auto channels
 */
function joinChannel(playerId, channel, password = ``) {
  const chatInfo = getChatInfo(playerId);

  if (!channels.hasOwnProperty(channel)
      || password !== channels[channel].password) {
    return -1;
  }

  if (channels[channel].players.has(playerId)) {
    return 0;
  }

  channels[channel].players.add(playerId);

  if (chatInfo.channels.current === ``) {
    updateCurrentChannel(playerId, channel);
  } else {
    room.sendChat(`Joined channel &${channel}`, playerId);
  }


  return 1;
}

/**
 * TODO documentation
 */
function leaveChannel(playerId, channel) {
  if (!channels.hasOwnProperty(channel)
      || !channels[channel].players.has(playerId)) {
    return false;
  }

  channels[channel].players.delete(playerId);

  room.sendChat(`Left channel &${channel}`, playerId);

  return true;
}

/**
 * TODO documentation
 */
function padToTwo(number) {
  return number <= 9 ? ("0"+number) : number;
}

/**
 * Sends a message as the given user on their current channel.
 */
function sendPlayer(playerId, message) {

  const channel = getChatInfo(playerId).channels.current;

  const prefix = [room.getPlayer(playerId).name];

  return sendChannel(channel, message, prefix);
}

/**
 * TODO documentation
 */
function sendChannel(channel, message, prefix = [`HHM`]) {

  prefix = wrapInArrayOrCopy(prefix);

  if (config.enableChannels && channel !== reservedChannelNames.GLOBAL) {
    prefix.unshift(`&${channel}`);
  }

  room.getPlayerList().forEach((p) => {
    if (!config.enableChannels || (channels[channel].players.has(p.id)
        && !getChatInfo(p.id).channels.muted.has(channel))) {
      sendChatRaw(message, p.id, prefix);
    }
  });

  return true;
}

/**
 * Adds a prefix for system messages, then sends messages using sendChatRaw.
 *
 * TODO non-private messages sent with this message go to the global channel?
 */
function sendChat({ callingPluginName }, message, playerId, prefix = []) {
  prefix = wrapInArrayOrCopy(prefix);

  if (prefix.length === 0 && config.hhmPrefix) {
    prefix.unshift(`HHM`);
  }

  if (playerId !== undefined && config.pmPrefix) {
    prefix.unshift(`PM`);
  }

  if (config.pluginPrefix && callingPluginName !== undefined) {
    prefix.unshift(callingPluginName);
  }

  sendChatRaw(message, playerId, prefix);
}

/**
 * Splits overlong messages if necessary.
 *
 * @param message Message to be sent
 * @param playerId Receiver of the message or undefined if public message
 * @param prefix Single prefix or array of prefixes
 *
 * TODO extend for private messages
 */
function sendChatRaw(message, playerId, prefix = []) {
  message = String(message);
  let prefixWithTime;

  prefixWithTime = wrapInArrayOrCopy(prefix);

  if (config.enableChannels && config.timestampPrefix) {
    const date = new Date();
    prefixWithTime.unshift(
        `${padToTwo(date.getHours())}:${padToTwo(date.getMinutes())}:${padToTwo(
            date.getSeconds())}`);
  }

  let p = ``;

  for (let i = 0; i < prefixWithTime.length; i++) {
    if (typeof prefixWithTime[i] !== `string` || prefixWithTime[i].length === 0) {
      continue;
    }

    p += config.prefixElementStart + prefixWithTime[i] + config.prefixElementEnd;
  }

  if (p.length > 0) {
    // Remove last prefix end element
    p = p.substr(0, p.length - config.prefixElementEnd.length);
    p = `${config.prefixStart}${p}${config.prefixEnd} `;
  }

  if (p.length + message.length <= 140) {
    return sendChatNative(p + message, playerId);
  }

  let baseIndex = 134 - p.length;

  sendChatNative(`${p}${message.substr(0, baseIndex + 3)}...`, playerId);

  let index = baseIndex;
  let i = 1;

  while (i * 140 < config.sendChatMaxLength) {
    // TODO use message length for efficiency?
    if (message[index + baseIndex + 3] === undefined) {
      return sendChatNative(`${p}...${message.substr(index)}`, playerId);
    }

    sendChatNative(`${p}...${message.substr(index, baseIndex)}...`, playerId);
    index += baseIndex;
    i++;
  }

  // TODO
  sendChatRaw(`Overlong message was cut off by flood protection`,
      playerId, prefix);

}

/**
 * TODO documentation
 */
function updateCurrentChannel(playerId, channel) {

  const chatInfo = getChatInfo(playerId);

  if (!isPlayerInChannel(playerId, channel)) {
    room.log(`Failed to update current channel to ${channel} for player `
      + `#${playerId}, they are not in the channel`, HHM.log.level.ERROR);
    return false;
  }

  chatInfo.channels.last = chatInfo.channels.current;
  chatInfo.channels.current = channel;

  if (chatInfo.channels.last !== chatInfo.channels.current) {
    room.sendChat(`Now talking in &${chatInfo.channels.current}`
        + (chatInfo.channels.last !== `` ?
          ` (before: &${chatInfo.channels.last})` : ``), playerId);

    return true;
  }

  return false;
}

/**
 * Wraps the given variable in an array or copies it if it is already an array.
 */
function wrapInArrayOrCopy(variable) {
  return typeof variable !== `object` || variable.constructor !== Array
      ? [variable] : variable.slice();
}

//
// Event handlers
//

/**
 * TODO documentation
 */
function onCommandChatChannelCreate(player, [channel, password = ``]) {
  const playerId = player.id;

  if (channel === undefined) {
    room.sendChat(`Please specify a channel name`, playerId,
        HHM.log.level.ERROR);
    return false;
  } else if (channelSet.has(channel)) {
    room.sendChat(`Failed to create channel &${channel}, it exists`, playerId,
        HHM.log.level.ERROR);
    return false;
  }

  createChannel(channel, password);

  room.sendChat(`Created channel &${channel}`
      + (password !== `` ? ` with password "${password}"` : ``), playerId);

  joinChannel(playerId, channel, password);
}

/**
 * TODO documentation
 */
function onCommandChatChannelSwitch(player, [channel]) {
  const playerId = player.id;
  const chatInfo = getChatInfo(playerId);
  let newChannel = channel;

  if (channel === undefined) {
    if (chatInfo.channels.last === undefined
        || !isPlayerInChannel(playerId, chatInfo.channels.last)) {
      room.sendChat(`Not sure which channel to switch to`, playerId,
          HHM.log.level.ERROR);
      return false;
    }

    newChannel = chatInfo.channels.last;
  }

  if (!isPlayerInChannel(playerId, newChannel)) {
    room.sendChat(
        `Can't switch to channel ${newChannel}, you need to join it first`,
        playerId, HHM.log.level.ERROR);

    return false;
  }

  updateCurrentChannel(playerId, newChannel);

  return false;
}

/**
 * TODO documentation
 */
function onRoomLinkHandler() {
  sendChatNative = room.getParentRoom().sendChat;
  getChatInfo = room.getPlugin(`sav/players`)
      .buildPlayerPluginDataGetter(`sav/chat`);
  room.extend(`sendChat`, sendChat);

  if (config.enableChannels) {
    room.onPlayerJoin = onPlayerJoinHandler;
    room.onPlayerTeamChange = onPlayerTeamChangeHandler;

    room.onCommand_chat_channel_create = onCommandChatChannelCreate;
    room.onCommand_chat_channel_switch = onCommandChatChannelSwitch;

    // Register shortcut commands
    if (config.commandShortcuts) {
      room.onCommand_ccs = onCommandChatChannelSwitch;
      room.onCommand_ccc = onCommandChatChannelCreate;
    }

    initializeAutoChannels();

    // Handle host user
    // TODO solve cleaner
    getChatInfo(0).channels = createChannelsObject();
  }
}

/**
 * TODO documentation
 */
function onPlayerChatHandler(player, message, { returnValue }) {
  if (!config.enableChannels) return returnValue;

  if (returnValue !== false) sendPlayer(player.id, message);

  return false;
}

/**
 * TODO documentation
 */
function onPlayerJoinHandler(player) {

  const chatInfo = getChatInfo(player.id);

  if (chatInfo.channels === undefined) {
    chatInfo.channels = createChannelsObject();
  }

  joinChannel(player.id, `global`, false);
  onPlayerTeamChangeHandler(player);
}

/**
 * TODO documentation
 */
function onPlayerTeamChangeHandler(player) {
  // Remove existing team channel
  teamChannelNames.forEach((c) => {
    leaveChannel(player.id, c);
  });

  joinChannel(player.id, teamChannelNames[player.team], false);
}

//
// Exports
//

room.isPlayerInChannel = isPlayerInChannel;
room.joinChannel = joinChannel;
room.leaveChannel = leaveChannel;

room.onRoomLink = onRoomLinkHandler;
room.onPlayerChat = onPlayerChatHandler;

// Chat commands
// !c[hat] c[channel] s[witch] [<channel>] (!ccs)
// !c[hat] c[channel] c[reate] <channel> [<password>] (!ccc)
// !c[hat] c[hannel] j[oin] <channel> [<password>] (!ccj)
// !c[hat] c[hannel] l[eave] <channel> [<password>] (!ccl)
// !c[hat] c[hannel] w[rite] <channel> <message> (!ccw)
// !c[hat] pm #<id> [<message>] (!cpm)
