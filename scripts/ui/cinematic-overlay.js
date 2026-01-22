
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { MODULE_ID } from "../state.js";

/**
 * Cinematic Overlay for Tavern Games
 * Implements V13 "Frameless Window" pattern for cut-ins.
 * Reference: Foundry V13 Module Development Guide, Section 5.3
 */
export class CinematicOverlay extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: "aside",
        id: "tavern-cinematic-overlay",
        window: {
            frame: false,       // V13 Guide 5.3.1: Frameless
            positioned: false,  // CSS fixed positioning
            minimizable: false,
            controls: []        // No header controls
        },
        position: {
            width: "100%",
            height: "100%"
        }
    };

    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/templates/cinematic-overlay.hbs`,
        },
    };

    /**
     * Show a cinematic cut-in
     * @param {Object} options
     * @param {string} options.type - "CRITICAL", "BUST", "VICTORY", "DUEL"
     * @param {string} options.userId - User ID of the subject
     * @param {string} [options.text] - Override text (optional)
     * @returns {Promise<void>}
     */
    static async show(options) {
        // 1. Check Performance Mode
        const performanceMode = game.settings.get(MODULE_ID, "performanceMode");
        if (performanceMode) return;

        // 2. Prepare Data
        const user = game.users.get(options.userId);
        const actor = user?.character;
        const img = actor?.img || user?.avatar || "icons/svg/mystery-man.svg";
        const name = actor?.name || user?.name || "Player";

        // 3. Instantiate & Render
        // We create a fresh instance for each cut-in to ensure clean state
        const overlay = new CinematicOverlay({
            window: { title: "Cinematic" } // Internal title, not shown due to frame:false
        });

        // Pass data via context
        overlay.cutInData = {
            type: options.type,
            img,
            name,
            text: options.text || options.type,
            color: CinematicOverlay.getColorForType(options.type)
        };

        try {
            await overlay.render(true);

            // 4. Auto-close after animation duration
            // Animation is usually ~2-3s
            setTimeout(() => {
                overlay.close();
            }, 3500);

        } catch (err) {
            console.error("Tavern Games | Cinematic Render Error:", err);
        }
    }

    static getColorForType(type) {
        switch (type) {
            case "CRITICAL": return "var(--tavern-gold)";
            case "BUST": return "var(--tavern-danger)";
            case "VICTORY": return "var(--tavern-gold-bright)";
            case "DUEL": return "var(--tavern-info)";
            default: return "var(--tavern-parchment)";
        }
    }

    async _prepareContext(options) {
        return {
            ...this.cutInData,
            isCritical: this.cutInData.type === "CRITICAL",
            isBust: this.cutInData.type === "BUST",
            isVictory: this.cutInData.type === "VICTORY",
            isDuel: this.cutInData.type === "DUEL",
        };
    }
}
