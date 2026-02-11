import { MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class PaymentDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-payment-dialog",
    tag: "div",
    window: {
      title: "Payment Method",
      icon: "fa-solid fa-coins",
      resizable: false
    },
    position: {
      width: 420,
      height: "auto"
    },
    classes: ["tavern-dialog-window", "payment-window"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/payment-dialog.hbs`
    }
  };

  static async show(params = {}) {
    return new Promise((resolve) => {
      new PaymentDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.resolve = options.resolve;
    this.params = options;
    this._resolved = false;
  }

  async _prepareContext() {
    const {
      cost = 0,
      purpose = "",
      gp = 0,
      canAffordGold = false,
      drinksNeeded = 0
    } = this.params;

    return { cost, purpose, gp, canAffordGold, drinksNeeded };
  }

  _resolve(value) {
    if (this._resolved) return;
    this._resolved = true;
    this.resolve?.(value);
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const methodButtons = this.element.querySelectorAll("[data-action=\"payment-method\"]");
    methodButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const method = button.dataset.method;
        if (!method) return;
        this._resolve(method);
        await this.close();
      });
    });

    const cancelButton = this.element.querySelector("[data-action=\"cancel\"]");
    if (cancelButton) {
      cancelButton.addEventListener("click", async () => {
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
