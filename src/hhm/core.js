/**
 * Registers some core event state handlers, pre-event handler hooks and
 * extensions to the native room API.
 *
 *  - Game state: room.isGamePaused() and room.isGameStarted() provide access
 *    to room states
 *  - room.getRoomLink() provides access to the room link at all times
 *  - native event state validation: pre-event handler hooks for onGameStart,
 *    onGameStop, onGamePause, and onGameUnpause
 *
 * Changelog:
 *
 * 2.0.0:
 *  - move HHM core functionality out of the core plugin, because it belongs
 *    into HHM itself
 *
 * 1.2.1:
 *  - if pluginSpec is no object, it is used as the plugin name
 *
 * 1.2.0:
 *  - move non-plugin event handlers of the HHM to this plugin
 *
 * 1.1.0:
 *  - improved book-keeping and event state validation for paused and
 *    started/stopped game states
 *
 * 1.0.0:
 *  - initial version
 *
 * TODO move async fix stuff from players to this plugin or into separate plugin
 *
 */

var room = HBInit();

room.pluginSpec = {
  name: `hhm/core`,
  author: `saviola`,
  version: `2.0.0`,
  dependencies: [
    `hhm/core` // Can't be disabled
  ],
};

//
// Global variables
//

const properties = { paused: false, started: false };

//
// Event handlers
//

function onRoomLinkHandler(roomLink) {

  room.extend(`pauseGame`, ({ previousFunction: pauseGame }, pause) => {
    pauseGame(pause);

    if (room.isGameStarted()) {
      properties.paused = pause;
    }
  });

  room.extend(`isGamePaused`, () => {
    return properties.paused === true;
  });

  room.extend(`isGameStarted`, () => {
    return room.getScores() !== null;
  });

  room.extend(`startGame`, ({ previousFunction: startGame }) => {
    // Set paused state to false on game start
    if (!room.isGameStarted()) {
      properties.paused = false;
    }

    startGame();

    properties.started = true;
  });

  room.extend(`stopGame`, ({ previousFunction: stopGame }) => {
    // Set paused state to false on game stop
    properties.paused = false;

    stopGame();

    properties.started = false;
  });

  room.extend(`getRoomLink`, () => {
    return roomLink;
  });

  room
  // Pre-event handler hooks
  .addPreEventHandlerHook(`onGameStart`, () => {
    return properties.started === true;
  })
  .addPreEventHandlerHook(`onGameStop`, () => {
    return properties.started === false;
  })
  .addPreEventHandlerHook(`onGamePause`, () => {
    return properties.paused === true;
  })
  .addPreEventHandlerHook(`onGameUnpause`, () => {
    return properties.paused === false;
  })
  // Prevent native onRoomLink events from propagating
  .addPreEventHook(`onRoomLink`, () => {
    return false;
  })
  // Pre and post event handler hooks
  .addPreEventHook(`onGamePause`, () => {
    properties.paused = true;
  })
  .addPreEventHook(`onGameUnpause`, () => {
    properties.paused = false;
  })
  .addPreEventHook(`onGameStart`, () => {
    properties.started = true;
  })
  .addPreEventHook(`onGameStop`, () => {
    properties.started = false;
  });
}

//
// Exports
//

room.onRoomLink = onRoomLinkHandler;