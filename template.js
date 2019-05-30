/**
 * This is a template file for HHM plugins.
 *
 * Every plugin should include a documentation block like this at the beginning
 * of the file inlcuding a plugin description, plugin documentation, and a
 * changelog.
 */

var room = HBInit();

room.pluginSpec = {
  name: `aut/plugin-name`,  // aut here is optional and can be a shorthand,
  author: `author`,         // it is primarily used to avoid name clashes.
  version: `1.0.0`,
  dependencies: [
    `author/other-plugin`,
  ],
  order: {
    'onEvent': {
      'before': [`author/other-plugin`],
      'after': [`author/other-plugin2`],
    },
  },
  // Make sure to document configuration parameters here or above
  config: {
    param: `defaultValue`,
  }
};

//
// Global variables
//

/**
 * Here you can define global variables used in your plugin. Anything that
 * should be persistent but not visible outside of your plugin should be defined
 * as global variables.
 */

const SOME_CONSTANT = `value you don't want to repeat everywhere`;

const config = room.pluginSpec.config;
let variableInitializedInOnRoomLinkHandler;

//
// Plugin functions
//

/**
 * Here the functions used in your plugin can be defined. Most of the logic of
 * your plugin should be placed here.
 *
 * It makes sense to keep some sort of order, e.g. context-based or
 * alphabetical.
 */

/**
 * Each function should be documented, at least the ones you plan to export.
 */
function f1() {

}

//
// Event handlers
//

/**
 * Here you can define your event handler functions.
 */

/**
 * Event handler function can be defined here and assigned to the room later.
 */
function onRoomLinkHandler() {
  variableInitializedInOnRoomLinkHandler = `...`;
}

//
// Exports
//

/**
 * Exports are functions, properties and event handlers you want to make
 * accessible to other plugins.
 */

room.f1 = f1;

room.onRoomLink = onRoomLinkHandler;