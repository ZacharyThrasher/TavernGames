
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { MODULE_ID, getState } from "../state.js";
import { ParticleFactory } from "./particle-fx.js"; // V5.12

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
            const actor = u?.character;

            // 1. Try State Data (if valid)
            let img = pData?.avatar || pData?.img;
            let name = pData?.name;

            // 2. Fallback to Live Actor Data if state is missing or "mystery-man"
            const isDefault = !img || img.includes("mystery-man");
            if (isDefault) {
                // Try Token Image first (if unlinked/specific)
                const token = actor?.token ?? (actor ? canvas.tokens.placeables.find(t => t.actor?.id === actor.id) : null);
                if (token) img = token.texture?.src || token.img;

                // Then Actor Image
                if ((!img || img.includes("mystery-man")) && actor) img = actor.img;

                // Then User Avatar
                if ((!img || img.includes("mystery-man")) && u) img = u.avatar;
            }

            // 3. Fallback Name
            if (!name) name = actor?.name || u?.name || "Player";
            if (!img) img = "icons/svg/mystery-man.svg";

            return { name, img };
        };

        const actorInfo = resolveActorInfo(options.userId);
        const targetInfo = options.targetId ? resolveActorInfo(options.targetId) : null;

        console.log(`Tavern | Cinematic Show: ${options.type}`, { actorInfo, targetInfo });

        // 3. Instantiate & Render
        const overlay = new CinematicOverlay({
            window: { title: "Cinematic" }
        });

        // Pass data via context
        // Pass data via context
        // V4.8.56: Versus Mode completely scrapped per user request.
        // Duel & Staredown = System Event (Text Only)
        // Skills (Bump/Goad) = Standard (Single Portrait)
        const isSystemEvent = options.type === "DUEL" || options.type === "STAREDOWN";
        const isVersus = false; // Always false now

        overlay.cutInData = {
            type: options.type,
            // Force null image for system events to prevent portrait rendering
            img: isSystemEvent ? null : actorInfo?.img,
            name: actorInfo?.name || "",
            targetImg: isSystemEvent ? null : targetInfo?.img,
            targetName: targetInfo?.name,
            isVersus: isVersus,
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
            case "ACCUSE": return "#c0392b";    // Accusatory Red
            case "STAREDOWN": return "#2c3e50"; // Dramatic Dark Blue/Grey
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

    _onRender(context, options) {
        super._onRender(context, options);

        // V5.12: Victory Effects
        if (this.cutInData.type === "VICTORY") {
            const container = this.element.querySelector(".cinematic-particles");
            if (container) {
                // Dynamically import to avoid circular dep issues in some contexts, or just standard import
                // Using standard import at top of file is better, we'll add that.
                ParticleFactory.spawnCoinShower(container, 50);
            }

            // Rolling Counter
            if (this.cutInData.resultData?.amount) {
                const amountEl = this.element.querySelector(".gold-text");
                if (amountEl) {
                    this._animateCounter(amountEl, 0, this.cutInData.resultData.amount, 1500);
                }
            }
        }
    }

    _animateCounter(element, start, end, duration) {
        const range = end - start;
        const startTime = Date.now();
        element.classList.add("rolling");

        const update = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease Out Quart
            const ease = 1 - Math.pow(1 - progress, 4);

            const current = Math.floor(start + (range * ease));
            element.textContent = `${current}gp`;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.classList.remove("rolling");
                // Final pop
                element.style.transform = "scale(1.5)";
                setTimeout(() => element.style.transform = "scale(1)", 200);
            }
        };

        requestAnimationFrame(update);
    }
}
