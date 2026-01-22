
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { MODULE_ID, getState } from "../state.js";

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

        // 2. Resolve Art & Name from State/Token (V4.7.1 Fix)
        // 2. Resolve Art & Name from State/Token
        const state = getState();

        const resolveActorInfo = (uid) => {
            if (!uid) return null;
            const pData = state.players?.[uid];
            const u = game.users.get(uid);
            let i, n;

            // Token priority
            const act = u?.character;
            const tok = act ? canvas.tokens.placeables.find(t => t.actor?.id === act.id) : null;
            if (tok) { i = tok.document.texture.src; n = tok.document.name; }

            // State priority
            if (!i && pData) { i = pData.avatar; n = pData.name; }

            // Fallback
            if (!i) {
                i = act?.img || u?.avatar || "icons/svg/mystery-man.svg";
                n = act?.name || u?.name || "Player";
            }
            return { img: i, name: n };
        };

        const actorInfo = resolveActorInfo(options.userId);
        const targetInfo = options.targetId ? resolveActorInfo(options.targetId) : null;

        console.log(`Tavern | Cinematic Show: ${options.type}`, { actorInfo, targetInfo });

        // 3. Instantiate & Render
        const overlay = new CinematicOverlay({
            window: { title: "Cinematic" }
        });

        // Pass data via context
        overlay.cutInData = {
            type: options.type,
            img: actorInfo.img,
            name: actorInfo.name,
            targetImg: targetInfo?.img,
            targetName: targetInfo?.name,
            isVersus: !!targetInfo,
            text: options.text || options.type,
            color: CinematicOverlay.getColorForType(options.type),
            // V4.7.6: Result Data
            resultData: options.resultData
        };

        try {
            await overlay.render(true);

            // 4. Auto-close after animation duration
            // Animation is usually ~2-3s
            setTimeout(() => {
                overlay.close();
            }, 5000);

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
            case "FORESIGHT": return "#9b59b6"; // Mystical Purple
            case "GOAD": return "#e67e22";      // Aggressive Orange
            case "PROFILE": return "#1abc9c";   // Detective Cyan
            case "BUMP": return "#d35400";      // Punchy Amber/Red
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
            isVersus: this.cutInData.isVersus,
            targetImg: this.cutInData.targetImg,
            targetName: this.cutInData.targetName,
        };
    }
}
