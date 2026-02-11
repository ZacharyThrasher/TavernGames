import { MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GoblinHoldDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-goblin-hold-dialog",
    tag: "div",
    window: {
      title: "Hold or Continue?",
      icon: "fa-solid fa-hand",
      resizable: false
    },
    position: {
      width: 380,
      height: "auto"
    },
    classes: ["tavern-dialog-window", "tavern-goblin-hold"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/goblin-hold-dialog.hbs`
    }
  };

  static async show() {
    return new Promise((resolve) => {
      new GoblinHoldDialog({ resolve }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.resolve = options.resolve;
    this._resolved = false;
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this.resolve?.(value);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const holdBtn = this.element.querySelector("[data-action=\"hold\"]");
    if (holdBtn) {
      holdBtn.addEventListener("click", async () => {
        this._resolve("hold");
        await this.close();
      });
    }

    const continueBtn = this.element.querySelector("[data-action=\"continue\"]");
    if (continueBtn) {
      continueBtn.addEventListener("click", async () => {
        this._resolve("continue");
        await this.close();
      });
    }
  }

  async close(options) {
    if (!this._resolved) this._resolve("continue");
    return super.close(options);
  }
}
