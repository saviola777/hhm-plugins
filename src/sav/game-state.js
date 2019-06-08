/**
 * Game state management plugin.
 *
 * This plugin provides several convenient game state management facilities:
 *
 * GameState enum:
 *
 *  - gameStatePlugin.states.STOPPED = 0
 *  - gameStatePlugin.states.STARTED = 1
 *  - gameStatePlugin.states.PAUSED = 2
 *
 * Functions:
 *
 *  - `getGameState()`: value between 0 and 2 corresponding to the above enum
 *
 * Events:
 *
 *  - `onGameStateChanged(state, previousState, nativeEvent)`: called after the
 *    corresponding native events, `state` and `previousState` is a value
 *    between 0 and 2 corresponding to the above enum. Native event is an
 *    object containing the properties `name` and `args` for the native event
 *    which triggered the game state change.
 *
 *  If you just want to check if the game is started / stopped or paused /
 *  unpaused, use the functions `isGameStarted()` and `isGamePaused()`
 *  available on the room object through the `hhm/core` plugin.
 */

var room = HBInit();

room.pluginSpec = {
  name: `sav/game-state`,
  author: `saviola`,
  version: `1.0.0`,
};

const states = {
  STOPPED: 0,
  STARTED: 1,
  PAUSED: 2,
};

let state = states.STOPPED;

function onGameStartHandler(...args) {
  triggerGameStateChange(states.STARTED, `onGameStart`, ...args);
}

function onGameStopHandler(...args) {
  triggerGameStateChange(states.STOPPED, `onGameStop`, ...args);
}

function onGamePauseHandler(...args) {
  triggerGameStateChange(states.PAUSED, `onGamePause`, ...args);
}

function onGameUnpauseHandler(...args) {
  triggerGameStateChange(states.STARTED, `onGameUnpause`, ...args);
}

function triggerGameStateChange(newState, nativeEventName, ...args) {
  const previousState = state;
  state = newState;

  room.triggerEvent(`onGameStateChanged`, newState, previousState,
      { name: nativeEventName, args });
}

function getGameState() {
  return state;
}

room.states = states;
room.onGameStart = onGameStartHandler;
room.onGameStop = onGameStopHandler;
room.onGamePause = onGamePauseHandler;
room.onGameUnpause = onGameUnpauseHandler;
room.getGameState = getGameState;