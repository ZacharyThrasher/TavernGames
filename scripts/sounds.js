import { MODULE_ID } from "./state.js";

const SOUNDS = {
  dice: "sounds/dice.wav",
  coins: "modules/tavern-dice-master/sounds/coins.mp3",
  win: "modules/tavern-dice-master/sounds/win.mp3",
  lose: "modules/tavern-dice-master/sounds/lose.mp3",
  reveal: "modules/tavern-dice-master/sounds/reveal.mp3",
  join: "modules/tavern-dice-master/sounds/join.mp3",
};

export async function playSound(soundId) {
  if (!game.settings.get(MODULE_ID, "enableSounds")) return;
  
  const src = SOUNDS[soundId];
  if (!src) return;

  try {
    AudioHelper.play({ src, volume: 0.6, autoplay: true, loop: false }, true);
  } catch (e) {
    // Sound file may not exist, fail silently
    console.debug(`Tavern Dice Master: Sound not found: ${src}`);
  }
}

export async function playSoundForAll(soundId) {
  // This would be called via socket for synchronized sounds
  await playSound(soundId);
}
