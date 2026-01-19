# **Comprehensive Technical Reference for FoundryVTT Module Architecture: Tavern Dice Games (D\&D 5e)**

## **Executive Summary and Architectural Philosophy**

This technical reference document serves as the definitive architectural blueprint for the development of "Tavern Dice Master," a Foundry Virtual Tabletop (FoundryVTT) module designed to simulate complex gambling and dice games within the Dungeons & Dragons 5th Edition (dnd5e) system. The target audience for this document comprises automated coding assistants and senior developers requiring exhaustive context on API contracts, state management patterns, and system integration points.  
The development of a multiplayer, state-dependent module within FoundryVTT requires a rigid adherence to the "GM-as-Server" architectural pattern. Unlike traditional web applications where a central server holds authority, FoundryVTT distributes the application across client browsers, with the Game Master (GM) client acting as the closest approximation to an authoritative server for trusted logic execution. This necessitates a sophisticated network layer using socketlib to bridge the gap between player intent (e.g., "I want to bet 50 gold") and authorized execution (e.g., "Update the world state to reflect a 50 gold bet").  
Furthermore, the module must interact deeply with the dnd5e system's data models, which have undergone significant restructuring in recent versions (v3.0+). Reliance on legacy data paths will result in critical failures. This document explicitly defines the modern Data Model paths for currency and actor data, ensuring future-proof code generation. Finally, the visual component—translating abstract random number generation into 3D physics simulations via the Dice So Nice\! API—is treated as a core functional requirement rather than a cosmetic addition, driving user engagement and feedback loops.

## **1\. Module Infrastructure and Environment Configuration**

The foundational stability of any FoundryVTT module rests upon its directory structure, manifest configuration, and build pipeline. For a module of this complexity, involving custom user interfaces, rigid type safety for betting logic, and asset management, a structured development environment is mandatory.

### **1.1 The Module Manifest (module.json)**

The module.json file serves as the strict registry entry for the FoundryVTT core loader. It is not merely a metadata file; it defines the execution environment, dependency tree, and compatibility boundaries of the software.\[1\]

#### **1.1.1 Critical Identity Fields**

The id field is the namespace key for the entire module. It must be a unique, hyphen-separated string (kebab-case). This ID is programmatically referenced in Hooks, Flags, Settings, and Templates. Changing this ID post-development requires a complete data migration for users, making its initial selection critical.

* **Field:** id  
* **Value:** tavern-dice-master (Recommended)  
* **Implication:** All CSS classes should use .tavern-dice-master as a root selector to prevent style leakage. All localization keys should start with TAVERN-DICE.

#### **1.1.2 Script Loading Strategy (esmodules)**

Modern FoundryVTT development (V12+) mandates the use of ES Modules (ESM) over standard scripts. The esmodules field accepts an array of paths relative to the module root.

* **Field:** esmodules  
* **Value:** \["scripts/main.js"\]  
* **Technical Justification:** ES Modules allow for the use of import and export syntax, enabling a modular codebase where game logic, UI rendering, and socket handlers are separated into distinct files. This also enables Top-Level Await, which is beneficial for initialization routines that must wait for system readiness.\[2\]

#### **1.1.3 Dependency Management (relationships)**

The module relies on external libraries for core functionality. These must be declared in the relationships object to ensure the Foundry package manager enforces their installation.\[1, 3\]

| Relationship Type | ID | Reason for Dependency |
| :---- | :---- | :---- |
| **System** | dnd5e | The module interacts directly with actor.system.currency. Compatibility must be set to a minimum of 3.0.0 to ensure the Data Model exists. |
| **Module** | socketlib | **Critical.** The module cannot function without this library. It handles the remote execution of GM-privileged functions. |
| **Module** | dice-so-nice | Optional but highly recommended. The module should detect its presence via game.modules.get('dice-so-nice')?.active rather than requiring it strictly, to allow for lightweight usage. |

#### **1.1.4 Compatibility Definition**

To prevent the module from loading in environments where the API surface area is insufficient, the compatibility object must be strictly defined.\[1\]  
"compatibility": {  
    "minimum": "12",  
    "verified": "12.331"  
}

### **1.2 Directory Structure and Asset Organization**

The physical file structure must separate concerns. Coding assistants should generate code assuming the following hierarchy, which aligns with the standard Boilerplate project structure.\[1, 4, 5\]

| Path | Description | Access Pattern |
| :---- | :---- | :---- |
| module.json | Root manifest. | game.modules.get("id") |
| scripts/ | Compiled JavaScript files. | Loaded via esmodules. |
| scripts/games/ | Game-specific logic (e.g., liars-dice.js). | Imported by main entry point. |
| styles/ | CSS or SCSS stylesheets. | Loaded via styles manifest array. |
| templates/ | Handlebars (.hbs) HTML structures. | Accessed via renderTemplate(). |
| languages/ | JSON localization files. | Loaded via languages manifest array. |
| assets/ | Static media (images, sounds). | Referenced via relative URL string. |
| packs/ | Compendium packs (Items, Tables). | Loaded via packs manifest array. |

### **1.3 Build Pipeline Configuration (Vite & TypeScript)**

Given the complexity of state management in gambling games, TypeScript is recommended to prevent type-coercion errors (e.g., treating "50" gold as a string instead of a number). Vite serves as the standard bundler, offering Hot Module Replacement (HMR) for rapid UI iteration.\[2, 6\]

#### **1.3.1 vite.config.ts Specification**

The build tool must act as a proxy server. When developing locally, the browser requests the module's files from the Vite server (port 30001), while all other requests (core Foundry scripts, dnd5e system files, assets) are proxied to the running Foundry instance (port 30000).  
**Critical Configuration Parameters:**

1. **base**: Must be set to /modules/tavern-dice-master/. This ensures that dynamic imports and asset references resolve correctly relative to the Foundry web root, not the file system root.  
2. **proxy**: The regex ^(?\!/modules/tavern-dice-master) directs traffic. If the request is *not* for this module, send it to localhost:30000.  
3. **socket.io**: The WebSocket connection must be explicitly proxied (ws: true). If this is omitted, socketlib will fail to connect in the dev environment, breaking all multiplayer logic.\[6\]

#### **1.3.2 tsconfig.json and Type Definitions**

The coding assistant must utilize the @league-of-foundry-developers/foundry-vtt-types package. The tsconfig.json should include:

* "types": \["vite/client", "jquery"\]: To support global variables exposed by Foundry.  
* "target": "ES2022": To support high-level features like static class fields used in ApplicationV2.

## **2\. The Core API and Application Lifecycle**

Understanding the FoundryVTT boot sequence is essential for registering settings and hooks at the correct moment. Initializing too early results in "System not ready" errors; initializing too late can miss critical rendering cycles.

### **2.1 The Hook Lifecycle**

Foundry emits global events known as Hooks. The tavern module must intervene at specific points.\[7, 8\]

#### **2.1.1 init (Initialization)**

This hook fires as soon as the module scripts are loaded. The game world is not yet ready.

* **Action:** Register game.settings.  
* **Action:** Preload Handlebars templates (loadTemplates).  
* **Action:** Register custom Handlebars helpers (Handlebars.registerHelper).  
* **Constraint:** Do not attempt to access Actors, Items, or Users here. They do not exist yet.

#### **2.1.2 socketlib.ready**

This is a proprietary hook fired by the socketlib module.

* **Action:** Register the module with the socket registry.  
* **Action:** Bind static class methods (e.g., GameManager.handleBet) to socket names.

#### **2.1.3 ready (Game Ready)**

This hook fires when the VTT is fully initialized, the canvas is drawn, and data is available.

* **Action:** Check for the existence of the "Game State" macro or flag. If it doesn't exist (first run), the GM client should create it.  
* **Action:** Initialize the TavernGameApp if the user closed the session with the window open (state restoration).  
* **Action:** Perform system compatibility checks (e.g., verify dnd5e version is \> 3.0).

### **2.2 User Interface Architecture: ApplicationV2**

Foundry V12 introduced ApplicationV2 (AppV2), a paradigm shift from the legacy FormApplication. AppV2 is designed for reactive, component-based rendering, which is ideal for a game interface that updates rapidly (e.g., watching a pot increase in real-time).\[9, 10\]

#### **2.2.1 Class Structure and Inheritance**

The main UI class, TavernApp, should extend HandlebarsApplicationMixin(ApplicationV2). This mixin provides the necessary logic to map \_prepareContext data to a .hbs file.  
**Static Configuration (DEFAULT\_OPTIONS):**

* **tag**: The HTML tag for the window (usually form or div).  
* **position**: Default width/height.  
* **actions**: A critical new feature. Instead of manually binding jQuery click listeners, AppV2 maps data-action attributes in HTML directly to class methods.

**Example Action Mapping:**  
static DEFAULT\_OPTIONS \= {  
  actions: {  
    bet: TavernApp.onBet,  
    fold: TavernApp.onFold,  
    roll: TavernApp.onRoll  
  }  
}

This pattern reduces memory leaks and ensures cleaner event delegation.\[10\]

#### **2.2.2 The Rendering Cycle (\_prepareContext)**

The getData method of V1 is replaced by \_prepareContext. This method is **asynchronous**.

* **Input:** options (rendering options).  
* **Process:** Fetch the global game state from the GM (via flags). Fetch the local user's balance. Compute derived state (e.g., isMyTurn, canAffordBet).  
* **Output:** A pure JSON object passed to Handlebars.

#### **2.2.3 Partial Re-rendering**

Tavern games have distinct phases: Lobby, Betting, Playing, Result. Instead of monolithic templates, use **Partials**.

* Define static PARTS in the class.  
* Call this.render({ parts: \["game-board"\] }) to update only the board while leaving the header/chat static. This is crucial for performance when 5+ players are spamming dice rolls.

### **2.3 Handlebars Templating**

The HTML structure defines the user experience. Foundry uses Handlebars, a logic-less templating engine. The coding assistant must utilize Foundry's built-in helpers to minimize client-side JavaScript.\[11, 12\]  
**Essential Helpers Table:**

| Helper | Syntax Example | Function | Application in Module |
| :---- | :---- | :---- | :---- |
| **localize** | {{localize "TAVERN.Bet"}} | Returns translated string. | All UI labels. |
| **checked** | {{checked isEnabled}} | checked attr if true. | Config toggles. |
| **selectOptions** | {{selectOptions list selected=val}} | \<option\> generator. | Game type selection dropdown. |
| **disabled** | {{disabled (not isMyTurn)}} | disabled attr if false. | Preventing out-of-turn actions. |
| **numberInput** | {{numberInput bet value=current}} | Standardized input. | Bet amount entry. |

**Conditionals:** Use {{\#if}} and {{\#unless}} to toggle UI states. For example, the "Join Game" button should only appear {{\#unless isJoined}}.

## **3\. Data Layer and Persistence Strategy**

In a persistent world like FoundryVTT, game state must survive a browser reload. If a player refreshes their page during a hand of poker, they must reconnect to the exact same state. This requires a robust data persistence strategy using **Flags**.

### **3.1 The Flags System (flags)**

Flags are key-value pairs stored directly on Foundry Documents (Actors, Users, Items, Macros). They are the database of the module. Accessing them is strictly scoped to the module ID defined in the manifest.\[13, 14\]

#### **3.1.1 Flag Scoping Rules**

* **API:** document.getFlag(scope, key) / document.setFlag(scope, key, value).  
* **Scope:** Must be tavern-dice-master. Using core or dnd5e will throw errors.  
* **Types:** Values can be primitives (string, number, boolean) or JSON objects. Complex objects are automatically serialized.

### **3.2 Game State Architecture**

The "Game State" is a complex object tracking the current status of the table. Since there is no "Global" document type that all players can write to, the architecture must designate a specific document as the **State Container**.

#### **3.2.1 The State Container Candidate**

* **Option A (Setting):** game.settings. *Pros:* Global. *Cons:* Slow, designed for config, pollutes the settings menu.  
* **Option B (GM User):** game.users.activeGM. *Pros:* Secure. *Cons:* Volatile if GM disconnects/relogs.  
* **Option C (Dedicated Macro):** A hidden Macro document named "TavernState". *Pros:* Persistent, permission-agnostic (players can read, GM can write), fast updates. **This is the recommended approach.**

#### **3.2.2 State Schema Definition**

The coding assistant should enforce the following TypeScript interface for the state object:  
interface TavernGameState {  
  version: number;  
  status: "LOBBY" | "BETTING" | "PLAYING" | "PAYOUT";  
  activeGame: string; // e.g., "liars-dice"  
  pot: number; // Total currency in play  
  turnOrder: string; // Array of User IDs  
  turnIndex: number; // Index of current player  
  players: Record\<string, PlayerState\>; // Map of UserID \-\> State  
  tableData: any; // Flexible payload for game-specific data (e.g., cards on table)  
}

interface PlayerState {  
  id: string;  
  name: string;  
  gold: number; // Snapshot of gold at start of game  
  currentBet: number;  
  hasFolded: boolean;  
  hand: number; // Private dice/card values (Hidden from client if possible)  
}

### **3.3 Atomic Transactions and Race Conditions**

When multiple players click "Bet" simultaneously, a race condition occurs. If Player A and Player B both read the Pot as 100, add 10, and write 110, the Pot becomes 110 instead of 120\.  
The Mutex Solution:  
Only the GM client writes to the State Container.

1. **Request:** Player A sends socket event placeBet(10).  
2. **Queue:** GM receives event.  
3. **Process:** GM reads current Flag, adds 10, writes new Flag.  
4. Next: GM processes Player B's request.  
   This serialization guarantees data integrity.

## **4\. D\&D 5e System Integration (v3.0+)**

Deep integration with the dnd5e system creates a seamless experience. This involves reading character data, deducting currency, and creating chat cards that match the system's aesthetic.

### **4.1 The Actor Data Model**

In version 3.0 of the dnd5e system, the data structure for Actors migrated to a Data Model. Legacy paths like actor.data.data.currency are **deprecated** and will fail. The correct path is actor.system.\[4, 15\]

#### **4.1.1 Currency Data Structure**

Currency is stored in actor.system.currency. It is an object with the following keys:

* cp: Copper Pieces  
* sp: Silver Pieces  
* ep: Electrum Pieces (Often unused, but must be handled)  
* gp: Gold Pieces  
* pp: Platinum Pieces

The Currency Conversion Problem:  
Tavern games usually operate on a "Standard Denomination" (e.g., Gold). If a player has 0gp but 10pp, they technically have enough money. The module must either:

1. **Simple Mode:** Only allow betting from the gp pool.  
2. Complex Mode: Convert all currency to a base value (copper value), deduct the bet, and convert back.  
   Recommendation: Stick to Simple Mode (GP only) for the MVP to reduce complexity and edge cases where players complain about unwanted platinum conversion.\[16\]

#### **4.1.2 Modifying Actor Data**

To deduct a bet, the module must use the actor.update() method.  
**Correct Update Syntax:**  
// DEDUCT 50 GOLD  
const actor \= game.actors.get(actorId);  
const current \= actor.system.currency.gp;  
await actor.update({  
    "system.currency.gp": current \- 50  
});

*Warning:* Passing the object { system: { currency: { gp: val } } } performs a recursive merge. Passing { "system.currency": { gp: val } } might overwrite the other denominations if not careful. The dot-notation key "system.currency.gp" is the safest, most atomic update method.\[17\]

### **4.2 Chat Message Integration**

The module should output game events (wins, losses, rolls) to the Chat Log. To mimic dnd5e styling, the HTML content of the message should use the system's CSS classes.  
**CSS Classes:** .dnd5e, .chat-card, .card-header, .card-content.  
**Template Example:**  
\<div class="dnd5e chat-card"\>  
    \<header class="card-header"\>  
        \<img src="{{img}}" /\>  
        \<h3\>{{title}}\</h3\>  
    \</header\>  
    \<div class="card-content"\>  
        {{message}}  
    \</div\>  
\</div\>

Sending this via ChatMessage.create() ensures the log feels integrated.\[18\]

## **5\. Network Layer and Trusted Execution (Socketlib)**

The "GM-as-Server" architecture relies on socketlib to tunnel commands from unprivileged players to the privileged GM client.\[19, 20\]

### **5.1 Socket Registration Pattern**

The socket must be registered once, during the socketlib.ready hook. The registry returns an object that exposes the execution methods.  
// scripts/socket.js  
export let tavernSocket;

export function setupSockets() {  
    tavernSocket \= socketlib.registerModule("tavern-dice-master");  
    tavernSocket.register("handleBet", handleBet);  
    tavernSocket.register("playerAction", playerAction);  
    tavernSocket.register("updateUI", updateUI);  
}

### **5.2 Execution Flows**

#### **5.2.1 executeAsGM**

This is the workhorse of the module. When a player clicks "Hit" in Blackjack:

1. UI calls tavernSocket.executeAsGM("playerAction", "hit", userId).  
2. Socketlib finds an active GM.  
3. GM client runs logic: Draws a card, updates State Flag.  
4. Foundry Core syncs Flag to all clients.  
5. UI updates reactively.

#### **5.2.2 executeForEveryone**

Used for audio-visual synchronization.

* **Scenario:** A player wins the jackpot.  
* **Action:** GM calls tavernSocket.executeForEveryone("playWinSound").  
* **Result:** Every connected client plays the coin-clink sound effect simultaneously.

#### **5.2.3 Handling "No GM Connected"**

The module must detect if a GM is active.

* **Check:** game.users.activeGM.  
* **UI Feedback:** If null, the UI should lock all interaction buttons and display: *"Tavern requires a Game Master to supervise the table."*  
* **Reasoning:** Without a GM, executeAsGM requests will hang indefinitely or timeout, causing a poor user experience.

## **6\. Dice Mechanics and 3D Visualization**

The Roll class handles the mathematics, while Dice So Nice\! (DSN) handles the visuals. The integration of these two is what sells the "Tavern" experience.\[21, 22\]

### **6.1 The Roll API (Async Architecture)**

Foundry V12 treats rolls as asynchronous operations. The Roll class parses formulas (e.g., 2d6 \+ 5\) and generates results via evaluate().  
**Standard Workflow:**  
const r \= new Roll("2d6");  
await r.evaluate(); // MUST await  
console.log(r.total); // 7  
console.log(r.terms.results); // \[{result: 3, active: true}, {result: 4, active: true}\]

For tavern games like Liar's Dice, the total is often irrelevant. The logic needs the individual face values (r.terms.results).

### **6.2 Dice So Nice\! Integration**

DSN intercepts standard chat rolls to show 3D dice. However, in a game logic loop, we often generate Roll objects *without* printing to chat (e.g., the Dealer's hidden hand). To show these dice (or hide them), we interact with the game.dice3d API.\[21, 23\]

#### **6.2.1 The showForRoll Method**

This method manually triggers the 3D animation for a specific Roll object.  
Parameters:  
game.dice3d.showForRoll(roll, user, synchronize, whisper, blind)

* **roll**: The evaluated Roll instance.  
* **user**: The User instance who "threw" the dice.  
* **synchronize**: true (Everyone sees the animation) or false (Only local).  
* **whisper**: Array of User IDs. If set, only these users see the 3D dice. This is **critical** for hidden hands.  
* **blind**: If true, the dice appear as question marks or generic tokens to others.

#### **6.2.2 Hiding Dice (Secret Rolls)**

For Liar's Dice, players roll secretly.

* **Logic:** Player A rolls.  
* **DSN Call:** showForRoll(roll, playerA, true, \[playerA.id\]).  
* **Result:** Player A sees the 3D roll. Other players see Player A's avatar roll dice, but the dice themselves might be ghosted or invisible depending on DSN settings.

### **6.3 Game-Specific Dice Logic**

#### **6.3.1 Poker Dice**

If the module supports Poker Dice (9, 10, J, Q, K, A), standard d6 logic fails.

* **Solution:** Use a RollTable or mapped integers.  
* **Mapping:** 1=9, 2=10, 3=J, 4=Q, 5=K, 6=A.  
* **Display:** Custom DSN texture required, or translation in the chat card ({{\#ifEq val 6}}Ace{{/ifEq}}).

#### **6.3.2 Blackjack (Cards as Dice)**

Simulating cards with dice (d52 or d13) is imprecise due to deck depletion (drawing an Ace reduces the chance of drawing another).

* **Recommendation:** Do not use Roll for the logic. Use a JavaScript array \[A, 2, 3... K\] representing the deck. Shuffle it.  
* **Visuals:** Use DSN's "Card" preset if available, or skip 3D dice for Blackjack and use 2D card UI elements instead.

## **7\. Game Logic Implementation Strategies**

This chapter provides the algorithmic logic for the specific games requested.

### **7.1 The State Machine Pattern**

All gambling games follow a Finite State Machine (FSM).

1. **LOBBY:** Players join (socket.join).  
2. **ANTE:** Players lock bets (socket.bet).  
3. **LOOP:** Turn-based actions.  
4. **RESOLVE:** Comparison and payout.  
5. **CLEANUP:** Reset state.

### **7.2 Liar's Dice (Perudo) Logic**

Data Structure:  
Each player has a cup (array of dice values).  
Global state tracks currentBid { quantity: 3, face: 5 }.  
**Turn Logic:**

1. **Bid:** Player increases Quantity OR Face.  
   * *Validation:* newQty \> oldQty OR (newQty \== oldQty AND newFace \> oldFace).  
2. **Challenge:** Player calls "Liar".  
   * *Resolution:* GM reveals ALL dice arrays. Counts the specific face (plus 1s if they are wild).  
   * *Comparison:* If Count \< Bid, Bidder loses a die. If Count \>= Bid, Challenger loses a die.

**Socket Events:**

* submitBid(qty, face)  
* callLiar()

### **7.3 High Rollers (Simple Craps)**

**Logic:**

1. Player bets X gold.  
2. Player rolls 2d6.  
3. **Pass Line:** 7 or 11 wins (2x payout). 2, 3, 12 loses.  
4. **Point:** Any other number becomes the "Point".  
5. **Loop:** Player rolls until they hit the Point (Win) or 7 (Lose).

Payout Logic:  
When a win occurs, the GM calculates the total: bet \* 2\.

* *Action:* actor.update({"system.currency.gp": current \+ winnings}).  
* *Chat:* "Player wins 50gp\!"

## **8\. UX/UI Design and Polish**

The difference between a functional module and a great one is the "Juice"—the feedback, sound, and style.

### **8.1 CSS Architecture**

The module must inject a specific stylesheet.

* **Theme:** "Skeuomorphic Tavern". Wood grain backgrounds, gold borders, parchment text areas.  
* **Classes:**  
  * .tavern-card: The main container for chat results.  
  * .dice-tray: A flexbox container for holding dice icons.  
  * .bet-chip: Circular div representing currency.

**SCSS Example:**  
.tavern-dice-master {  
   .window-content {  
        background: url('../assets/wood-texture.jpg');  
        color: \#f0f0e0;  
        font-family: "Modesto Condensed", sans-serif;  
    }  
      
    button.place-bet {  
        background: \#4a0404; // Velvet red  
        border: 2px solid \#ffd700; // Gold  
        box-shadow: 0 0 5px \#000;  
    }  
}

### **8.2 Audio Feedback**

Sound triggers should be tied to State Transitions.

* **Bet Placed:** assets/sounds/coin-drop.mp3.  
* **Dice Rolling:** assets/sounds/dice-shake-loop.mp3 (play while waiting for result).  
* **Win:** assets/sounds/cheer.mp3.

Audio Implementation:  
Use AudioHelper.play() in the \_onRender hooks or in response to socket events. Ensure volume is controlled by the user's "Interface" volume slider settings in Foundry.

### **8.3 Accessibility (a11y)**

Foundry is a web app, and accessibility matters.

* **Tooltips:** All icons must have title attributes explaining their function.  
* **Color Blindness:** Do not rely solely on color (Red/Green) to indicate Turn/Not Turn. Use shape changes or explicit text ("YOUR TURN").  
* **Keyboard Nav:** Ensure tabindex is set on input fields so users can bet without a mouse.

## **9\. Development Workflow and Debugging**

### **9.1 Debugging Hooks**

To visualize the flow of the application during development, the developer should enable hook logging.

* **Console Command:** CONFIG.debug.hooks \= true.  
* **Utility:** This prints every hook fired to the console, allowing the developer to see exactly when updateActor fires relative to the socket message reception.

### **9.2 Git Workflow for Modules**

1. **Development:** Work in src/. Run npm run dev (Vite) to watch for changes.  
2. **Release:** Run npm run build. This populates dist/.  
3. **Versioning:** Update module.json version.  
4. **Tagging:** Create a Git Tag (e.g., v1.0.0).  
5. **Manifest Link:** The manifest field in module.json should point to the raw GitHub URL of the module.json file in the latest release, enabling Foundry's auto-update feature.

## **10\. Conclusion**

This reference document outlines the complete architectural requirements for the "Tavern Dice Master" module. By strictly adhering to the **ApplicationV2** rendering pattern, the **GM-as-Server** socket topology, and the **dnd5e v3.0 Data Models**, the generated code will be robust, secure, and maintainable. The integration of **Dice So Nice\!** and **Audio** feedback ensures the module meets the high standards of immersion expected by the FoundryVTT community. The coding assistants utilizing this guide should proceed sequentially: Infrastructure \-\> Socket Layer \-\> State Logic \-\> UI Implementation \-\> Polish.