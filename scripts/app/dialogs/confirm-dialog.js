import { MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ConfirmDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-confirm-dialog",
    tag: "div",
    window: {
      title: "Confirm",
      icon: "fa-solid fa-circle-question",
      resizable: false
    },
    position: {
      width: 420,
      height: "auto"
    },
    classes: ["tavern-dialog-window", "tavern-confirm-window"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/confirm-dialog.hbs`
    }
  };

  static async show(params = {}) {
    return new Promise((resolve) => {
      new ConfirmDialog({ ...params, resolve }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.params = options;
    this.resolve = options.resolve;
    this._resolved = false;
  }

  async _prepareContext() {
    const lines = Array.isArray(this.params.lines)
      ? this.params.lines.filter((line) => typeof line === "string" && line.trim().length > 0)
      : [];

    return {
      icon: this.params.icon ?? "fa-solid fa-circle-question",
      titleText: this.params.titleText ?? game.i18n.localize("TAVERN.Confirm"),
      lines,
      tone: this.params.tone ?? "info",
      confirmLabel: this.params.confirmLabel ?? game.i18n.localize("TAVERN.Confirm"),
      cancelLabel: this.params.cancelLabel ?? game.i18n.localize("TAVERN.Cancel")
    };
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this.resolve?.(value);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const confirmButton = this.element.querySelector("[data-action=\"confirm\"]");
    if (confirmButton) {
      confirmButton.addEventListener("click", async () => {
        this._resolve(true);
        await this.close();
      });
    }

    const cancelButton = this.element.querySelector("[data-action=\"cancel\"]");
    if (cancelButton) {
      cancelButton.addEventListener("click", async () => {
        this._resolve(false);
        await this.close();
      });
    }
  }

  async close(options) {
    if (!this._resolved) this._resolve(false);
    return super.close(options);
  }
}
