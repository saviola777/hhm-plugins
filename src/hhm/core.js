/**
 * Registers some core event state handlers, pre-event handler hooks and
 * extensions to the native room API.
 *
 *  - Game state: room.isGamePaused() and room.isGameStarted() provide access
 *    to room states
 *  - room.getRoomLink() provides access to the room link at all times
 *  - native event state validators: validators for onGameStart, onGameStop,
 *    onGamePause, and onGameUnpause
 *
 * Changelog:
 *
 * 1.1.0:
 *  - improved book-keeping and event state validation for paused and
 *    started/stopped game states
 *
 * 1.0.0:
 *  - initial version
 *
 */

const room = HBInit();

room.pluginSpec = {
  name: `hhm/core`,
  author: `saviola`,
  version: `1.1.0`,
  dependencies: [
    `hhm/core` // Can't be disabled
  ],
};

//
// Global variables
//

room.properties = { paused: false, started: false };

//
// Event handlers
//


function onRoomLinkHandler(roomLink) {

  room.extend(`pauseGame`, ({ previousFunction: pauseGame }, pause) => {
    pauseGame(pause);

    if (room.isGameStarted()) {
      room.properties.paused = pause;
    }
  });

  room.extend(`isGamePaused`, () => {
    return room.properties.paused === true;
  });

  room.extend(`isGameStarted`, () => {
    return room.getScores() !== null;
  });

  room.extend(`startGame`, ({ previousFunction: startGame }) => {
    // Set paused state to false on game start
    if (!room.isGameStarted()) {
      room.properties.paused = false;
    }

    startGame();

    room.properties.started = true;
  });

  room.extend(`stopGame`, ({ previousFunction: stopGame }) => {
    // Set paused state to false on game stop
    room.properties.paused = false;

    stopGame();

    room.properties.started = false;
  });

  room.extend(`getRoomLink`, () => {
    return roomLink;
  });

  room
  // Event state validators
  .addEventStateValidator(`onGameStart`, () => {
    return room.properties.started === true;
  })
  .addEventStateValidator(`onGameStop`, () => {
    return room.properties.started === false;
  })
  .addEventStateValidator(`onGamePause`, () => {
    return room.properties.paused === true;
  })
  .addEventStateValidator(`onGameUnpause`, () => {
    return room.properties.paused === false;
  })
  // Pre and post event handler hooks
  .addPreEventHandlerHook(`onGamePause`, () => {
    room.properties.paused = true;
  })
  .addPreEventHandlerHook(`onGameUnpause`, () => {
    room.properties.paused = false;
  })
  .addPreEventHandlerHook(`onGameStart`, () => {
    room.properties.started = true;
  })
  .addPreEventHandlerHook(`onGameStop`, () => {
    room.properties.started = false;
  });
}

//
// Exports
//

room.onRoomLink = onRoomLinkHandler;