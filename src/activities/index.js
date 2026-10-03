// Every shared activity is a small module: make(game) -> { update, interactables, key, seatPose, ... }
import ball from './ball.js';
import campfire from './campfire.js';
import fishing from './fishing.js';
import playground from './playground.js';
import music from './music.js';
import cafe from './cafe.js';
import lookout from './lookout.js';
import sailing from './sailing.js';
import forage from './forage.js';

export const ACTIVITIES = [ball, campfire, fishing, playground, music, cafe, lookout, sailing, forage];
