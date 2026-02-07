/**
 * THEME FLAVOR ENGINE — Tavern Twenty-One
 * V5.22: Immersion Layer
 *
 * Each theme gets a unique VOICE that permeates every UI element.
 * This module provides thematic text, icons, and atmospheric copy
 * that makes each theme feel like a completely different venue.
 */

const THEMES = {
  "sword-coast": {
    subtitle: "A Game of Fortune & Folly",
    icon: "fa-solid fa-dice-d20",
    emptyTitle: "The Table Awaits",
    emptyText: "Pull up a chair, adventurer. The dice are warm.",
    emptyIcon: "fa-solid fa-chair",

    stingers: [
      "The dice are yours…",
      "Fortune favors the bold.",
      "The table watches. Roll well.",
      "Trust your gut, adventurer.",
      "Luck be a lady tonight.",
      "The coin purse grows heavy…",
      "Will the gods smile on you?",
      "Show them what you're made of."
    ],

    riskWarnings: {
      warm: "Careful now…",
      hot: "The edge draws near…",
      critical: "One bad roll ends it all."
    },

    atmosphere: {
      LOBBY: [
        "Candlelight dances across worn wood.",
        "The barkeep polishes a glass, watching.",
        "The scent of pipe smoke and possibility fills the air.",
        "A warm hearth crackles somewhere behind you.",
        "Coins glint in the lamplight, waiting."
      ],
      PLAYING: [
        "Someone's coin purse will be lighter tonight.",
        "The candle sputters. Someone at this table is lying.",
        "A tankard slams down somewhere nearby.",
        "The air grows thick with anticipation.",
        "All eyes on the dice.",
        "Nervous laughter echoes in the rafters.",
        "The wood groans under the weight of fortune."
      ],
      PAYOUT: [
        "Gold changes hands. Such is the game.",
        "The victor grins. The losers reach for ale.",
        "Another round? The night is still young.",
        "The table sighs. Until next time."
      ]
    }
  },

  "goblin-den": {
    subtitle: "Cheat. Steal. Survive.",
    icon: "fa-solid fa-skull",
    emptyTitle: "A Grimy Table",
    emptyText: "Nobody's here. Good. More loot for you.",
    emptyIcon: "fa-solid fa-bone",

    stingers: [
      "ROLL, MEAT!",
      "The goblins are watching…",
      "Don't die! …Or do. We don't care.",
      "Goblins MAKE their own luck.",
      "Hit it or eat it!",
      "The rat king demands entertainment!",
      "Greedy, greedy…",
      "YOUR TURN, WORM!"
    ],

    riskWarnings: {
      warm: "Getting greedy, are we?",
      hot: "DEATH IS CLOSE!",
      critical: "YOU'RE GONNA DIE! (Probably)"
    },

    atmosphere: {
      LOBBY: [
        "Something drips from the ceiling. Don't look up.",
        "A goblin picks its teeth with a bone.",
        "The stench of swamp rot fills the air.",
        "Rats scurry beneath the table.",
        "The dice are sticky. Best not to ask why."
      ],
      PLAYING: [
        "The goblins screech with glee.",
        "Someone just stole your drink.",
        "The dice smell like… you don't want to know.",
        "A goblin bites a coin to check if it's real.",
        "You hear sharpening sounds under the table.",
        "Is that blood on the dice? …Don't ask.",
        "A rat steals a coin. Nobody notices. Or cares."
      ],
      PAYOUT: [
        "GOLD! SHINY SHINY GOLD!",
        "The loser gets tossed in the swamp.",
        "Time to count your stolen loot.",
        "More! More games! MORE GOLD!"
      ]
    }
  },

  "underdark": {
    subtitle: "Where Shadows Play for Keeps",
    icon: "fa-solid fa-spider",
    emptyTitle: "An Empty Parlor",
    emptyText: "The crystal table hums with dormant magic.",
    emptyIcon: "fa-solid fa-gem",

    stingers: [
      "The shadows whisper your name…",
      "Cast your fate into the void.",
      "The Faerzress stirs…",
      "Even the darkness is watching.",
      "The web tightens…",
      "Roll with purpose, surfacer.",
      "The drow do not forgive poor play.",
      "Darkness favors the cunning."
    ],

    riskWarnings: {
      warm: "The shadows grow longer…",
      hot: "The void hungers for you.",
      critical: "Madness beckons at the edge."
    },

    atmosphere: {
      LOBBY: [
        "Bioluminescent spores drift lazily overhead.",
        "Crystal formations pulse with inner light.",
        "The silence of the deep presses in.",
        "Something ancient watches from the dark.",
        "The Underdark does not forgive the careless."
      ],
      PLAYING: [
        "A distant scream echoes through the tunnels.",
        "The fungal light pulses like a heartbeat.",
        "Whispers in Deep Speech circle the table.",
        "Shadows dance where no light falls.",
        "The spider silk curtains tremble.",
        "Faerzress crackles at the edge of perception.",
        "The darkness breathes. You are not alone."
      ],
      PAYOUT: [
        "The darkness takes its tithe.",
        "Even in the Underdark, gold gleams.",
        "Another game survived. For now.",
        "The shadows recede… temporarily."
      ]
    }
  },

  "gilded-dragon": {
    subtitle: "Where Fortunes Rise & Empires Fall",
    icon: "fa-solid fa-dragon",
    emptyTitle: "The Dragon's Table",
    emptyText: "Only those with gold to burn dare sit here.",
    emptyIcon: "fa-solid fa-crown",

    stingers: [
      "The empire watches your every move.",
      "Roll like a king!",
      "Gold calls to gold…",
      "Show them your worth, highroller.",
      "The dragon stirs in its hoard…",
      "Fortune favors the audacious!",
      "Wealth is power. Seize it.",
      "Your legacy is written in gold."
    ],

    riskWarnings: {
      warm: "The dragon stirs…",
      hot: "Flames lick at your fortune!",
      critical: "THE DRAGON WAKES!"
    },

    atmosphere: {
      LOBBY: [
        "Silk curtains billow in unseen wind.",
        "A servant refills crystal goblets in silence.",
        "Gold leaf catches the firelight above.",
        "The scent of dragonsblood incense fills the room.",
        "This table has ruined kings. And crowned them."
      ],
      PLAYING: [
        "Firelight dances across mountains of gold.",
        "The stakes rise. The empire holds its breath.",
        "Rubies glint in the chandelier above.",
        "A noble's hand trembles over their purse.",
        "The dragon's eye flickers open… then shuts.",
        "Someone's fortune dies here tonight.",
        "The weight of gold bends the table."
      ],
      PAYOUT: [
        "The victor's crown gleams ever brighter.",
        "Gold flows like dragon's blood.",
        "The high-rollers demand another round.",
        "Empires rise and fall at this table."
      ]
    }
  },

  "feywild": {
    subtitle: "A Whimsical Wager Under Starlight",
    icon: "fa-solid fa-wand-sparkles",
    emptyTitle: "A Moonlit Table",
    emptyText: "The pixies are waiting. They love a good game.",
    emptyIcon: "fa-solid fa-hat-wizard",

    stingers: [
      "The stars align for you…",
      "Make a wish, darling!",
      "The fey watch with unbridled glee!",
      "Fortune dances on butterfly wings…",
      "The moonlight guides your hand…",
      "What a delightful gamble!",
      "The Archfey smiles upon you. …Maybe.",
      "Chaos is half the fun, dear."
    ],

    riskWarnings: {
      warm: "The flowers wilt slightly…",
      hot: "The pixies gasp!",
      critical: "The Archfey holds their breath…"
    },

    atmosphere: {
      LOBBY: [
        "Fireflies trace patterns only the fey can read.",
        "The moon hums a lullaby you almost remember.",
        "Flower petals drift on an impossible breeze.",
        "A satyr tunes a lute in the shadows.",
        "The garden shimmers between worlds."
      ],
      PLAYING: [
        "Pixie dust settles on the dice.",
        "A satyr hums a gambling song nearby.",
        "The moon winks. Did you see that?",
        "Mushrooms glow brighter as bets increase.",
        "Something giggles from inside the flowers.",
        "Time moves strangely here. Roll with it.",
        "The dice sprout tiny wings… then settle."
      ],
      PAYOUT: [
        "The fey applaud! How delightful!",
        "Moonlight gold is the sweetest prize.",
        "The garden blooms for the victor.",
        "What fun! Let's do it again!"
      ]
    }
  }
};

/**
 * Get flavor data for the current theme
 * @param {string} themeId
 * @returns {Object} Complete theme flavor data
 */
export function getThemeFlavor(themeId) {
  return THEMES[themeId] || THEMES["sword-coast"];
}

/**
 * Get a random turn stinger for the theme
 * @param {string} themeId
 * @returns {string}
 */
export function getRandomStinger(themeId) {
  const flavor = getThemeFlavor(themeId);
  const stingers = flavor.stingers;
  return stingers[Math.floor(Math.random() * stingers.length)];
}

/**
 * Get a pseudo-stable atmosphere line that rotates every ~30 seconds
 * Uses time-based selection so it doesn't flicker on re-renders.
 * @param {string} themeId
 * @param {string} gameStatus - LOBBY, PLAYING, PAYOUT, etc.
 * @returns {string|null}
 */
export function getAtmosphereLine(themeId, gameStatus) {
  const flavor = getThemeFlavor(themeId);

  // Map game status to atmosphere category
  let category = "LOBBY";
  if (["PLAYING", "INSPECTION", "DUEL", "REVEALING"].includes(gameStatus)) {
    category = "PLAYING";
  } else if (gameStatus === "PAYOUT") {
    category = "PAYOUT";
  }

  const lines = flavor.atmosphere[category];
  if (!lines || lines.length === 0) return null;

  // Pseudo-stable: select based on 30-second intervals
  // This prevents flickering on every re-render while still rotating
  const interval = Math.floor(Date.now() / 30000);
  return lines[interval % lines.length];
}

/**
 * Get themed risk warning text
 * @param {string} themeId
 * @param {string} level - "warm", "hot", "critical"
 * @returns {string|null}
 */
export function getRiskWarning(themeId, level) {
  if (!level) return null;
  const flavor = getThemeFlavor(themeId);
  return flavor.riskWarnings[level] || null;
}
