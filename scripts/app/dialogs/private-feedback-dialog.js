import { MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PrivateFeedbackDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-private-feedback-dialog",
    tag: "div",
    window: {
      title: "Result",
      icon: "fa-solid fa-eye",
      resizable: false
    },
    position: {
      width: 420,
      height: "auto"
    },
    classes: ["tavern-dialog-window", "tavern-cheat-feedback"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/private-feedback-dialog.hbs`
    }
  };

  static async show(params = {}) {
    return new Promise((resolve) => {
      new PrivateFeedbackDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.resolve = options.resolve;
    this.params = options;
    this._resolved = false;
  }

  async _prepareContext() {
    const title = this.params.title ?? "Result";
    const content = this.params.content ?? "";
    this.options.window.title = title;
    return { title, content };
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this.resolve?.(value);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const closeButton = this.element.querySelector("[data-action=\"close\"]");
    if (closeButton) {
      closeButton.addEventListener("click", async () => {
        this._resolve(true);
        await this.close();
      });
    }
  }

  async close(options) {
    if (!this._resolved) this._resolve(false);
    return super.close(options);
  }
}
