/**
 * TODO documentation
 */

const room = HBInit();

room.pluginSpec = {
  name: `hhm/core`,
  author: `saviola`,
  version: `1.0.0`,
  dependencies: [
    `hhm/core` // Can't be disabled
  ],
};

room.properties = { paused: false };

room.onRoomLink = (roomLink) => {
  room.properties.roomLink = roomLink;
  HHM.deferreds.roomLink.resolve();
  HHM.ui.displayRoomLinkInHhmContainer(roomLink);
};

room.onLoad = () => {
  if (HHM.ui.isRoomLinkAvailable()) {
    room.onRoomLink(HHM.ui.getRoomLink());
  }

  room.extend(`isRoomStarted`, () => {
    return room.properties.roomLink !== undefined;
  });

  room.extend(`pauseGame`, ({ previousFunction: pauseGame }, pause) => {
    pauseGame(pause);
    room.properties.paused = pause;
  });

  room.extend(`isGamePaused`, () => {
    return room.properties.paused === true;
  });

  room.extend(`isGameStarted`, () => {
    return room.getScores() !== null;
  });

  room.extend(`getRoomLink`, () => {
    return room.properties.roomLink;
  });

  room
  // Event state validators
  .addEventStateValidator(`onPlayerChat`, ({ metadata }) => {
    return metadata.returnValue !== false;
  })
  .addEventStateValidator(`onGameStart`, () => {
    return room.getScores() !== null;
  })
  .addEventStateValidator(`onGameStop`, () => {
    return room.getScores() === null;
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
  });
};