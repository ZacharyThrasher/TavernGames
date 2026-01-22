# **Architecting the Next Generation: A Comprehensive Technical Specification for Premium Module Development in Foundry VTT Version 13 and D\&D 5e Version 5.2**

## **1\. Introduction: The Paradigm Shift in Virtual Tabletop Engineering**

The release of Foundry Virtual Tabletop (FVTT) Version 13 represents more than a mere iterative update; it signifies a fundamental restructuring of the platform's client-side architecture. For developers targeting the Dungeons & Dragons 5th Edition (dnd5e) system—itself undergoing a massive transformation with version 5.2 to accommodate the 2024 Core Rulebooks—the landscape of module development has shifted from ad-hoc scripting to rigorous software engineering.  
A "premium" module in this ecosystem is no longer defined solely by its feature set or asset quality. Instead, premium status is determined by architectural resilience, performance optimization, and deep integration with the core API's native capabilities. The era of monkey-patching core functions and relying on jQuery for DOM manipulation is effectively over. The new standard demands a mastery of ECMAScript Modules (ESM), the ApplicationV2 rendering engine, and the dnd5e Activity data model.  
This report provides an exhaustive technical analysis of the methodologies required to engineer high-end modules for this specific environment. It synthesizes documentation regarding the deprecation of legacy interfaces, the implementation of strictly typed data models, and the orchestration of "juicy" visual effects—screen shake, cut-ins, and particle systems—using Sequencer and the V13 Canvas API. The analysis prioritizes long-term maintainability, leveraging the strictest interpretations of the V13 API to future-proof development against the roadmap extending toward Version 15\.1 By adhering to these standards, developers can ensure their contributions not only function but enhance the tactile feel of the virtual tabletop, bridging the gap between static interfaces and dynamic video game experiences.

## **2\. Foundational Architecture: The V13 Runtime Environment**

The substrate upon which all V13 modules are built has hardened. The permissive JavaScript environment of previous versions, where global variable pollution was common and often necessary, has been replaced by a strictly scoped, modular runtime. Understanding this shift is the prerequisite for any premium development.

### **2.1 The Transition to Strict ECMAScript Modules (ESM)**

Foundry V13 completes the migration of its client-side codebase to strict ESM standards. Previously, the distinction between common (server-shared) and client (browser-only) code was largely a convention. In V13, this separation is enforced by the module loader and the API structure itself.1

#### **2.1.1 Namespace Hygiene and Scoping**

In legacy development (V9-V11), developers often relied on scripts creating global variables attached to the window object to share data between files. V13's ESM implementation mandates a "module-per-file" architecture where scope is contained within the file. Variables defined at the top level of a module are not globally accessible unless explicitly exported and imported.  
For a premium module, this necessitates a specific directory structure that mirrors the core software. Code should be separated into src/client and src/common. The entry point, defined in module.json as an ESM module (type: "module"), should serve as the orchestrator, importing functionality from discrete class files rather than executing a linear script.1  
This architectural constraint forces better encapsulation. A premium module should strictly avoid polluting the CONFIG or window namespaces except where absolutely necessary for library interoperability. Instead, the established pattern for exposing public API methods to other modules is to attach an api object to the module's instance within game.modules.

JavaScript

// Premium Pattern: Explicit API Exposure  
class CinematicCombat {  
    static get api() {  
        return {  
            triggerEffect: this.triggerEffect,  
            registerTheme: this.registerTheme  
        };  
    }  
}

Hooks.once('ready', () \=\> {  
    game.modules.get('cinematic-combat').api \= CinematicCombat.api;  
});

This pattern creates a contract with other developers, allowing the module to serve as a library (like Sequencer or socketlib) without risking namespace collisions.3

#### **2.1.2 Private Class Fields vs. Soft Privacy**

The V13 API documentation highlights a critical shift in how private properties are handled. Historically, Foundry used the underscore prefix (\_privateProperty) to denote internal methods that developers were discouraged from using but often accessed anyway. V13 introduces true JavaScript private class fields using the \# prefix (e.g., \#privateMethod).  
The implication for premium development is profound: attempting to access or override core \# properties will result in a hard syntax error, crashing the module.1 Developers can no longer rely on "soft" privacy to patch internal behavior. This necessitates a reliance on the public API and specifically registered Hooks. If a feature cannot be implemented without accessing a \# field, the premium approach is to request a new Hook from the system developers rather than attempting to bypass the language's access controls.

### **2.2 The Deprecation of jQuery and Legacy Patterns**

While jQuery remains bundled in V13 for backwards compatibility, the core API has moved decisively toward native DOM manipulation. ApplicationV2 instances return HTMLElement objects, not jQuery collections.4  
A premium module must minimize jQuery usage for three reasons:

1. **Performance:** Native DOM methods (querySelector, addEventListener) are faster and incur less memory overhead than wrapping elements in jQuery objects.  
2. **Compatibility:** Future versions of Foundry (V14+) will likely remove jQuery entirely from the default context. Writing native code now is a form of technical debt prevention.2  
3. **Integration:** The new ApplicationV2 lifecycle hooks provide HTMLElement arguments. Wrapping them back into jQuery adds unnecessary friction.

Developers should familiarize themselves with Element.closest(), Element.matches(), and the native PointerEvent interface, as these replace the most common jQuery patterns used in V10-V12 modules.4

## ---

**3\. The User Interface Engine: Mastering ApplicationV2**

The most visible change in V13 is the introduction of ApplicationV2 (AppV2), replacing the venerable Application and FormApplication classes. AppV2 is not a mere update; it is a completely new rendering engine designed for modern web standards, incorporating CSS layers, CSS variables, and a standardized component lifecycle.2

### **3.1 Lifecycle and Rendering Architecture**

Legacy applications relied on a synchronous getData() method to feed Handlebars templates. This often caused interface freezing if data retrieval required database operations. AppV2 introduces \_prepareContext(options), an asynchronous method that allows for non-blocking data fetching during the render cycle.4

#### **3.1.1 The Render State Machine**

AppV2 manages its existence through a strictly defined state machine: NONE, RENDERING, RENDERED, CLOSING, CLOSED, and ERROR.6 A premium module must respect these states. For instance, attempting to update the DOM while the application is in the RENDERING state can cause race conditions or visual jitter.  
The \_onRender(context, options) hook is the critical insertion point for "juice." Unlike the legacy activateListeners, which ran once after initial render, \_onRender runs every time the application updates. This requires developers to write idempotent DOM manipulation logic—ensuring that adding a class or an event listener doesn't duplicate functionality if the app re-renders.4

#### **3.1.2 Static Configuration and Merging**

Configuration in AppV2 is handled via the static DEFAULT\_OPTIONS property. This object is recursively merged with parent classes, allowing for granular control over window behavior without writing custom constructors.7  
For premium modules, the window configuration object is paramount. To create "cinematic" interfaces—such as cut-ins or overlays that break the traditional "windowed" look—developers must configure the frame and positioning logic explicitly.

JavaScript

static DEFAULT\_OPTIONS \= {  
    tag: "aside",  
    id: "cinematic-overlay",  
    window: {  
        frame: false,       // Removes the OS-style window chrome   
        positioned: true,   // Allows programmatic positioning  
        minimizable: false, // Prevents minimizing to the taskbar  
        controls:        // Removes header buttons (close, configure)  
    },  
    position: {  
        width: 500,  
        height: "auto"  
    }  
};

This configuration tells the rendering engine to inject the application as a raw HTML element, bypassing the standard window-app wrapper. This is essential for creating UI elements that feel like a native part of the game canvas rather than a floating dialog box.7

### **3.2 The Action System: Event Delegation**

One of the defining characteristics of legacy modules was the activateListeners method, often containing dozens of jQuery event bindings. This approach was memory-intensive and prone to memory leaks if listeners weren't explicitly removed.  
AppV2 introduces a declarative **Action** system. Developers define a map of actions in DEFAULT\_OPTIONS and assign data-action attributes in the HTML template.2

| Legacy Pattern (jQuery) | Premium Pattern (AppV2 Actions) |
| :---- | :---- |
| html.find('.btn').click(this.\_onClick.bind(this)) | HTML: \<button data-action="roll"\> |
| Manual event binding in activateListeners | static DEFAULT\_OPTIONS \= { actions: { roll: this.onRoll } } |
| Requires explicit cleanup | Automated delegation at the root level |

**Architectural Benefit:** The Action system utilizes event delegation. A single event listener is attached to the application's root element. When a user clicks a button, the event bubbles up, and the engine routes it to the correct handler based on the data-action attribute. For a module displaying a list of 50 spells, this replaces 50 individual listeners with one. This optimization is non-negotiable for premium modules targeting lower-end hardware.9

### **3.3 CSS Layers and Theming Variables**

V13 introduces the native CSS @layer rule, a standardized way to manage specificity. In previous versions, module developers often had to use \!important or high-specificity selectors (e.g., div\#app section.window-content.my-class) to override core styles. This led to "specificity wars" and fragile stylesheets.

#### **3.3.1 Implementing CSS Layers**

A premium module should define its own cascade layer to ensure its styles coexist peacefully with the core system and other modules.

CSS

@layer modules {  
   .cinematic-cut-in {  
        /\* Module styles here \*/  
    }  
}

By placing module styles within a layer, the developer explicitly defines their priority in the cascade relative to the system's "Theme V2." This ensures that if the core system updates its base styles, the module's intended overrides (or lack thereof) are respected without resorting to \!important hacks.4

#### **3.3.2 Consuming Core Variables**

D\&D 5.2 and V13 make extensive use of CSS custom properties (variables) for theming. A premium module must consume these variables rather than hardcoding colors. For example, using var(--dnd5e-color-crimson) instead of \#8B0000 ensures that the module visually integrates with the user's specific theme settings (e.g., "Dark Mode" or a high-contrast accessibility theme).4 Hardcoded colors are a marker of amateur development in the V13 era.  
The styling of form elements, particularly checkboxes, has shifted to using FontAwesome icons manipulated via ::before and ::after pseudo-elements.4 Premium modules creating custom character sheets or configuration dialogs must adopt this pattern to match the visual language of the 5.2 sheet.

## ---

**4\. Deep System Integration: D\&D 5e Version 5.2+**

Targeting the "latest" dnd5e system means building for version 5.2 and beyond. This version introduces the **Activity** architecture, which decouples the mechanics of an item (rolling, damage, saving throws) from the Item document itself.

### **4.1 The Activity Data Model**

In versions prior to 5.0, an Item document was a monolithic entity. A "Fireball" item contained all the data necessary to cast it, roll damage, and request a save. In 5.2, the Item document acts as a container for a Collection of **Activity** documents.10  
**The Architectural Shift:**

* **Item:** Physical representation (weight, price, description) and container.  
* **Activity:** Functional logic (Cast, Attack, Save, Heal, Utility).

A premium module must interact with Activities, not just Items. If a module intends to modify the damage of a spell, it must identify the specific *Activity* being used. An item might have multiple activities (e.g., a "Versatile" weapon with one activity for one-handed damage and another for two-handed).  
**Code Pattern for Activity Usage:**  
Legacy code calling item.roll() is deprecated or fundamentally changed. The premium pattern involves retrieving the activity collection:

JavaScript

const item \= actor.items.get(itemId);  
// Retrieve the specific activity (e.g., the primary attack)  
const activity \= item.system.activities.get(activityId);

if (activity) {  
    // Execute the activity's workflow  
    await activity.use({ event: originalEvent });  
}

This distinction is critical for "juice." A visual effect (like a sword swing animation) should be tied to the Attack activity, while a magical sound effect might be tied to a Cast activity. Failing to distinguish between these results in duplicate or inappropriate feedback.12

### **4.2 Hook Migration and Granularity**

With the Activity system comes a new suite of Hooks. The generic dnd5e.rollAbilitySave or dnd5e.rollAttack hooks have been refined or replaced to provide context about the Activity triggering the roll.  
**Key Hooks for Premium Integration:**

1. dnd5e.preUseActivity: Fires before any resource consumption or rolling logic. This is the ideal place to trigger "charging" animations or validate prerequisites.13  
2. dnd5e.useActivity: Fires after the usage is confirmed but before the chat card is finalized.  
3. dnd5e.rollAttack / dnd5e.rollDamage: These hooks now pass the Activity instance in their options or context.  
4. dnd5e.rollSavingThrow: Replaces legacy ability save hooks in the context of activity usage.12

**The Hooks.call Convention:** The system uses Hooks.call for interruptible workflows. A premium module listening to preUseActivity can return false to abort the action.14 This allows for the creation of mechanics like "Counterspell" or "Stunned" conditions that programmatically prevent usage. However, for visual effects modules, the best practice is passive listening—never return false unless the explicit intent is to stop the game logic.

### **4.3 Data Model Constraints and Enrichment**

D\&D 5.2 enforces strict TypeDataModel schemas. Attempting to inject arbitrary data into item.system (e.g., item.system.myCoolModuleData) will likely fail validation or be stripped during database compaction.15  
**Premium Data Handling:**

* **Flags:** Use document.setFlag('scope', 'key', value) for all module-specific data. This is the only safe place for persistent module data.  
* **Enrichers:** The 5.2 system allows for custom text enrichers (e.g., \[\[/check str\]\]) in chat cards and journals.16 A premium module should register its own enrichers to allow users to link module features in journal entries. For example, a "Cinematic Actions" module might register \[\[/cinematic shake\]\] to allow GMs to embed screen shake triggers directly into their adventure text.

## ---

**5\. Engineering "Juice": The Art of Visual Feedback**

"Juice" is the synthesis of visual and auditory feedback that makes an interface feel responsive and alive. In Foundry V13, "juice" is engineered using three primary tools: the **Sequencer** module (as a library), the **Canvas API**, and **CSS Transitions**.

### **5.1 The Sequencer Module as a Dependency**

While it is technically possible to write raw PIXI.js code to render video assets on the canvas, doing so creates significant technical debt. The Sequencer module has become the de facto standard library for visual effects in Foundry. A premium module should declare Sequencer as a dependency and leverage its fluent, method-chaining API.3

#### **5.1.1 Abstracting Assets with the Sequencer Database**

Hardcoding file paths (e.g., modules/jb2a\_patreon/Library/Generic/Explosion.webm) is a fragile practice. Users may use different asset packs or move files. The premium pattern utilizes the Sequencer.Database.18

JavaScript

// Premium Pattern: Database Abstraction  
new Sequence()  
   .effect()  
       .file(Sequencer.Database.getEntry("explosion", "fire")) // Abstract query  
       .atLocation(targetToken)  
       .scale(1.5)  
   .play();

This approach allows the module to function regardless of which specific animation module (JB2A, Jack Kerouac, etc.) the user has installed, provided they are registered in the database. It adheres to the principle of loose coupling.

#### **5.1.2 Synchronization and Method Chaining**

Premium "juice" requires timing. An impact sound must play exactly when the sword hits, not when the animation starts. Sequencer's .wait(), .delay(), and .sound() methods allow for precise orchestration.  
**Example Pipeline:**

1. **Pre-Roll:** Play "Charge" animation.  
2. **Roll Complete:** Stop "Charge."  
3. **Attack Hit:** Play "Swing" \-\> .wait(200) \-\> Play "Impact" & "Sound" \-\> Trigger Screen Shake.

### **5.2 Screen Shake and Canvas Pan Engineering**

Screen shake is a high-impact effect that must be implemented carefully to avoid disrupting the user experience or causing motion sickness.  
**Technical Implementation:** V13 allows shaking via canvas.animatePan or Sequencer wrappers. However, research identifies a critical bug where setting a shake frequency to 0 can cause the application to freeze.19  
**Input Sanitization:**  
A premium module must wrap shake logic in validation layers:

JavaScript

function triggerShake(strength, duration, frequency) {  
    // Safety clamp to prevent engine freeze  
    const safeFreq \= Math.max(1, frequency);   
    const safeDur \= Math.min(duration, 3000); // Cap at 3s to prevent annoyance

    canvas.animatePan({  
        x: canvas.stage.pivot.x \+ (Math.random() \* strength),  
        y: canvas.stage.pivot.y \+ (Math.random() \* strength),  
        duration: safeDur,  
        //... additional easing logic  
    });  
}

**UI vs. Map Shake:**  
A nuanced implementation distinguishes between shaking the *World* (Canvas) and shaking the *Interface* (UI).

* **Map Shake:** Best for in-game explosions (Meteor Swarm).  
* **UI Shake:** Best for taking damage. This is achieved by applying a CSS animation to the body or \#ui-right element, shifting it by a few pixels. This provides feedback without disorienting the player's spatial awareness of the grid.20

### **5.3 Cinematic Cut-Ins and Overlays**

"Cut-ins" (e.g., a character portrait sliding across the screen during a critical hit) require a hybrid approach of ApplicationV2 and CSS management.

#### **5.3.1 Frameless Application Windows**

To render a cut-in, the application must be stripped of its standard Foundry window frame. This is done via the window: { frame: false } configuration in DEFAULT\_OPTIONS.7 This renders the Handlebars template directly into the DOM, allowing for arbitrary shapes (like a jagged persona-style cutout).

#### **5.3.2 The pointer-events Solution**

A major technical challenge with overlays is the "click-through" problem. If a transparent overlay covers the screen, it blocks mouse interaction with the canvas below.  
**The CSS Solution:** A premium module handles this via precise CSS pointer-events management.21

1. **Container:** The Application's root element must have pointer-events: none;. This makes the container "invisible" to the mouse, passing clicks through to the canvas.  
2. **Content:** Interactive elements *within* the cut-in (like a "Dismiss" button) must explicitly set pointer-events: auto;.

CSS

\#cinematic-overlay {  
    pointer-events: none; /\* Pass-through \*/  
    width: 100vw;  
    height: 100vh;  
    position: fixed;  
    top: 0;  
    left: 0;  
    z-index: var(--z-index-tooltip); /\* Sit above mostly everything \*/  
}

\#cinematic-overlay.cut-in-image {  
    pointer-events: none; /\* Image is purely visual \*/  
}

\#cinematic-overlay.dismiss-btn {  
    pointer-events: auto; /\* Button catches clicks \*/  
    cursor: pointer;  
}

This technique allows the visual "juice" to occupy the entire screen without interrupting gameplay flow—a hallmark of professional UI design.

### **5.4 Particle Effects via Canvas Layers**

V13's Canvas API exposes PlaceablesLayer and EffectsCanvasGroup.24 To add particle effects (like smoke or sparks) that live in the world space, developers should not append directly to the DOM. Instead, they must add PIXI.Container or PIXI.Emitter instances to the specific canvas layer (usually canvas.fx or canvas.interface).  
**Optimization:**  
Particle emitters are expensive. A premium module must listen for the canvas.tearDown hook (fired when changing scenes) to explicitly destroy emitters. Failing to do so causes memory leaks that degrade performance over time, a common flaw in amateur modules.

## ---

**6\. Development Best Practices and Tooling**

Code quality is the invisible backbone of a premium module. V13 requires a compiled workflow to manage the complexity of ESM and TypeScript.

### **6.1 TypeScript Integration**

The dnd5e system provides comprehensive type definitions (dnd5e.d.ts). Using TypeScript allows for autocomplete on the new DataModels (e.g., correctly suggesting system.attributes.hp.value and warning if you try system.hp). This drastically reduces runtime errors related to property path typos.25  
**Workflow:**

* Use vite for building. It supports native ESM output and Hot Module Replacement (HMR).  
* Configure tsconfig.json to include foundry-vtt-types.

### **6.2 Error Handling and "Errors and Echoes"**

Premium modules fail gracefully. They do not crash the canvas because a sound file is missing.  
**The libWrapper Pattern:** If the module needs to modify core functionality (e.g., intercepting the attack roll to add a bonus), it *must* use libWrapper.26 Monkey-patching Actor.prototype.prepareData directly is strictly forbidden in premium development as it creates incompatibilities with other modules.  
**Contextual Error Reporting:** Implement try...catch blocks inside Hook callbacks. If the "juice" logic fails, the catch block should log the error (using console.error or the Errors and Echoes library API if available) but allow the core game logic to proceed. The player should still roll their attack even if the explosion animation failed to load.13

### **6.3 Performance Optimization**

Foundry users run the software on a wide range of hardware ("Potato PCs" vs. Gaming Rigs).  
**Strategies:**

1. **Debouncing:** If a Fireball hits 10 goblins, the rollDamage hook might fire 10 times instantly. Debounce the screen shake logic so the screen shakes once, not 10 times in 10 milliseconds.  
2. **Settings:** Provide a "Performance Mode" setting. This toggles off particle effects and simplifies animations for users on lower-end hardware.9  
3. **Asset Preloading:** Use AudioHelper.preloadSound() or TextureLoader.load() during the ready hook to ensure assets used in cut-ins are available immediately, preventing "pop-in."

## ---

**7\. Implementation Strategy: The "Juice" Pipeline**

To synthesize these concepts, consider the implementation of a **"Critical Hit Cinematic"** feature.  
**1\. Detection (The Hook):**  
The module listens to dnd5e.rollAttack. Inside the handler, it checks result.isCritical.  
**2\. Data Preparation (The Activity):**  
It retrieves the Activity image (the weapon icon) and the Actor image. It checks if the activity is a spell or weapon to select the correct background theme.  
**3\. Execution (The Sequence):**

* **Audio:** Triggers a "Critical" sound effect via Sequencer.  
* **Visual:** Instantiates the Frameless ApplicationV2 Overlay. CSS animations slide the actor's portrait in from the left and the weapon icon from the right.  
* **Impact:** Triggers a canvas.animatePan shake (low duration, high intensity).  
* **Cleanup:** A setTimeout or animation event listener automatically calls app.close() on the overlay after 2 seconds.

**4\. Safety:**  
The entire block is wrapped in a try...catch. If the overlay fails to render, the critical hit is still logged to chat, ensuring gameplay continuity.

## ---

**8\. Conclusion**

Coding a premium Foundry VTT V13 module for D\&D 5.2 is an exercise in architectural discipline. It requires abandoning the loose, jQuery-heavy practices of the past in favor of the structured ApplicationV2 lifecycle and strict ESM scoping. It demands a deep understanding of the dnd5e Activity model to hook workflows correctly. Finally, it requires the artistic layering of Sequencer effects, Canvas manipulation, and CSS styling to create "juice."  
By adhering to these standards—strict typing, activity-based hooks, frameless overlays, and robust error handling—developers can create modules that not only look spectacular but remain stable and maintainable as the Foundry ecosystem continues to evolve.

#### **Works cited**

1. API Documentation \- Version 13 \- Foundry Virtual Tabletop, accessed January 22, 2026, [https://foundryvtt.com/api/](https://foundryvtt.com/api/)  
2. ApplicationV2 | Foundry VTT Community Wiki, accessed January 22, 2026, [https://foundryvtt.wiki/en/development/api/applicationv2](https://foundryvtt.wiki/en/development/api/applicationv2)  
3. Sequencer | Foundry Virtual Tabletop, accessed January 22, 2026, [https://foundryvtt.com/packages/sequencer](https://foundryvtt.com/packages/sequencer)  
4. ApplicationV2 Conversion Guide | Foundry VTT Community Wiki, accessed January 22, 2026, [https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)  
5. ApplicationV2 | Foundry Virtual Tabletop \- API Documentation, accessed January 22, 2026, [https://foundryvtt.com/api/v12/classes/foundry.applications.api.ApplicationV2.html](https://foundryvtt.com/api/v12/classes/foundry.applications.api.ApplicationV2.html)  
6. DocumentSheetV2 | Foundry Virtual Tabletop \- API Documentation, accessed January 22, 2026, [https://foundryvtt.com/api/classes/foundry.applications.api.DocumentSheetV2.html](https://foundryvtt.com/api/classes/foundry.applications.api.DocumentSheetV2.html)  
7. ApplicationV2 | Foundry Virtual Tabletop \- API Documentation, accessed January 22, 2026, [https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)  
8. ApplicationWindowConfiguration \- API Documentation \- Version 13, accessed January 22, 2026, [https://foundryvtt.com/api/interfaces/foundry.applications.types.ApplicationWindowConfiguration.html](https://foundryvtt.com/api/interfaces/foundry.applications.types.ApplicationWindowConfiguration.html)  
9. Foundry Best-Practices? : r/FoundryVTT \- Reddit, accessed January 22, 2026, [https://www.reddit.com/r/FoundryVTT/comments/mxlc2v/foundry\_bestpractices/](https://www.reddit.com/r/FoundryVTT/comments/mxlc2v/foundry_bestpractices/)  
10. Releases · foundryvtt/dnd5e \- GitHub, accessed January 22, 2026, [https://github.com/foundryvtt/dnd5e/releases](https://github.com/foundryvtt/dnd5e/releases)  
11. foundryvtt/dnd5e: An implementation of the 5th Edition ... \- GitHub, accessed January 22, 2026, [https://github.com/foundryvtt/dnd5e](https://github.com/foundryvtt/dnd5e)  
12. More Activities | Foundry Virtual Tabletop, accessed January 22, 2026, [https://foundryvtt.com/packages/more-activities](https://foundryvtt.com/packages/more-activities)  
13. rayners/fvtt-errors-and-echoes \- GitHub, accessed January 22, 2026, [https://github.com/rayners/fvtt-errors-and-echoes](https://github.com/rayners/fvtt-errors-and-echoes)  
14. Hooks Listening & Calling | Foundry VTT Community Wiki, accessed January 22, 2026, [https://foundryvtt.wiki/en/development/guides/Hooks\_Listening\_Calling](https://foundryvtt.wiki/en/development/guides/Hooks_Listening_Calling)  
15. Document | Foundry VTT Community Wiki, accessed January 22, 2026, [https://foundryvtt.wiki/en/development/api/document](https://foundryvtt.wiki/en/development/api/document)  
16. Add a hook for npc stat block embeds · Issue \#4827 · foundryvtt/dnd5e, accessed January 22, 2026, [https://github.com/foundryvtt/dnd5e/issues/4827](https://github.com/foundryvtt/dnd5e/issues/4827)  
17. Sequencer \- Foundry Hub, accessed January 22, 2026, [https://www.foundryvtt-hub.com/package/sequencer/](https://www.foundryvtt-hub.com/package/sequencer/)  
18. Sequencer Database Entries \- Foundry Virtual Tabletop, accessed January 22, 2026, [https://foundryvtt.com/packages/sequencer-database-entries](https://foundryvtt.com/packages/sequencer-database-entries)  
19. CanvasPan().shake() causes game freeze when frequency \= 0 \#265, accessed January 22, 2026, [https://github.com/fantasycalendar/FoundryVTT-Sequencer/issues/265](https://github.com/fantasycalendar/FoundryVTT-Sequencer/issues/265)  
20. Anyone know of a module that can shake the map? : r/FoundryVTT, accessed January 22, 2026, [https://www.reddit.com/r/FoundryVTT/comments/mlnw1r/anyone\_know\_of\_a\_module\_that\_can\_shake\_the\_map/](https://www.reddit.com/r/FoundryVTT/comments/mlnw1r/anyone_know_of_a_module_that_can_shake_the_map/)  
21. Click-Through Transparent Windows \[resolved\] · Issue \#1029 \- GitHub, accessed January 22, 2026, [https://github.com/SimulatedGREG/electron-vue/issues/1029](https://github.com/SimulatedGREG/electron-vue/issues/1029)  
22. Click through div to underlying elements \- css \- Stack Overflow, accessed January 22, 2026, [https://stackoverflow.com/questions/3680429/click-through-div-to-underlying-elements](https://stackoverflow.com/questions/3680429/click-through-div-to-underlying-elements)  
23. 14\_optimized.txt \- AdGuard \- adtidy.org, accessed January 22, 2026, [https://filters.adtidy.org/android/filters/14\_optimized.txt](https://filters.adtidy.org/android/filters/14_optimized.txt)  
24. Canvas Layers | Foundry Virtual Tabletop, accessed January 22, 2026, [https://foundryvtt.com/article/canvas-layers/](https://foundryvtt.com/article/canvas-layers/)  
25. Intro To Foundry Module Development \- Bringing Fire, accessed January 22, 2026, [https://bringingfire.com/blog/intro-to-foundry-module-development](https://bringingfire.com/blog/intro-to-foundry-module-development)  
26. Effective Tray NG | Foundry Virtual Tabletop, accessed January 22, 2026, [https://foundryvtt.com/packages/effectivetray-ng](https://foundryvtt.com/packages/effectivetray-ng)  
27. Dark Matter Extension \- GitLab, accessed January 22, 2026, [https://gitlab.com/dark-matter1/dme](https://gitlab.com/dark-matter1/dme)