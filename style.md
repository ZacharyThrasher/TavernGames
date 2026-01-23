# **Architectural Blueprint for the "Sword Coast Tavern" Module: A Comprehensive UI/UX Design Report for Foundry VTT**

## **1\. Executive Summary and Design Philosophy**

The objective of this comprehensive research report is to provide a granular design specification for a Foundry Virtual Tabletop (VTT) module that transforms the user interface (UI) into a highly immersive "Sword Coast Tavern" experience. This transformation represents a fundamental shift in the user experience (UX) paradigm, moving away from a utilitarian, software-centric interface toward a diegetic, narrative-driven environment that actively enhances the role-playing experience. The target audience includes Dungeon Masters (DMs) and players running campaigns set in the Forgotten Realms, specifically along the Sword Coast—a region defined by its cosmopolitan cities (Waterdeep, Baldur’s Gate), maritime trade, ancient ruins, and high adventure.1  
To achieve this, the design must bridge the gap between modern web technologies (HTML5, CSS3, JavaScript ES6+) and the archaic, tactile aesthetic of a fantasy tavern. The module will leverage Foundry’s ApplicationV2 API 2, the Handlebars templating engine 4, and advanced CSS compositing techniques (blend modes, masking, filters).6 The goal is to produce a "living" interface—one that flickers with candlelight, creaks with the weight of timber, and possesses the visual scent of spilled ale and old parchment. This report will serve as the primary directive for an Large Language Model (LLM) or human developer to code the module, ensuring every pixel and interaction reinforces the "rowdy tavern" theme.

### **1.1 The Diegetic Interface: Immersion over Utility**

In the context of Virtual Tabletop software, the user interface often acts as a barrier between the player and the fiction. Standard windows, clean white backgrounds, and sans-serif fonts remind the user they are operating a database, not inhabiting a character. The "Sword Coast Tavern" module aims to implement a *diegetic* interface—UI elements that exist within the world of the game, or at least mimic its material reality.  
When a player opens their character sheet, they should not feel they are looking at a spreadsheet; they should feel they are unrolling a worn adventurer’s journal on a sticky wooden table in the Yawning Portal. When they browse a shop, they should be looking at a merchant's chalkboard menu or a hastily scrawled ledger. This philosophy dictates that every border, background, and button must correspond to a physical material found in Faerûn: wood, iron, parchment, leather, wax, or glass.9

### **1.2 The Sword Coast Aesthetic: A Visual Deconstruction**

The Sword Coast is not a visual monolith; it is a complex tapestry of influences ranging from the high-fantasy opulence of Waterdeep to the grim, frontier survivalism of Icewind Dale. However, the "Tavern" serves as the universal anchor—a liminal space where highborn lords, Zhentarim spies, and grimy mercenaries break bread together. Designing for this setting requires a nuanced understanding of these conflicting aesthetics.

* **Materials & Textures:** The primary visual textures must be organic and weathered. We must use rough-sawn oak and dark walnut for structural elements (window frames, sidebars) to evoke the timber framing characteristic of Faerûn architecture. Backgrounds should rely heavily on parchment, vellum, and worn leather, suggesting that the interface itself is a collection of adventurer's notes, maps, and bounties.9 The wood should not be pristine; it should show the scars of dagger points and the rings of spilt tankards.  
* **Atmospheric Lighting:** The lighting model for the UI should simulate an interior lit by tallow candles, hearth fire, and perhaps the faint bioluminescence of a magical driftglobe. This implies warm color temperatures (2700K–3000K), deep, high-contrast shadows, and a radial vignette effect that focuses attention on the center of windows while obscuring the corners in "smoke-stained" darkness.12  
* **Iconography & Symbology:** Symbols should be grounded in the setting. Instead of generic "close" buttons, we employ wax seals stamped with faction sigils or iron clasps. Navigation icons should resemble the woodcuts or ink sketches found in *Volo’s Guide to Monsters*, utilizing vector assets that mimic hand-drawn strokes rather than precise geometric vectors.13

### **1.3 Technical Constraints and Opportunities**

Foundry VTT operates as a web application, typically within an Electron wrapper or a standard browser. This environment grants the developer full access to the Document Object Model (DOM) and the CSS Object Model (CSSOM), enabling sophisticated visual effects.

* **Opportunity:** We can leverage CSS mix-blend-mode to composite paper textures over solid colors, creating realistic ink absorption effects that react dynamically to background changes.15 We can utilize filter: blur() and box-shadow to create volumetric lighting effects, simulating the hazy atmosphere of a crowded taproom.8  
* **Constraint:** Performance is paramount in a VTT environment, which is often rendering complex canvas lighting and fog of war simultaneously. Heavy use of high-resolution textures and complex box-shadows can trigger expensive browser reflows and repaints. The design strategy must prioritize CSS gradients, repeated patterns, and SVG masks over massive raster images. We must essentially "paint" with code, using will-change properties judiciously to optimize rendering performance.17

## ---

**2\. Color Theory and Palette Architecture**

Color is the most immediate and visceral communicator of mood. For a Sword Coast tavern theme, we must strictly avoid the sterile white (\#FFFFFF) and absolute black (\#000000) common in standard web design. These colors are artificial and cause eye strain in the low-light environments where VTT sessions often take place. Instead, we derive our palette from the physical materials of the setting: parchment, ink, wood, metal, fire, and the heraldry of local factions.

### **2.1 The Parchment Foundation: Replacing White**

The core background color for text legibility must simulate aged paper or vellum. This provides a neutral but textured surface that reduces glare and enhances immersion.  
**Primary Backgrounds (The "Paper" Layer):**  
The following colors serve as the base layers for character sheets, chat logs, and journals.

* **Base Parchment (\#FCF5E5):** A pale yellowish-green white, evoking treated sheepskin or goat vellum. This is the primary canvas for reading.11  
* **Warm Vellum (\#FEFCAF):** A brighter, pastel yellow for active elements or high-contrast areas where user attention is required. This simulates a page catching the light of a candle.18  
* **Aged Papyrus (\#F1E2BE):** A darker, browner tone for inactive tabs, modal backgrounds, or sidebar elements. This represents older, cheaper paper or surfaces stained by use.19

**Implementation Note:** These hex codes should rarely be used as flat background-color properties. Instead, they serve as the base color beneath a semi-transparent texture image (using multiply or overlay blend modes). This ensures that if the texture fails to load, the UI remains legible and thematically consistent, but when fully rendered, it possesses depth and grain.20

### **2.2 The Ink and Typography Palette: Replacing Black**

Text in this module must look handwritten with a quill or printed with a rudimentary press. Absolute black is too stark and digital.

* **Primary Ink (\#2A1A0A):** A deep, warm brown-black. It mimics oak gall ink or charcoal, softening the contrast against the parchment background while maintaining high readability ratios.  
* **Faded Ink (\#55433A):** A mid-tone brown for secondary text, metadata, or flavor text. This mimics ink that has soaked into the fiber of the paper or faded with time.  
* **Iron Gall Ink (\#383135):** A cool, purplish-black for formal headers, representing high-quality, expensive ink used by wizards or nobility in Waterdeep.21

### **2.3 Structural Materials (UI Chrome)**

The window frames, sidebars, buttons, and dividers represent the physical structure of the tavern itself—the beams, the tables, and the tankards.

* **Old Oak (Dark) (\#3E2723):** Deep brown for outer borders, window headers, and deep shadows. This grounds the UI and provides a strong container for content.  
* **Polished Mahogany (Mid) (\#5D4037):** A reddish-brown for buttons and interactive elements, suggesting wood that has been smoothed by years of handling.  
* **Brass/Gold (Highlights) (\#C37E3F):** For borders, active states, focus rings, and hover effects. This mimics the brass fittings on a chest or the glint of gold coins.22  
* **Tarnished Silver (\#B0A2AB):** For inactive icons, disabled states, or secondary metallic accents.21

### **2.4 Factional Accents (The "Sword Coast" Flair)**

To specifically evoke the geopolitical landscape of Faerûn, we must integrate the color identities of the major powers operating on the Sword Coast. These accents should be used sparingly for specific UI elements (e.g., chat speaker names, specific tab highlights, or critical success/failure indicators).

* **The Lords’ Alliance:** Uses \#A4311A (Deep Red) and Gold. This faction represents the established authority of cities like Waterdeep and Neverwinter. Use this for GM-facing controls or "official" settings.22  
* **The Harpers:** Uses \#1A237E (Spectral Blue) and Silver. This faction represents secrecy, knowledge, and balance. Use this for lore entries, journals, or secret GM notes.23  
* **The Zhentarim:** Uses \#212121 (Onyx Black) and \#FFD700 (Gold). Represents wealth, mercenaries, and the shadow network. Use this for the "shop" interface or inventory management.24  
* **The Emerald Enclave:** Uses \#2E7D32 (Forest Green). Represents nature and the wild. Use this for Druid/Ranger specific UI elements or nature checks.

### **2.5 Semantic Color Mapping Table**

For the LLM to effectively generate the CSS variables (Custom Properties), a strict semantic mapping is essential. This table abstracts the specific hex codes into functional variables.

| Semantic Variable | Hex Value | Usage Context |
| :---- | :---- | :---- |
| \--color-sc-bg-primary | \#FCF5E5 | Main content areas, character sheet bodies. |
| \--color-sc-bg-secondary | \#E6D1A1 | Sidebars, inactive tabs, chat bubbles. |
| \--color-sc-text-body | \#2A1A0A | Paragraph text, stat block values. |
| \--color-sc-text-header | \#383135 | H1-H6 headers, window titles. |
| \--color-sc-border-main | \#5D4037 | Standard element borders (wood grain). |
| \--color-sc-accent-gold | \#C37E3F | Hover states, active selection, critical successes. |
| \--color-sc-accent-danger | \#8B0000 | Critical failures, HP loss, delete buttons. |
| \--color-sc-shadow-inset | rgba(42, 26, 10, 0.4) | Inner shadows for sunken inputs. |
| \--color-sc-glow-candle | rgba(255, 160, 0, 0.15) | Ambient glow for active windows. |

## ---

**3\. Typography and Typesetting**

Typography in a D\&D module serves a dual purpose: legibility and atmosphere. The standard sans-serif fonts of the modern web (Arial, Roboto, Helvetica) are anachronistic and break the suspension of disbelief. We must emulate the typographic identity of the D\&D 5th Edition Player’s Handbook (PHB) while ensuring readability on digital screens, which lack the resolution of printed paper.

### **3.1 Font Selection Strategy**

To achieve the official "D\&D" look without incurring licensing fees, we will utilize the "Solbera" font family. These are open-source fonts created by the community to approximate the proprietary fonts used in 5th Edition sourcebooks.25

1. **Headers (H1, H2, Window Titles):**  
   * **Font:** Mr Eaves Small Caps (Solbera) or Modesto Condensed (if available).  
   * **Rationale:** These fonts have a chiseled, serif quality that mimics stone carving or high-quality letterpress titles. They convey authority, structure, and antiquity.  
   * **CSS Implementation:** font-family: 'Mr Eaves Small Caps', serif; font-variant: small-caps; letter-spacing: 0.05em;.  
2. **Body Text (Paragraphs, Chat Log):**  
   * **Font:** Bookinsanity (based on *Bookmania*).25  
   * **Rationale:** This is a sturdy serif with a high x-height, designed for readability in dense blocks of text. It feels "bookish" without being overly ornate or difficult to parse at small sizes (12px-14px). It is the workhorse of the interface.  
   * **Fallback:** Georgia, Times New Roman.  
3. **Data & Tables (Stat Blocks, Inventories):**  
   * **Font:** Scaly Sans (based on *Scala Sans*).25  
   * **Rationale:** A humanist sans-serif. Unlike geometric sans-serifs (like Arial), humanist fonts retain a calligraphic root, making them fit the fantasy aesthetic while providing the clean lines necessary for reading numbers and small text in dense tables (like inventory lists).  
4. **Decorative Elements (Drop Caps, Faction Seals):**  
   * **Font:** Solbera Imitation or Zatanna Misdirection.25  
   * **Rationale:** Use for initial capitals, "handout" documents, or signature lines to mimic handwriting. These should be used sparingly as they are harder to read.

### **3.2 Typographic Scale and Rhythm**

To maintain the "Book" feel, we should use a typographic scale based on the Golden Ratio (1.618) or a Perfect Fifth (1.5). This provides a harmonious hierarchy of information.26

* **Base Size:** 16px (1rem) for standard body text.  
* **H1 (Window Titles):** 2.074rem (\~33px) \- Dominant and clear.  
* **H2 (Section Headers):** 1.728rem (\~28px) \- Distinct section breaks.  
* **H3 (Sub-headers):** 1.44rem (\~23px) \- Feature headers.  
* **Body:** 1rem (16px) \- The reading standard.  
* **Small (Metadata):** 0.833rem (\~13px) \- For timestamps, weights, and costs.

**CSS Text Effects for Immersion:**  
To enhance legibility against textured backgrounds (which can be noisy), text should not be rendered flatly.

* **Letterpress Effect (Debossed):** Use a light shadow *below* the text to make it look pressed into the soft paper.  
  * text-shadow: 0px 1px 0px rgba(255, 255, 255, 0.5);.28  
* **Ink Bleed (Subtle):** A very slight blur can soften digital edges, making the text look like ink absorbed into fiber.  
  * filter: blur(0.2px); (Use extremely sparingly, only on large H1 headers).

## ---

**4\. Visual Flair: CSS Techniques for Immersion**

This section details the specific CSS and HTML strategies required to achieve the "rowdy tavern" feel. This is where the module moves from being a "skin" to being a "simulation."

### **4.1 Texture Compositing and Backgrounds**

Flat colors break immersion. Every surface in the tavern must have texture.  
**The Parchment Overlay Technique:** To create a realistic paper effect without using massive, bandwidth-hogging image files for every window, use a repeatable seamless parchment pattern combined with CSS blend modes.15

CSS

.window-content {  
  background-color: var(--color-sc-bg-primary); /\* The base color \*/  
  background-image: url('assets/textures/parchment-noise.png'); /\* A grayscale noise texture \*/  
  background-blend-mode: multiply; /\* Blends the noise into the color \*/  
  background-size: 500px 500px;  
  background-repeat: repeat;  
}

* **Insight:** Using multiply blends the noise texture into the background color. This allows for dynamic color changes—for example, shifting the background-color to a reddish hue when a character is at low HP ("Bloodied" state)—without needing to load a new texture image.

**The Wood Grain Frame:**  
Foundry's default window borders are often simple CSS borders. We must replace these with a wood texture.

* **Technique:** border-image. This CSS property allows us to take a 9-grid slice of a wooden frame image (corners, edges, and center) and stretch it around the application window.20  
* **Source:** High-resolution photographs of oak or walnut, darkened and seamlessly tiled. The corners should feature iron banding or rivets to imply sturdy construction.9

### **4.2 Lighting and Shadows (The "Candlelight" Effect)**

A tavern is defined by its lighting—or lack thereof. We can simulate the warm, wavering light of a hearth or candle using CSS animations and box shadows.  
**Flickering Candle Animation:** We can add a subtle, warm glow to the active window or the chat log to simulate a candle sitting on the table near the document.12

CSS

@keyframes candle-flicker {  
  0% { box-shadow: 0 0 40px 10px rgba(255, 160, 0, 0.1); }  
  25% { box-shadow: 0 0 42px 12px rgba(255, 160, 0, 0.15); }  
  50% { box-shadow: 0 0 38px 9px rgba(255, 160, 0, 0.1); }  
  75% { box-shadow: 0 0 41px 11px rgba(255, 160, 0, 0.12); }  
  100% { box-shadow: 0 0 40px 10px rgba(255, 160, 0, 0.1); }  
}

.window-app.active {  
  animation: candle-flicker 4s infinite alternate ease-in-out;  
}

* **Insight:** The animation should be slow (4s) and subtle. Rapid flickering creates distraction and eye strain. The color rgba(255, 160, 0, 0.1) (warm orange) simulates firelight.

**Inset Shadows for Depth:**  
Input fields and content wells should look like they are recessed into the table or parchment, creating a tactile "sunk" effect.

* **CSS:** box-shadow: inset 2px 2px 5px rgba(0,0,0,0.3), inset \-1px \-1px 2px rgba(255,255,255,0.2);.30  
* **Reasoning:** The dark shadow on the top-left and light highlight on the bottom-right simulates a light source coming from the top-left (standard UI lighting convention), giving the input field 3D depth.

### **4.3 Diegetic UI Elements**

* **Torn Edges:** Use mask-image or clip-path with a jagged SVG shape to create irregular edges on chat bubbles or notes, simulating torn paper rather than perfect rectangles.7  
* **Wax Seals:** Use pseudo-elements (::after) to place SVG wax seals on official documents or to act as "closed" indicators on settings menus.  
* **Ribbons:** Navigation tabs can be styled as fabric bookmarks or ribbons protruding from the "book" (the window), rather than standard file-folder tabs.

## ---

**5\. UI Architecture: Implementation in Foundry VTT**

This section provides the technical roadmap for the LLM to generate the module code, specifically focusing on the ApplicationV2 standard introduced in newer Foundry versions (V11/V12).

### **5.1 Module Structure**

The module must follow the standard Foundry VTT package structure to ensure compatibility and ease of installation.32  
sword-coast-tavern/  
├── module.json \# Manifest file defining the module  
├── styles/  
│ ├── \_variables.scss \# CSS Custom Properties (Colors, fonts, spacing)  
│ ├── \_typography.scss \# Font imports and mixins  
│ ├── \_components.scss \# Buttons, inputs, tabs styling  
│ ├── \_window.scss \# ApplicationV2 overrides and frame styling  
│ └── style.scss \# Main entry point importing all partials  
├── scripts/  
│ ├── main.js \# Entry point, Hooks registrations  
│ ├── tavern-app.js \# Custom ApplicationV2 class definition  
│ └── api.js \# API for other modules to interact with  
├── templates/  
│ ├── tavern-shell.hbs \# Main window HTML template  
│ └── parts/ \# Tab partials (inventory, bio, spells)  
└── assets/  
├── textures/ \# Parchment, wood, leather patterns  
├── ui/ \# SVGs (seals, icons, ornate dividers)  
└── sounds/ \# UI sound effects (wood clicks, paper rustles)

### **5.2 ApplicationV2 Integration**

The module should extend foundry.applications.api.ApplicationV2 for its main interface windows.2 This class offers better performance, a more robust rendering cycle, and a modern event listener architecture compared to the legacy FormApplication.  
**Default Options Configuration:**  
The DEFAULT\_OPTIONS must be configured to support the custom classes and tagging required for the CSS styling.

JavaScript

static DEFAULT\_OPTIONS \= {  
  id: "sword-coast-tavern-ui",  
  classes: \["sc-tavern", "window-app"\], // Custom scope class for CSS isolation  
  tag: "div",  
  window: {  
    icon: "fas fa-dungeon", // FontAwesome icon (placeholder for custom SVG)  
    title: "Tavern Keeper's Journal",  
    resizable: true,  
    minimizable: true  
  },  
  position: {  
    width: 800,  
    height: 600  
  }  
};

### **5.3 Handlebars Templating Strategy**

Templates should be semantic HTML5, avoiding the "div soup" typical of older modules.4

* **Structure:** Use \<header\>, \<nav\>, \<main\>, and \<footer\> tags to define the window layout.  
* **Tabs:** Use the data-tab attribute system native to Foundry. The navigation bar should be styled as a wooden beam or a leather strip, with the tabs appearing as metal plaques or parchment bookmarks.36  
* **Partials:** Break down the UI into small, reusable components (e.g., stat-block.hbs, inventory-list.hbs) to maintain code cleanliness and reusability.

### **5.4 CSS Logic and Scoping**

To prevent CSS bleeding into other modules or the core Foundry UI (which could break other game systems), all styles must be strictly scoped.37

* **Namespace:** Wrap all CSS rules in .sc-tavern or a similar unique class applied to the top-level application window.  
* **Variables:** Use CSS Custom Properties (--sc-color-primary) defined at the :root or .sc-tavern level. This facilitates easy theming and allows for "Dark Mode" adjustments (which, in this context, might be "Night Mode" with cooler, bluer tones) without rewriting the entire stylesheet.

## ---

**6\. Specific Component Design**

Here we apply the aesthetic and technical principles to specific UI elements found in a typical D\&D module, customizing them for the Sword Coast setting.

### **6.1 The Character Sheet ("The Adventurer's Journal")**

The character sheet is the primary interface for players. It should resemble a leather-bound folio or a stack of field notes.

* **Background:** Dark leather texture for the outer container, lighter parchment for the data fields.  
* **Attributes (STR, DEX, etc.):** Displayed in circular frames resembling stamped coins or metal rims. The numbers should be large and serifed.  
* **Health/Resources:** Use red and blue "liquid" bars that bubble (using CSS animations) to represent HP and Mana/Slots. The texture of the bar should look like liquid in a vial.  
* **Inventory:** Grid layout resembling a backpack interior or a wooden table surface. Items are represented as cards with drop shadows, looking like physical objects placed on the table.38

### **6.2 The Chat Log ("The Scroll")**

The chat log is the narrative history of the game.

* **Container:** Style the chat window as a continuous scroll of parchment.  
* **Messages:** Each message block gets a subtle bottom border (border-bottom: 1px solid var(--color-sc-border-main)) that fades out at the edges (using border-image-source: linear-gradient(...)). This mimics entries in a logbook.  
* **Speaker Names:** Use the faction colors defined in Section 2.4. A message from a Harper NPC uses a blue/silver header; a Zhentarim NPC uses black/gold.  
* **Rolls:** The 3D dice tray remains canvas-based, but the *result cards* in chat should look like handwritten math notes. Critical successes should glow green/gold, and critical failures should glow red/crimson, utilizing text-shadow for the glow effect.

### **6.3 The Tavern Menu / Shop Interface**

A critical part of the tavern theme is the interaction with merchants.

* **Layout:** A two-column grid. Left: Menu categories (Drinks, Food, Lodging) styled as a chalkboard or hanging wooden signs. Right: The item details on a paper texture.  
* **Icons:** Use SVG icons for tankards, bread, and beds. Style them with a sepia filter (filter: sepia(1)) to make them look like ink illustrations rather than modern vector art.39  
* **Currency:** Instead of the generic "GP", use icons of coins specific to the setting (gold dragons of Waterdeep, silver shards). These can be sourced as transparent PNGs or SVGs.41

## ---

**7\. UX Interactions and Sound Design**

A tavern is a noisy, tactile place. The UI should reflect this through audio feedback, leveraging Foundry’s AudioHelper class.

### **7.1 Auditory Feedback**

Sound design reinforces the materiality of the interface.

* **Window Open:** The sound of a heavy book opening or a scroll unrolling.  
* **Button Hover:** A subtle "scuff" sound, like sliding a mug on a wooden table.  
* **Button Click:** A distinct "thud" (wood) or "scratch" (quill) depending on the context.43  
* **Tab Switch:** The rustle of paper pages turning.

**Implementation:** Use AudioHelper.play() attached to standard DOM event listeners (click, mouseenter) within the Application class.44

JavaScript

// Example implementation in the Application class  
activateListeners(html) {  
  super.activateListeners(html);  
  html.find('button').click(event \=\> {  
    // Play a random wood click sound from an array for variety  
    const clicks \= \["wood-click-1.ogg", "wood-click-2.ogg"\];  
    const src \= \`modules/sword-coast-tavern/sounds/${clicks\[Math.floor(Math.random() \* clicks.length)\]}\`;  
    AudioHelper.play({src: src, volume: 0.8}, false);  
  });  
}

### **7.2 Micro-Interactions**

* **Hover States:** When hovering over a button, do not just change the color. Add a transform: translateY(-1px) to lift it slightly, and increase the box-shadow to simulate physical lift.46  
* **Loading States:** Instead of a generic spinning circle, use a filling tankard animation or a quill writing on parchment.

## ---

**8\. Implementation Guide for the LLM**

This section provides specific, actionable instructions to be passed to an LLM code generation tool to ensure the output matches this design report.  
**Prompting Strategy for the LLM:**

1. **Context:** Explicitly state: "You are an expert Foundry VTT module developer using V11/V12 API standards."  
2. **Asset Handling:** Instruct the LLM to use placeholders (e.g., https://placehold.co/) for images but generate the full CSS required to style real textures.  
3. **SCSS Structure:** Explicitly request nested SCSS to keep the styling organized and maintainable.  
4. **Handlebars:** Request semantic HTML with proper data-tab attributes and accessibility (ARIA) tags.

**Code Requirements:**

* **Class Extension:** Must extend ApplicationV2 (or HandlebarsApplicationMixin(ApplicationV2)).  
* **CSS Variables:** All colors and spacing must use CSS variables defined in a :root block.  
* **Localization:** All text strings must use {{localize "KEY"}} in Handlebars and game.i18n.localize() in JS to support translation.5

### **8.1 Suggested CSS Snippets for the LLM**

**Wood Texture Border:**

CSS

.sc-tavern-window {  
  border: 15px solid transparent;  
  border-image: url('../assets/textures/wood-frame-slice.png') 30 stretch;  
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);  
}

**Parchment Background with Blend Mode:**

CSS

.sc-tavern-content {  
  background-color: \#FCF5E5;  
  background-image: url('../assets/textures/paper-grain.png');  
  background-blend-mode: multiply;  
}

**Text Shadow for Legibility:**

CSS

.sc-tavern-header {  
  font-family: 'Modesto Condensed', serif;  
  color: \#3E2723;  
  text-shadow: 0 1px 0 rgba(255,255,255,0.4);  
}

## ---

**9\. Conclusion**

The "Sword Coast Tavern" module represents a holistic and detailed approach to VTT interface design. By moving away from flat, modern aesthetics and embracing the textures, lighting, and materials of the Forgotten Realms, we create a more immersive and engaging experience for players. This report provides the aesthetic foundation (Sections 1-3), the visual techniques (Section 4), and the technical architecture (Sections 5-8) required to build this module.  
The success of this design lies in the execution of the details: the subtle flicker of the candle, the tactile grain of the wood, and the satisfying rustle of the parchment. When implemented correctly, the UI ceases to be a barrier between the player and the game; it becomes an integral part of the world itself.

### **Reference Table: Key Assets & Styles**

| Component | Asset Type | Style/CSS | Reference |
| :---- | :---- | :---- | :---- |
| **Background** | Pattern (PNG) | Parchment / Vellum | 11 |
| **Window Frame** | Slice-9 (PNG) | Dark Oak / Iron | 10 |
| **Body Font** | WOFF2 | Bookinsanity | 25 |
| **Header Font** | WOFF2 | Modesto Condensed | 25 |
| **Accent Color** | CSS Var | \#C37E3F (Gold) | 22 |
| **Animation** | Keyframes | Candle Flicker | 12 |
| **Icons** | SVG | Hand-drawn/Woodcut | 13 |

This design document serves as the "source of truth" for the coding phase, ensuring that every line of CSS and JavaScript serves the ultimate goal: transporting the player to a warm table in a bustling tavern on the Sword Coast.

#### **Works cited**

1. Does the Sword Coast have a premise? : r/DnD \- Reddit, accessed January 23, 2026, [https://www.reddit.com/r/DnD/comments/1dztnyd/does\_the\_sword\_coast\_have\_a\_premise/](https://www.reddit.com/r/DnD/comments/1dztnyd/does_the_sword_coast_have_a_premise/)  
2. ApplicationV2 | Foundry Virtual Tabletop \- API Documentation, accessed January 23, 2026, [https://foundryvtt.com/api/v12/classes/foundry.applications.api.ApplicationV2.html](https://foundryvtt.com/api/v12/classes/foundry.applications.api.ApplicationV2.html)  
3. ApplicationV2 | Foundry Virtual Tabletop \- API Documentation, accessed January 23, 2026, [https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)  
4. Making a FormApplication \- HackMD, accessed January 23, 2026, [https://hackmd.io/@akrigline/BydTjjGpu](https://hackmd.io/@akrigline/BydTjjGpu)  
5. HandlebarsHelpers | Foundry Virtual Tabletop \- API Documentation, accessed January 23, 2026, [https://foundryvtt.com/api/v12/classes/client.HandlebarsHelpers.html](https://foundryvtt.com/api/v12/classes/client.HandlebarsHelpers.html)  
6. background-blend-mode \- CSS \- MDN Web Docs, accessed January 23, 2026, [https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-blend-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/background-blend-mode)  
7. How to Make a Ripped Paper Edge in Photoshop \- YouTube, accessed January 23, 2026, [https://www.youtube.com/watch?v=8rXPKDyEFmY](https://www.youtube.com/watch?v=8rXPKDyEFmY)  
8. filter \- CSS \- MDN Web Docs \- Mozilla, accessed January 23, 2026, [https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/filter)  
9. 642 Leather Background High Res Illustrations \- Getty Images, accessed January 23, 2026, [https://www.gettyimages.in/illustrations/leather-background](https://www.gettyimages.in/illustrations/leather-background)  
10. Wood Pattern Background | Pixeden Club, accessed January 23, 2026, [https://www.pixeden.com/graphic-web-backgrounds/wood-pattern-background](https://www.pixeden.com/graphic-web-backgrounds/wood-pattern-background)  
11. Parchment \- HTML Color Codes, accessed January 23, 2026, [https://htmlcolorcodes.com/colors/parchment/](https://htmlcolorcodes.com/colors/parchment/)  
12. Create a Realistic Candle Animation with HTML CSS \- CodeWebStack, accessed January 23, 2026, [https://codewebstack.com/create-a-realistic-candle-animation-with-html-css/](https://codewebstack.com/create-a-realistic-candle-animation-with-html-css/)  
13. Dnd Class Icons Svg \- Etsy Australia, accessed January 23, 2026, [https://www.etsy.com/au/market/dnd\_class\_icons\_svg](https://www.etsy.com/au/market/dnd_class_icons_svg)  
14. Medieval Tavern PNG Transparent Images Free Download, accessed January 23, 2026, [https://pngtree.com/so/medieval-tavern](https://pngtree.com/so/medieval-tavern)  
15. Blending Modes in CSS \- Ahmad Shadeed, accessed January 23, 2026, [https://ishadeed.com/article/blending-modes-css/](https://ishadeed.com/article/blending-modes-css/)  
16. Creating Glow Effects with CSS \- Coder's Block, accessed January 23, 2026, [https://codersblock.com/blog/creating-glow-effects-with-css/](https://codersblock.com/blog/creating-glow-effects-with-css/)  
17. Foundry's Built-in CSS Framework, accessed January 23, 2026, [https://foundryvtt.wiki/en/development/guides/builtin-css](https://foundryvtt.wiki/en/development/guides/builtin-css)  
18. Parchment \#fefcaf Hex Color (Shades & Complementary ... \- ColorKit, accessed January 23, 2026, [https://colorkit.co/color/fefcaf/](https://colorkit.co/color/fefcaf/)  
19. Parchment and Ink Palette \- Lospec, accessed January 23, 2026, [https://lospec.com/palette-list/parchment-and-ink](https://lospec.com/palette-list/parchment-and-ink)  
20. Textures & Overlays | Automatic CSS Documentation, accessed January 23, 2026, [https://docs.automaticcss.com/textures-overlays](https://docs.automaticcss.com/textures-overlays)  
21. Cool Parchment Tones Color Palette, accessed January 23, 2026, [https://www.color-hex.com/color-palette/1069905](https://www.color-hex.com/color-palette/1069905)  
22. Parchment Paper \#2 Color Scheme \- Palettes \- SchemeColor.com, accessed January 23, 2026, [https://www.schemecolor.com/parchment-paper-2-color-palette.php](https://www.schemecolor.com/parchment-paper-2-color-palette.php)  
23. So what do the Harpers actually do? : r/Forgotten\_Realms \- Reddit, accessed January 23, 2026, [https://www.reddit.com/r/Forgotten\_Realms/comments/r9xh44/so\_what\_do\_the\_harpers\_actually\_do/](https://www.reddit.com/r/Forgotten_Realms/comments/r9xh44/so_what_do_the_harpers_actually_do/)  
24. Zhentarim Symbol : r/DnD \- Reddit, accessed January 23, 2026, [https://www.reddit.com/r/DnD/comments/awwyfo/zhentarim\_symbol/](https://www.reddit.com/r/DnD/comments/awwyfo/zhentarim_symbol/)  
25. Solbera's Dungeons and Dragons Fifth Edition Fonts, accessed January 23, 2026, [https://benlk.github.io/solbera-dnd-fonts/](https://benlk.github.io/solbera-dnd-fonts/)  
26. Use of a typographic scale for the header sizes? \#4965 \- GitHub, accessed January 23, 2026, [https://github.com/WordPress/gutenberg/issues/4965](https://github.com/WordPress/gutenberg/issues/4965)  
27. The typographic scale \- Spencer Mortensen, accessed January 23, 2026, [https://spencermortensen.com/articles/typographic-scale/](https://spencermortensen.com/articles/typographic-scale/)  
28. Quick Tip: How To Create CSS Text Effects Using Only The text ..., accessed January 23, 2026, [https://medialoot.com/blog/quick-tip-how-to-create-css-text-effects-using-only-the-text-shadow-attribu/](https://medialoot.com/blog/quick-tip-how-to-create-css-text-effects-using-only-the-text-shadow-attribu/)  
29. CSS Snippets: Add a texture overlay to an entire webpage \- Medium, accessed January 23, 2026, [https://medium.com/@erikritter/css-snippets-add-a-texture-overlay-to-an-entire-webpage-b0bfdfd02c45](https://medium.com/@erikritter/css-snippets-add-a-texture-overlay-to-an-entire-webpage-b0bfdfd02c45)  
30. Inner glow effect of button \- css \- Stack Overflow, accessed January 23, 2026, [https://stackoverflow.com/questions/4625058/inner-glow-effect-of-button](https://stackoverflow.com/questions/4625058/inner-glow-effect-of-button)  
31. Ripped paper effect with css mask \- Stack Overflow, accessed January 23, 2026, [https://stackoverflow.com/questions/75671911/ripped-paper-effect-with-css-mask](https://stackoverflow.com/questions/75671911/ripped-paper-effect-with-css-mask)  
32. Intro To Foundry Module Development \- Bringing Fire, accessed January 23, 2026, [https://bringingfire.com/blog/intro-to-foundry-module-development](https://bringingfire.com/blog/intro-to-foundry-module-development)  
33. Introduction to Module Development | Foundry Virtual Tabletop, accessed January 23, 2026, [https://foundryvtt.com/article/module-development/](https://foundryvtt.com/article/module-development/)  
34. ApplicationV2 Conversion Guide | Foundry VTT Community Wiki, accessed January 23, 2026, [https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide](https://foundryvtt.wiki/en/development/guides/applicationV2-conversion-guide)  
35. 1\. Template Basics | Foundry VTT Community Wiki, accessed January 23, 2026, [https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Template-Basics](https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Template-Basics)  
36. 2\. Extending FormApplication with Tabbed Template, accessed January 23, 2026, [https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Tabs-FormApplication](https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Tabs-FormApplication)  
37. CSS Cascade Layers | Foundry VTT Community Wiki, accessed January 23, 2026, [https://foundryvtt.wiki/en/development/guides/css-cascade-layers](https://foundryvtt.wiki/en/development/guides/css-cascade-layers)  
38. Fantasy RPG UI | Foundry Virtual Tabletop, accessed January 23, 2026, [https://foundryvtt.com/packages/fantasy-rpg-ui](https://foundryvtt.com/packages/fantasy-rpg-ui)  
39. 7 CSS Image Effects For Making Awesome Vintage Photos, accessed January 23, 2026, [https://dev.to/codingdudecom/7-css-image-effects-for-making-awesome-vintage-photos-51h2?comments\_sort=oldest](https://dev.to/codingdudecom/7-css-image-effects-for-making-awesome-vintage-photos-51h2?comments_sort=oldest)  
40. Medieval Tavern Icons \- Free Download in SVG, PNG \- IconScout, accessed January 23, 2026, [https://iconscout.com/icons/medieval-tavern](https://iconscout.com/icons/medieval-tavern)  
41. Free RPG Currency Game 512x512 Icons \- CraftPix.net, accessed January 23, 2026, [https://craftpix.net/freebies/free-rpg-currency-game-512x512-icons/](https://craftpix.net/freebies/free-rpg-currency-game-512x512-icons/)  
42. Fantasy Gold Coins Clipart, DND Coins Gold PNG Fantasy Currency ..., accessed January 23, 2026, [https://www.etsy.com/listing/1721185752/fantasy-gold-coins-clipart-dnd-coins](https://www.etsy.com/listing/1721185752/fantasy-gold-coins-clipart-dnd-coins)  
43. Module to add a sound button to player's tokens : r/FoundryVTT, accessed January 23, 2026, [https://www.reddit.com/r/FoundryVTT/comments/124zhp5/module\_to\_add\_a\_sound\_button\_to\_players\_tokens/](https://www.reddit.com/r/FoundryVTT/comments/124zhp5/module_to_add_a_sound_button_to_players_tokens/)  
44. AudioHelper | Foundry Virtual Tabletop \- API Documentation, accessed January 23, 2026, [https://foundryvtt.com/api/v11/classes/client.AudioHelper.html](https://foundryvtt.com/api/v11/classes/client.AudioHelper.html)  
45. AudioHelper | Foundry Virtual Tabletop \- API Documentation, accessed January 23, 2026, [https://foundryvtt.com/api/classes/foundry.audio.AudioHelper.html](https://foundryvtt.com/api/classes/foundry.audio.AudioHelper.html)  
46. Styling with the CSS box-shadow property \- LogRocket Blog, accessed January 23, 2026, [https://blog.logrocket.com/box-shadow-css/](https://blog.logrocket.com/box-shadow-css/)  
47. 60 Leather Background Textures, accessed January 23, 2026, [https://textures.world/nature/60-leather-background-textures/](https://textures.world/nature/60-leather-background-textures/)