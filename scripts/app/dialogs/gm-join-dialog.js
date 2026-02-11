import { MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GMJoinDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-gm-join-dialog",
    tag: "div",
    window: {
      title: "Join the Game",
      icon: "fa-solid fa-chair",
      resizable: false
    },
    position: {
      width: 380,
      height: "auto"
    },
    classes: ["tavern-dialog-window", "tavern-gm-join"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/gm-join-dialog.hbs`
    }
  };

  static async show(params = {}) {
    return new Promise((resolve) => {
      new GMJoinDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.resolve = options.resolve;
    this.params = options;
    this._resolved = false;
  }

  async _prepareContext() {
    const selectedActor = this.params.selectedActor ?? null;
    const ante = Number(this.params.ante ?? 5);
    const defaultWallet = Math.max(1, Math.floor(ante * 20));

    return {
      hasNpc: Boolean(selectedActor && selectedActor.type === "npc"),
      selectedActor: selectedActor
        ? {
          id: selectedActor.id,
          name: selectedActor.name ?? "NPC",
          img: selectedActor.img || "icons/svg/mystery-man.svg"
        }
        : null,
      ante,
      defaultWallet
    };
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this.resolve?.(value);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const houseBtn = this.element.querySelector("[data-action=\"house\"]");
    if (houseBtn) {
      houseBtn.addEventListener("click", async () => {
        this._resolve({ playAsNpc: false });
        await this.close();
      });
    }

    const npcBtn = this.element.querySelector("[data-action=\"npc\"]");
    if (npcBtn) {
      npcBtn.addEventListener("click", async () => {
        const actor = this.params.selectedActor;
        if (!actor || actor.type !== "npc") return;

        const walletInput = this.element.querySelector("[name=\"npcWallet\"]");
        const raw = Number.parseInt(walletInput?.value ?? "", 10);
        const fallback = Math.max(1, Math.floor(Number(this.params.ante ?? 5) * 20));
        const initialWallet = Number.isInteger(raw) && raw > 0 ? raw : fallback;

        this._resolve({
          playAsNpc: true,
          actorId: actor.id,
          actorName: actor.name ?? "NPC",
          actorImg: actor.img || "icons/svg/mystery-man.svg",
          initialWallet
        });
        await this.close();
      });
    }

    const cancelBtn = this.element.querySelector("[data-action=\"cancel\"]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", async () => {
        this._resolve(null);
        await this.close();
      });
    }
  }

  async close(options) {
    if (!this._resolved) this._resolve(null);
    return super.close(options);
  }
}
