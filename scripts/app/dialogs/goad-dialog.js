import { MODULE_ID } from "../../twenty-one/constants.js";
import { attachPortraitSelection } from "./portrait-selection.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class GoadDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-goad-dialog",
    tag: "div",
    window: {
      title: "Goad",
      icon: "fa-solid fa-comments",
      resizable: false
    },
    position: {
      width: 460,
      height: "auto"
    },
    classes: ["tavern-dialog-window"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/goad-dialog.hbs`
    }
  };

  static async show(params) {
    return new Promise((resolve) => {
      new GoadDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.params = options;
    this.resolve = options.resolve;
    this.selectedTargetId = null;
    this._resolved = false;
  }

  async _prepareContext() {
    const { targets, itmMod, perMod } = this.params;
    const defaultSkill = itmMod >= perMod ? "itm" : "per";
    return {
      targets: targets ?? [],
      itmMod,
      perMod,
      defaultSkill,
      formatMod: (mod) => mod >= 0 ? `+${mod}` : mod
    };
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this.resolve?.(value);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const form = this.element.querySelector("form");
    if (form) form.addEventListener("submit", this._onSubmit.bind(this));

    const html = $(this.element);
    attachPortraitSelection(html, {
      onSelect: (id) => {
        this.selectedTargetId = id;
      }
    });

    const cancelBtn = this.element.querySelector("[data-action=\"cancel\"]");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", async () => {
        this._resolve(null);
        await this.close();
      });
    }
  }

  async _onSubmit(event) {
    event.preventDefault();
    if (!this.selectedTargetId) return;
    const skill = this.element.querySelector("[name=\"attackerSkill\"]");
    const attackerSkill = skill?.value ?? "itm";
    this._resolve({ targetId: this.selectedTargetId, attackerSkill });
    await this.close();
  }

  async close(options) {
    if (!this._resolved) this._resolve(null);
    return super.close(options);
  }
}
