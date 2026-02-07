
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { MODULE_ID, getState } from "../state.js";
import { ParticleFactory } from "./particle-fx.js";

/**
 * Cinematic Overlay for Tavern Games — V5.24 PIZAZZ Overhaul
 * Anime/Fighting-Game Cut-In meets Dark Fantasy.
 * Multi-layer parallax entrance, per-type particles, screen shake,
 * exit sequence, emblem watermarks, chromatic flash.
 */
export class CinematicOverlay extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        tag: "aside",
        id: "tavern-cinematic-overlay",
        window: {
            frame: false,
            positioned: false,
            minimizable: false,
            controls: []
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

    /** Icon map — large watermark emblem per type (FA6 Free) */
    static EMBLEM_MAP = {
        CRITICAL:     "fa-solid fa-star",
        BUST:         "fa-solid fa-skull",
        VICTORY:      "fa-solid fa-crown",
        DUEL:         "fa-solid fa-khanda",
        SUDDEN_DEATH: "fa-solid fa-skull-crossbones",
        COIN_STAGE:   "fa-solid fa-coins",
        FORESIGHT:    "fa-solid fa-eye",
        GOAD:         "fa-solid fa-hand-fist",
        PROFILE:      "fa-solid fa-magnifying-glass",
        BUMP:         "fa-solid fa-hand-back-fist",
        ACCUSE:       "fa-solid fa-gavel",
        STAREDOWN:    "fa-solid fa-eye-low-vision",
        BOOT:         "fa-solid fa-shoe-prints",
        BOOT_EARNED:  "fa-solid fa-trophy",
    };

    /** Particle theme map per type */
    static PARTICLE_MAP = {
        CRITICAL:     { method: "spawnSparkBurst", args: [40, "gold"] },
        BUST:         { method: "spawnSparkBurst", args: [35, "blood"] },
        VICTORY:      { method: "spawnCoinShower", args: [60] },
        DUEL:         { method: "spawnSparkBurst", args: [30, "ember"] },
        SUDDEN_DEATH: { method: "spawnSparkBurst", args: [35, "blood"] },
        COIN_STAGE:   { method: "spawnCoinShower", args: [30] },
        FORESIGHT:    { method: "spawnArcaneBurst", args: [35] },
        GOAD:         { method: "spawnSparkBurst", args: [25, "ember"] },
        PROFILE:      { method: "spawnSparkBurst", args: [20, "arcane"] },
        BUMP:         { method: "spawnSparkBurst", args: [30, "ember"] },
        ACCUSE:       { method: "spawnSparkBurst", args: [25, "blood"] },
        STAREDOWN:    { method: "spawnArcaneBurst", args: [20] },
        BOOT:         { method: "spawnSparkBurst", args: [25, "mint"] },
        BOOT_EARNED:  { method: "spawnSparkBurst", args: [30, "gold"] },
    };

    /** Types that shake the screen on impact */
    static SHAKE_TYPES = new Set([
        "BUST", "BUMP", "SUDDEN_DEATH", "ACCUSE", "BOOT", "DUEL", "CRITICAL"
    ]);

    /**
     * Show a cinematic cut-in
     */
    static async show(options) {
        const performanceMode = game.settings.get(MODULE_ID, "performanceMode");
        if (performanceMode) return;

        const state = getState();

        const resolveActorInfo = (uid) => {
            if (!uid) return null;
            const pData = state.players?.[uid];
            const u = game.users.get(uid);
            const actor = u?.character;

            let img = pData?.avatar || pData?.img;
            let name = pData?.name;

            const isDefault = !img || img.includes("mystery-man");
            if (isDefault) {
                const token = actor?.token ?? (actor ? canvas.tokens.placeables.find(t => t.actor?.id === actor.id) : null);
                if (token) img = token.texture?.src || token.img;
                if ((!img || img.includes("mystery-man")) && actor) img = actor.img;
                if ((!img || img.includes("mystery-man")) && u) img = u.avatar;
            }

            if (!name) name = actor?.name || u?.name || "Player";
            if (!img) img = "icons/svg/mystery-man.svg";

            return { name, img };
        };

        const actorInfo = resolveActorInfo(options.userId);
        const targetInfo = options.targetId ? resolveActorInfo(options.targetId) : null;

        const overlay = new CinematicOverlay({
            window: { title: "Cinematic" }
        });

        const isSystemEvent = options.type === "DUEL" || options.type === "STAREDOWN" || options.type === "SUDDEN_DEATH";
        const isVersus = false;

        overlay.cutInData = {
            type: options.type,
            img: isSystemEvent ? null : actorInfo?.img,
            name: actorInfo?.name || "",
            targetImg: isSystemEvent ? null : targetInfo?.img,
            targetName: targetInfo?.name,
            isVersus: isVersus,
            text: options.text || options.type,
            color: CinematicOverlay.getColorForType(options.type),
            emblemIcon: CinematicOverlay.EMBLEM_MAP[options.type] || null,
            resultData: options.resultData
        };

        try {
            await overlay.render(true);

            // Exit animation before close
            const DISPLAY_DURATION = 4200;
            const EXIT_DURATION = 450;

            setTimeout(() => {
                const cutIn = overlay.element?.querySelector(".cinematic-cut-in");
                if (cutIn) cutIn.classList.add("cin-exiting");
            }, DISPLAY_DURATION);

            setTimeout(() => {
                overlay.close();
            }, DISPLAY_DURATION + EXIT_DURATION);

        } catch (err) {
            console.error("Tavern Games | Cinematic Render Error:", err);
        }
    }

    static getColorForType(type) {
        switch (type) {
            case "CRITICAL": return "#ffd700";
            case "BUST": return "#dc3545";
            case "VICTORY": return "#ffd700";
            case "DUEL": return "#f1c40f";
            case "SUDDEN_DEATH": return "#ff3c2a";
            case "COIN_STAGE": return "#d4a63a";
            case "FORESIGHT": return "#9b59b6";
            case "GOAD": return "#e67e22";
            case "PROFILE": return "#1abc9c";
            case "BUMP": return "#d35400";
            case "ACCUSE": return "#c0392b";
            case "STAREDOWN": return "#3498db";
            case "BOOT": return "#6ab04c";
            case "BOOT_EARNED": return "#c07a1f";
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

        const type = this.cutInData.type;
        const container = this.element.querySelector(".cin-particles");

        // ── Type-specific particles ──
        const particleConfig = CinematicOverlay.PARTICLE_MAP[type];
        if (particleConfig && container) {
            const method = ParticleFactory[particleConfig.method];
            if (method) {
                // Stagger particle spawn slightly after entrance
                setTimeout(() => {
                    method.call(ParticleFactory, container, ...particleConfig.args);
                }, 450);
            }
        }

        // ── Screen shake on impact types ──
        if (CinematicOverlay.SHAKE_TYPES.has(type)) {
            setTimeout(() => {
                try {
                    const body = document.body;
                    const intensity = type === "SUDDEN_DEATH" ? 6 : 4;
                    const dur = type === "SUDDEN_DEATH" ? 500 : 350;
                    body.style.transition = "none";
                    let steps = 0;
                    const shakeInterval = setInterval(() => {
                        const x = (Math.random() - 0.5) * intensity * 2;
                        const y = (Math.random() - 0.5) * intensity * 2;
                        body.style.transform = `translate(${x}px, ${y}px)`;
                        steps++;
                        if (steps > dur / 30) {
                            clearInterval(shakeInterval);
                            body.style.transform = "";
                            body.style.transition = "";
                        }
                    }, 30);
                } catch { /* shake is optional visual */ }
            }, 350);
        }

        // ── Victory: Coin shower + gold counter ──
        if (type === "VICTORY") {
            if (container) {
                setTimeout(() => ParticleFactory.spawnCoinShower(container, 50), 600);
            }
            if (this.cutInData.resultData?.amount) {
                const amountEl = this.element.querySelector(".cin-victory-overlay .gold-text");
                if (amountEl) {
                    setTimeout(() => {
                        this._animateCounter(amountEl, 0, this.cutInData.resultData.amount, 1500);
                    }, 900);
                }
            }
        }

        // ── Critical: Extra gold sparks ──
        if (type === "CRITICAL" && container) {
            setTimeout(() => ParticleFactory.spawnSparkBurst(container, 25, "gold"), 700);
        }

        // ── Bust: Second wave of blood sparks ──
        if (type === "BUST" && container) {
            setTimeout(() => ParticleFactory.spawnSparkBurst(container, 20, "blood"), 800);
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
                element.style.transform = "scale(1.5)";
                setTimeout(() => element.style.transform = "scale(1)", 200);
            }
        };

        requestAnimationFrame(update);
    }
}

