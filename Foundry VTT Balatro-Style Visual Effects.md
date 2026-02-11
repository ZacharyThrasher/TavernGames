# **Architectural Implementation of High-Fidelity Visual Effects in Foundry VTT: The 'Tavern Twenty-One' Case Study**

## **1\. Introduction: The Phenomenology of "Juice" in Virtual Tabletops**

The transition from physical tabletops to virtual environments represents a fundamental shift in user interaction. In physical spaces, the tactile sensation of rolling dice, the audible clatter of plastic on wood, and the physical manipulation of cards provide intrinsic sensory feedback—a concept often referred to in game design as "game feel." In a Virtual Tabletop (VTT) like Foundry VTT, these physical inputs are abstracted into mouse clicks and digital random number generation (RNG). This abstraction creates a sensory void. To bridge this gap, developers must implement "juice"—a layer of non-functional, exaggerated audiovisual feedback that confirms player agency and system response.  
"Juice" is not merely cosmetic decoration; it is a cognitive anchor. As demonstrated by the roguelike deck-builder *Balatro*, the aesthetic of "decaying digitalism"—characterized by CRT scanlines, chromatic aberration, intense screen shake, and glitch artifacts—transforms simple arithmetic mechanics into a visceral experience. This report provides an exhaustive technical analysis of how to replicate this specific aesthetic within a Foundry VTT JavaScript module for a hypothetical game system, "Tavern Twenty-One."  
The implementation of such a system requires a sophisticated orchestration of disparate technologies: the **Dice So Nice (DSN)** library for 3D physics simulation 1, the **PIXI.js** rendering engine for screen-space post-processing 3, the **GreenSock Animation Platform (GSAP)** for high-performance timeline management 5, and the **Sequencer** module for particle effect instantiation.6 By synthesizing these tools, developers can create a module where the interface feels mechanical, reactive, and physically weighted, transcending the typical static nature of web-based VTT interfaces.

### **1.1 The *Balatro* Aesthetic: A Deconstruction**

To successfully emulate the target aesthetic, one must first deconstruct its visual components into technical requirements compatible with the Foundry VTT architecture (based on Electron/Chromium). The aesthetic is defined by four pillars:

1. **Analog Simulation:** The interface does not render as crisp vector graphics but simulates a cathode-ray tube (CRT) monitor. This requires curvature shaders, vignetting, and scanline overlays.8  
2. **Signal Decay:** Information is not presented cleanly; it is subject to interference. This manifests as chromatic aberration (RGB splitting) and "glitch" artifacts on text and UI elements during high-stress game states.10  
3. **Kinetic Impact:** The screen is not a static window but a reactive surface. High-value events (like a blackjack in "Tavern Twenty-One") trigger violent screen shake and "squash and stretch" animations on the UI containers.12  
4. **Particle Saturation:** Success states are punctuated by an overload of particle effects—specifically flames, sparks, or coins—that overlay the interface entirely, breaking the "fourth wall" of the game board.6

## **2\. Foundry VTT Architecture and the Render Loop**

Understanding the underlying architecture of Foundry VTT is a prerequisite for implementing high-performance visual effects. Foundry operates as a hybrid application: the User Interface (UI) is constructed via standard HTML/DOM elements, while the game canvas (the map, tokens, and lighting) is rendered via WebGL using the PIXI.js library.3

### **2.1 The ApplicationV2 Framework**

For a module like "Tavern Twenty-One," the primary game interface will likely be built using the ApplicationV2 class, introduced in newer Foundry versions to replace the legacy Application and FormApplication classes.1 ApplicationV2 provides a more robust lifecycle for rendering and event handling, which is critical for synchronizing animation loops with game state changes.  
Unlike the game canvas, ApplicationV2 windows reside in the DOM layer. This presents a dichotomy in how "juice" is applied:

* **Canvas Effects:** Screen shake and global filters (CRT, Bloom) are best applied to the PIXI canvas.stage or specific CanvasLayer instances.3  
* **UI Effects:** Button presses, card flips, and text glitches must be handled via CSS manipulation or GSAP tweening of DOM elements.17

The challenge lies in synchronizing these two layers. A "Critical Success" event must trigger a 3D die roll (Canvas/WebGL), a screen shake (Canvas/WebGL), and a "Jackpot" text explosion (DOM/CSS).

### **2.2 The Game Loop and Hook System**

Foundry VTT utilizes a Hook system to manage the event-driven architecture of the tabletop.1 For "juice" implementation, the module must intercept specific points in the Dice So Nice roll workflow. The standard Hooks.on('renderChatMessage') is insufficient for real-time visual feedback because it fires *after* the roll is complete and the HTML is generated.  
Instead, the module must utilize the specialized hooks provided by DSN: diceSoNiceRollStart and diceSoNiceRollComplete.20 These hooks allow the JuiceManager (a theoretical class handling the visual effects) to inject animations precisely when the 3D physics simulation begins and ends, ensuring the visual feedback aligns perfectly with the physical behavior of the dice.

## **3\. The 3D Physics Layer: Dice So Nice (DSN) Integration**

The "Tavern Twenty-One" game relies on dice mechanics. DSN is the standard library for 3D dice in Foundry, building upon Three.js to render physics-based dice over the PIXI canvas.2 To achieve the *Balatro* feel, the dice cannot simply be functional; they must be stylistic artifacts that contribute to the "neon-gambling" atmosphere.

### **3.1 Customizing the Physics and Materiality**

Standard plastic dice textures clash with the high-contrast, retro-digital aesthetic of *Balatro*. DSN allows for the registration of custom dice presets via its API. To emulate the "glassy" or "holographic" look of high-stakes chips or digital artifacts:

* **Material Definition:** The module should register a custom dice set using the Iridescent or Pristine material presets available in DSN v4+.21 These materials utilize the KHR\_materials\_iridescence WebGL extension, allowing for oil-slick reflections that shift based on the viewing angle and lighting environment.21  
* **Emissive Properties:** The *Balatro* aesthetic relies heavily on bloom and light bleed. By setting the glow attribute in the material's userData, the dice can appear to emit light (e.g., neon red or cyan pips), creating a visual link between the 3D objects and the 2D CRT bloom filters discussed later.21  
* **Physics Configuration:** The "weight" of the roll is adjustable. For a punchy, arcade feel, the module can override the user's default settings for the specific "Tavern" rolls, increasing the throwingForce to make collisions more violent and immediate.2

### **3.2 Architectural Pattern for Hook Interception**

The synchronization of 3D collisions with 2D screen effects is the most critical technical challenge. If the screen shakes *before* the die hits the virtual table, the illusion of weight breaks.

#### **3.2.1 The diceSoNiceRollStart Hook**

This hook fires when the 3D dice are instantiated. It receives the rollId and context data.20

* **Usage:** This is the trigger for "Anticipation" animations. The module should use this hook to dim the ambient lighting of the scene (using canvas.lighting.animateDarkness) or play a "winding up" sound effect via Foundry's AudioHelper.  
* **Camera Lock:** If the setting enableCameraPan is active, this hook can trigger a canvas.animatePan to center the view on the expected landing zone, ensuring the player witnesses the result.1

#### **3.2.2 The diceSoNiceRollComplete Hook**

This hook fires when the physics engine determines the dice have come to rest.20 This is the trigger for "Impact" animations.

* **Data Access:** The hook provides the roll object. The module must parse roll.total to determine the intensity of the effect. A roll of "21" (Critical Success) triggers the full suite of effects, while a standard roll might trigger a minor shake.  
* **Latency Handling:** Since this hook fires locally on each client 1, the visual effects (shake, particles) will naturally synchronize with what *that specific user* sees, avoiding the network desynchronization issues common in multiplayer VTTs.

### **3.3 Implementing "Ghost" Dice for Hidden Information**

In a gambling game like "Tavern Twenty-One," the dealer (GM) often has hidden cards or dice. DSN supports "Ghost" dice—3D simulations that run for the GM but show "???" faces or are invisible to players.23  
However, *Balatro* thrives on the tension of the *reveal*. The module can utilize the showForRoll API manually 24 to trigger a roll that is visible to all but has hidden results (Blind Roll).

* **API Call:** game.dice3d.showForRoll(roll, game.user, true, null) allows forcing a 3D animation where the result is hidden (blind).  
* **Visual Tension:** When a blind roll lands, the module can trigger a "glitch" effect on the result display (using CSS animations on the chat card) instead of showing the number, simulating corrupted data until the reveal phase.

## **4\. The Retro-Rendering Pipeline: PIXI.js Shaders and Filters**

Foundry VTT's use of PIXI.js provides access to a powerful WebGL filter system. This is the primary vector for implementing the CRT and Chromatic Aberration effects. Filters in PIXI are fragment shaders that process the rendered output of a container (the stage) before it is drawn to the screen.3

### **4.1 The CRT Filter Implementation**

The CRT effect involves warping the coordinate space (curvature), adding scanlines (sine wave modulation of intensity), and vignetting (darkening edges). The pixi-filters library, often bundled or available via modules like FXMaster, includes a CRTFilter class.4  
**Mathematical Configuration:**  
To achieve the *Balatro* look, which is stylized rather than strictly realistic, the filter parameters must be tuned aggressively:

* **Curvature:** Set curvature to 1.0 or higher. This bends the UV coordinates of the texture sampler, simulating the convex geometry of an old monitor.9  
* **Line Width:** The lineWidth should be set relative to the canvas resolution. A value of 1.0 to 2.0 creates visible, chunky scanlines typical of low-res pixel art games.  
* **Vignetting:** Setting vignetting to 0.3 and vignettingBlur to 0.3 creates a soft darkness at the corners 9, which helps frame the central gambling area and hide the hard edges of the VTT map.

**Dynamic Noise Injection:** Static noise reduces readability. However, dynamic noise that reacts to game state creates immersion. The noise property of the CRTFilter 9 can be tweened using GSAP.

* **Idle State:** noise \= 0.05 (Subtle film grain).  
* **Bust State:** When a player goes over 21, gsap.to(filter, {noise: 0.5, duration: 0.2, yoyo: true, repeat: 1}) creates a burst of static, simulating signal loss.

### **4.2 Chromatic Aberration (RGB Splitting)**

Chromatic aberration simulates the misalignment of the Red, Green, and Blue electron guns in a CRT. This effect is crucial for impact frames.  
**The RGBSplitFilter:** This filter accepts red, green, and blue Point objects defining the offset of each channel.10

* **Implementation Strategy:** Do not leave this filter static. A static shift looks like a blurry image. The "juice" comes from *animating* the shift upon impact.  
* **Impact Sequence:** Inside the diceSoNiceRollComplete hook, if the result is significant, the JuiceManager should capture the filter instance and tween the red offset from to (10 pixels right) and back to \`\` over 100ms. This creates a violent "jolt" where the colors separate and snap back together.8

**Custom Fragment Shaders:** For developers requiring more control (e.g., radial aberration that increases towards the edges), a custom AbstractFilter can be written. The GLSL logic involves modifying the texture lookup vector vTextureCoord independently for each color channel based on the distance from the center vec2(0.5, 0.5).10

OpenGL Shading Language

// Theoretical Fragment Shader Logic for Radial Aberration  
vec2 dist \= vTextureCoord \- 0.5;  
gl\_FragColor.r \= texture2D(uSampler, vTextureCoord \+ dist \* 0.02 \* uIntensity).r;  
gl\_FragColor.g \= texture2D(uSampler, vTextureCoord).g;  
gl\_FragColor.b \= texture2D(uSampler, vTextureCoord \- dist \* 0.02 \* uIntensity).b;

By binding uIntensity to a Foundry uniform and animating it via GSAP, the screen distorts radially on every beat of the music or dice impact.

### **4.3 Bloom and High-Dynamic Range (HDR) Simulation**

*Balatro*'s visuals often appear "overexposed," with bright elements bleeding light into neighbors. PIXI's AdvancedBloomFilter 8 or BloomFilter 25 can replicate this.

* **Thresholding:** The key is to set a high threshold (e.g., 0.6) so that only the bright pips of the "neon" dice and the white text of the UI trigger the glow.  
* **Performance Warning:** Blur-based filters like Bloom are expensive. They require multi-pass rendering (horizontal and vertical blur). To maintain 60FPS on mid-range hardware, quality settings on the filter should be kept low (e.g., kernelSize of 3 or 5), or the filter should only be enabled during the specific "Jackpot" animation sequence and disabled immediately after.

## **5\. Kinetic Interface Design: GSAP Animation**

Static interfaces kill immersion. **GSAP (GreenSock Animation Platform)** is bundled with Foundry VTT and is the industry standard for programmatic animation.5 It serves as the "motor" for the visual effects, driving the timing and easing of every motion.

### **5.1 The Mathematics of Screen Shake**

Screen shake is the most direct way to convey physical impact. In Foundry VTT, this is achieved by manipulating the canvas.stage.pivot or canvas.stage.position properties.  
**Random vs. Perlin Noise:** A simple Math.random() shake feels jittery and artificial. For a "heavy" feel, a decaying sine wave or Perlin noise approximation is superior. However, for short impact bursts, a GSAP "rough ease" is highly effective.13  
**Code Logic Strategy:**  
The JuiceManager should expose a shake(intensity, duration) function.

JavaScript

// Conceptual Logic using GSAP  
gsap.to(canvas.stage.pivot, {  
    x: "+=20",   
    yoyo: true,   
    repeat: 5,   
    duration: 0.05,   
    ease: "rough({ strength: 1, points: 20, template: none.out, randomize: true })"   
});

This moves the canvas pivot point rapidly back and forth. The yoyo: true ensures it returns to the center, preventing the map from drifting off-screen. The rough ease creates the jagged, non-linear movement characteristic of an earthquake or explosion.5

### **5.2 UI "Squash and Stretch"**

When a card is dealt or a score updates, the UI element itself should deform. This animation principle, borrowed from traditional animation, gives the interface elasticity.

* **Implementation:** Using GSAP on the DOM element of the "Tavern Twenty-One" app.  
* **Sequence:** When the score updates:  
  1. Scale X to 1.2, Scale Y to 0.8 (Squash).  
  2. Scale X to 0.9, Scale Y to 1.1 (Stretch).  
  3. Scale X/Y to 1.0 (Settle). This sequence, executed over 0.2 seconds with ease: "elastic.out(1, 0.3)", makes the numbers feel like physical objects slamming into place.18

### **5.3 Text Glitch Implementation**

The "Glitch" text effect in *Balatro* is iconic. It involves text characters randomly offsetting, changing opacity, and slicing. This can be achieved via CSS clip-path animations driven by GSAP.11  
**CSS Keyframes approach:**  
Define a @keyframes animation that rapidly alters the clip-path: inset(...) property.  
**Integration:** When a player busts, the JavaScript module toggles a .glitch class on the score display. The CSS handles the frame-by-frame chaos, while GSAP handles the timing of when the class is added and removed, ensuring it syncs with the sound effects.

## **6\. Particle Orchestration: The Sequencer Module**

For high-fidelity particle effects (explosions, coin showers), coding raw WebGL particle emitters is inefficient. The **Sequencer** module provides a high-level API to spawn and manage video-based assets on the canvas.7

### **6.1 Asset Pipeline: Utilizing JB2A**

The **JB2A (Jules & Ben's Animated Assets)** library is the standard repository for VTT visual effects. For "Tavern Twenty-One," the relevant assets are located in paths such as modules/JB2A\_DnD5e/Library/Generic/Explosion (for bursts) or Library/Generic/Coin (for jackpots).27  
**Directory Structure Awareness:**  
It is critical to note that file paths differ between the free and Patreon versions of JB2A. The module code must implement a path-resolver utility:

1. Check game.modules.get('jb2a\_patreon')?.active.  
2. If active, use the Patreon path.  
3. Else, check game.modules.get('JB2A\_DnD5e')?.active.  
4. Fallback to a bundled default asset if neither is present to prevent module failure.

### **6.2 Screen Space vs. World Space**

Standard Sequencer effects play on the canvas (World Space), meaning they pan and zoom with the map. For a UI-centric game like "Tavern Twenty-One," effects must play *over* the interface.

* **The .screenSpace() Method:** Sequencer v3+ introduced specific support for screen-space effects. By chaining .screenSpace() to the sequence builder, the effect renders on a dedicated layer above the HUD.6  
* **The .aboveLighting() Method:** To ensure the glow of the "Coin Burst" isn't dimmed by the scene's darkness level (e.g., a dark tavern map), the .aboveLighting() method must be invoked.6

### **6.3 Cross-Client Synchronization**

Sequencer automatically broadcasts effects to all clients. However, in a gambling game, you might want specific effects to be local (e.g., only the player sees their own UI glitz to reduce clutter for others).

* **Local Playback:** Using .play({ remote: false }) ensures the effect only runs on the client triggering it.6  
* **Targeted Playback:** Using .forUsers(\[userId\]) allows the GM to trigger a "You Lose" animation that only the specific losing player sees, enhancing the personal stakes.6

## **7\. Integrated Workflow: The "Natural 21" Event**

To illustrate the synthesis of these systems, we detail the architectural flow of a "Natural 21" event (a Jackpot).  
**Phase 1: The Trigger (Game Logic)**  
The internal logic of the "Tavern Twenty-One" module detects the hand value sums to 21\. It emits a custom event tavern21.jackpot.  
**Phase 2: The Hook (DSN Physics)**  
The module calls game.dice3d.showForRoll(...).

* **Hook:** diceSoNiceRollStart fires.  
* **Action:** JuiceManager plays a "charging" sound. The UI container performs a "breath" animation (slight scale up) via GSAP to anticipate the impact.

**Phase 3: The Impact (Synchronization)**

* **Hook:** diceSoNiceRollComplete fires.  
* **Action 1 (Physics):** Dice land on the table.  
* **Action 2 (Camera):** JuiceManager calls shake(20, 0.5). The stage jolts.  
* **Action 3 (Filter):** JuiceManager sets RGBSplitFilter offset to . GSAP tweens it back to over 0.3s.  
* **Action 4 (Particles):** Sequencer plays JB2A\_DnD5e...Coin\_Burst\_01 with .screenSpace().scale(2.0). The coins explode over the UI.  
* **Action 5 (UI):** The "21" text flashes gold (CSS class toggle) and scales elastically (GSAP).

**Phase 4: The Cleanup**  
GSAP's onComplete callbacks ensure that all filters are removed from the stage filters array to restore performance for the next round.

## **8\. UX/UI Design Considerations and Accessibility**

### **8.1 Skeuomorphism vs. Digital Abstraction**

The "juice" described moves the interface away from strict skeuomorphism (simulating a physical table) towards "Digital Abstraction." In *Balatro*, the cards are objects, but the sparks and glitches admit the medium is digital. For "Tavern Twenty-One," this means the dice should feel physical (DSN), but the *results* should feel magical/digital (Sequencer/PIXI). This contrast heightens the excitement.

### **8.2 Accessibility (A11y)**

The *Balatro* style—heavy flashing, shaking, and glitching—is a major trigger for photosensitive epilepsy.

* **Mandatory Settings:** The module **must** include a configuration setting: "Enable Photosensitive Mode."  
* **Implementation:** The JuiceManager class must check this setting before triggering *any* flash or shake.  
  * if (game.settings.get('tavern-21', 'photosensitive')) return;  
  * If enabled, replace the screen shake with a simple, non-flashing border highlight or a gentle fade-in of the result text.  
  * Sequencer also provides warnings for photosensitive modes which should be respected.6

## **9\. Performance Optimization and Compatibility**

Visual effects are resource-intensive. Implementing them carelessly will crash low-end clients (rendering context loss).

* **Filter Stacking:** Never instantiate a new CRTFilter() inside the render loop. Create *one* instance at startup and toggle its enabled property. Stacking multiple filters causes exponential GPU overhead.25  
* **Texture Memory:** Large particle videos (JB2A) consume VRAM. Use Sequencer's preload() function during the module's ready hook to load essential assets into the cache before the game starts.  
* **Render Flags:** In Foundry V13/V12, utilize the RenderFlags mixin in ApplicationV2. Ensure that UI animations do not trigger a full re-render of the HTML application (which is slow) but rather modify existing DOM elements via CSS transforms (which are GPU-accelerated).16

## **10\. Implementation Guide: Step-by-Step Architecture**

### **10.1 Define the JuiceManager Class**

This singleton class acts as the director for all visual effects. It decouples the visual logic from the game rules.

JavaScript

class JuiceManager {  
    constructor() {  
        this.crtFilter \= new PIXI.filters.CRTFilter({  
            curvature: 2.0,  
            lineWidth: 1.5,  
            vignetting: 0.35,  
            noise: 0.05  
        });  
        this.rgbFilter \= new PIXI.filters.RGBSplitFilter();  
        this.filtersActive \= false;  
    }

    // Called when the game interface opens  
    activateFilters() {  
        if (game.settings.get("core", "photosensitiveMode")) return;  
        canvas.app.stage.filters \= \[this.crtFilter, this.rgbFilter\];  
        this.filtersActive \= true;  
          
        // Start the "noise crawl" animation loop  
        gsap.ticker.add(this.animateFilters.bind(this));  
    }

    animateFilters(time, deltaTime, frame) {  
        if (\!this.filtersActive) return;  
        // Animate CRT seed for static noise  
        this.crtFilter.seed \= Math.random();  
        this.crtFilter.time \+= 0.1;  
    }

    async onCriticalSuccess(roll) {  
        // 1\. Screen Shake  
        this.triggerShake(20);  
          
        // 2\. Chromatic Aberration Spike  
        gsap.fromTo(this.rgbFilter.red,   
            {x: 10, y: 0},   
            {x: 0, y: 0, duration: 0.4, ease: "power2.out"}  
        );

        // 3\. Sequencer Particle Burst  
        new Sequence()  
           .effect()  
               .file("modules/JB2A\_DnD5e/Library/Generic/Explosion/Explosion\_01\_Orange\_400x400.webm")  
               .screenSpace()  
               .atLocation({x: window.innerWidth/2, y: window.innerHeight/2})  
               .scale(2.0)  
           .play();  
    }

    triggerShake(intensity) {  
        if (game.settings.get("core", "photosensitiveMode")) return;  
        gsap.fromTo(canvas.stage.position,   
            {x: \-intensity},   
            {x: intensity, duration: 0.05, repeat: 5, yoyo: true, ease: "rough"}  
        );  
    }  
}

### **10.2 Registering the Hooks**

The connection between DSN and the Juice Manager is established in the module's main entry point.

JavaScript

Hooks.on('diceSoNiceRollComplete', (rollId) \=\> {  
    // Safety check: Is the module active?  
    if (\!game.modules.get('tavern-21').active) return;

    const message \= game.messages.get(rollId);  
    const roll \= message?.roll;  
      
    // Check if this roll belongs to Tavern Twenty-One context  
    if (message?.getFlag('tavern-21', 'isGameRoll')) {  
        const juice \= new JuiceManager(); // Ideally fetch singleton  
          
        if (roll.total \=== 21\) {  
            juice.onCriticalSuccess(roll);  
        } else if (roll.total \> 21\) {  
            juice.onBust(roll);  
        }  
    }  
});

### **10.3 CSS for Glitch Effects**

To support the DOM-level animations, inject the following CSS via the module's styles.css.

CSS

@keyframes glitch-anim {  
  0% { clip-path: inset(10% 0 80% 0); transform: translate(-2px, 2px); }  
  20% { clip-path: inset(80% 0 10% 0); transform: translate(2px, \-2px); }  
  40% { clip-path: inset(40% 0 40% 0); transform: translate(-2px, 2px); }  
  60% { clip-path: inset(10% 0 60% 0); transform: translate(2px, \-2px); }  
  100% { clip-path: inset(0% 0 0% 0); transform: translate(0); }  
}

.tavern-21-ui.score.bust {  
    animation: glitch-anim 0.3s infinite linear alternate-reverse;  
    color: \#ff0044;  
    text-shadow: 2px 0 \#00ffff, \-2px 0 \#ff00ff;  
}

## **11\. Conclusion**

The implementation of *Balatro*\-style "juice" in Foundry VTT is a multidisciplinary engineering challenge that extends far beyond simple asset playback. It requires the developer to act as a graphics engineer (managing PIXI shaders), a physics integrator (Hooking DSN), and a motion designer (GSAP orchestration).  
By building a dedicated JuiceManager architecture that listens to the diceSoNiceRollComplete hook, developers can synchronize 3D physical triggers with 2D post-processing effects. The resulting module, "Tavern Twenty-One," will not just display results; it will *perform* them. The integration of CRT distortion, chromatic aberration, and particle saturation creates a cohesive aesthetic that transforms the VTT from a passive tool into an immersive, tactile gambling experience. This approach validates that in the realm of VTT development, the "feel" of the game is just as code-dependent—and just as critical—as the rules themselves.

## **12\. Tables and Reference Data**

**Table 1: Effect Component Analysis & Implementation Source**

| Visual Effect | Technical Tool | Implementation Method | API Reference |
| :---- | :---- | :---- | :---- |
| **CRT Monitor** | PIXI.js Filter | PIXI.filters.CRTFilter applied to canvas.stage | 9 |
| **RGB Split** | PIXI.js Filter | RGBSplitFilter animated via GSAP Tween | 10 |
| **3D Dice Roll** | Dice So Nice | game.dice3d.showForRoll with Custom Material | 21 |
| **Screen Shake** | GSAP | gsap.to(canvas.stage.position, {yoyo: true}) | 5 |
| **Particles** | Sequencer | new Sequence().effect().screenSpace() | 6 |
| **UI Glitch** | CSS3 | @keyframes with clip-path: inset(...) | 11 |

**Table 2: JB2A Asset Paths for "Tavern Twenty-One" (Free Module)**

| Event Type | Asset Type | Recommended Path (Free Pack) | Source Context |
| :---- | :---- | :---- | :---- |
| **Jackpot (Win)** | Coin Burst | modules/JB2A\_DnD5e/Library/Generic/Explosion/Explosion\_01\_Orange\_400x400.webm | 27 |
| **Bust (Loss)** | Smoke/Fail | modules/JB2A\_DnD5e/Library/Generic/Smoke/SmokePlume01\_Dark\_Regular\_400x400.webm | 29 |
| **Marker** | Token Highlight | modules/JB2A\_DnD5e/Library/Generic/Token\_Border/marker02.webp | 30 |

*(Note: Paths are subject to change; developers should implement a dynamic file picker or configuration check at module initialization.)*

#### **Works cited**

1. Hooks | Foundry VTT Community Wiki, accessed January 26, 2026, [https://foundryvtt.wiki/en/development/api/hooks](https://foundryvtt.wiki/en/development/api/hooks)  
2. Dice So Nice\! | Foundry Virtual Tabletop, accessed January 26, 2026, [https://foundryvtt.com/packages/dice-so-nice/](https://foundryvtt.com/packages/dice-so-nice/)  
3. Introduction to PIXI in Foundry VTT, accessed January 26, 2026, [https://foundryvtt.wiki/en/development/guides/pixi](https://foundryvtt.wiki/en/development/guides/pixi)  
4. @pixi/filter-crt \- npm, accessed January 26, 2026, [https://www.npmjs.com/package/@pixi/filter-crt](https://www.npmjs.com/package/@pixi/filter-crt)  
5. GreenSock \- Foundry VTT Community Wiki, accessed January 26, 2026, [https://foundryvtt.wiki/en/development/guides/greensock](https://foundryvtt.wiki/en/development/guides/greensock)  
6. FoundryVTT-Sequencer-Fork/docs/changelog.md at master \- GitHub, accessed January 26, 2026, [https://github.com/otigon/FoundryVTT-Sequencer-Fork/blob/master/docs/changelog.md](https://github.com/otigon/FoundryVTT-Sequencer-Fork/blob/master/docs/changelog.md)  
7. Sequencer, accessed January 26, 2026, [https://fantasycomputer.works/FoundryVTT-Sequencer/](https://fantasycomputer.works/FoundryVTT-Sequencer/)  
8. PixiJS Filters API Documentation, accessed January 26, 2026, [https://pixijs.io/filters/docs/](https://pixijs.io/filters/docs/)  
9. PIXI.filters.CRTFilter \- PixiJS, accessed January 26, 2026, [https://api.pixijs.io/@pixi/filter-crt/PIXI/filters/CRTFilter.html](https://api.pixijs.io/@pixi/filter-crt/PIXI/filters/CRTFilter.html)  
10. PixiJS chromatic aberration filter \- GitHub Gist, accessed January 26, 2026, [https://gist.github.com/ryonakae/7f45edb449f016214354e8acf374db2e](https://gist.github.com/ryonakae/7f45edb449f016214354e8acf374db2e)  
11. Master the CSS glitch effect: a DIY guide | TinyMCE, accessed January 26, 2026, [https://www.tiny.cloud/blog/css-glitch-effect/](https://www.tiny.cloud/blog/css-glitch-effect/)  
12. Earthquake \- Foundry Virtual Tabletop, accessed January 26, 2026, [https://foundryvtt.com/packages/earthquake](https://foundryvtt.com/packages/earthquake)  
13. Setting An X and Y of a HTML Canvas 2D Context (Screen Shake), accessed January 26, 2026, [https://stackoverflow.com/questions/41191872/setting-an-x-and-y-of-a-html-canvas-2d-context-screen-shake](https://stackoverflow.com/questions/41191872/setting-an-x-and-y-of-a-html-canvas-2d-context-screen-shake)  
14. IrateRedKite/jb2a-sequencer-spell-macros \- GitHub, accessed January 26, 2026, [https://github.com/IrateRedKite/jb2a-sequencer-spell-macros](https://github.com/IrateRedKite/jb2a-sequencer-spell-macros)  
15. Canvas | Foundry Virtual Tabletop \- API Documentation \- Version 10, accessed January 26, 2026, [https://foundryvtt.com/api/v10/classes/client.Canvas.html](https://foundryvtt.com/api/v10/classes/client.Canvas.html)  
16. ApplicationV2 | Foundry Virtual Tabletop \- API Documentation, accessed January 26, 2026, [https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)  
17. Glitch Effect on Text / Images / SVG \- CSS-Tricks, accessed January 26, 2026, [https://css-tricks.com/glitch-effect-text-images-svg/](https://css-tricks.com/glitch-effect-text-images-svg/)  
18. gsap.to() | GSAP | Docs & Learning, accessed January 26, 2026, [https://gsap.com/docs/v3/GSAP/gsap.to()/](https://gsap.com/docs/v3/GSAP/gsap.to\(\)/)  
19. Hooks Listening & Calling | Foundry VTT Community Wiki, accessed January 26, 2026, [https://foundryvtt.wiki/en/development/guides/Hooks\_Listening\_Calling](https://foundryvtt.wiki/en/development/guides/Hooks_Listening_Calling)  
20. Version 2.0.3 · Simone Ricciardi / FoundryVTT Dice So Nice \- GitLab, accessed January 26, 2026, [https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/releases/2.0.3](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/releases/2.0.3)  
21. Releases · Simone Ricciardi / FoundryVTT Dice So Nice \- GitLab, accessed January 26, 2026, [https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/releases](https://gitlab.com/riccisi/foundryvtt-dice-so-nice/-/releases)  
22. midi-qol \- Tim Posney \- GitLab, accessed January 26, 2026, [https://gitlab.com/tposney/midi-qol/-/tree/08x](https://gitlab.com/tposney/midi-qol/-/tree/08x)  
23. Blind Skill Rolls | Foundry Virtual Tabletop, accessed January 26, 2026, [https://foundryvtt.com/packages/blind-skill-rolls](https://foundryvtt.com/packages/blind-skill-rolls)  
24. API changes to "Dice So Nice" causes rolls to not work \#58 \- GitHub, accessed January 26, 2026, [https://github.com/RedReign/FoundryVTT-BetterRolls5e/issues/58](https://github.com/RedReign/FoundryVTT-BetterRolls5e/issues/58)  
25. Filters / Blend Modes \- PixiJS, accessed January 26, 2026, [https://pixijs.com/8.x/guides/components/filters](https://pixijs.com/8.x/guides/components/filters)  
26. Sequencer | Foundry Virtual Tabletop, accessed January 26, 2026, [https://foundryvtt.com/packages/sequencer](https://foundryvtt.com/packages/sequencer)  
27. Macro help needed \- Play an animation at a particlar point on a scene, accessed January 26, 2026, [https://www.reddit.com/r/FoundryVTT/comments/z02icq/macro\_help\_needed\_play\_an\_animation\_at\_a/](https://www.reddit.com/r/FoundryVTT/comments/z02icq/macro_help_needed_play_an_animation_at_a/)  
28. Jules-Bens-Aa/JB2A\_DnD5e: Templates of spells from the ... \- GitHub, accessed January 26, 2026, [https://github.com/Jules-Bens-Aa/JB2A\_DnD5e](https://github.com/Jules-Bens-Aa/JB2A_DnD5e)  
29. Free Animated Spell Assets \- JB2A New Release \! : r/FoundryVTT, accessed January 26, 2026, [https://www.reddit.com/r/FoundryVTT/comments/jr21oj/free\_animated\_spell\_assets\_jb2a\_new\_release/](https://www.reddit.com/r/FoundryVTT/comments/jr21oj/free_animated_spell_assets_jb2a_new_release/)  
30. Pf2e Beginner box, how to make tokens more vibrant? \- Reddit, accessed January 26, 2026, [https://www.reddit.com/r/FoundryVTT/comments/11m0swl/pf2e\_beginner\_box\_how\_to\_make\_tokens\_more\_vibrant/](https://www.reddit.com/r/FoundryVTT/comments/11m0swl/pf2e_beginner_box_how_to_make_tokens_more_vibrant/)