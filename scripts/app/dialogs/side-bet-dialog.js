import { MODULE_ID } from "../../twenty-one/constants.js";
import { attachPortraitSelection } from "./portrait-selection.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SideBetDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-side-bet-dialog",
    tag: "div",
    window: {
      title: "Place Side Bet",
      icon: "fa-solid fa-sack-dollar",
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
      template: `modules/${MODULE_ID}/templates/dialogs/side-bet-dialog.hbs`
    }
  };

  static async show(params) {
    return new Promise((resolve) => {
      new SideBetDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.params = options;
    this.resolve = options.resolve;
    this.selectedChampionId = null;
    this._resolved = false;
  }

  async _prepareContext() {
    const { champions, ante } = this.params;
    return { champions: champions ?? [], ante };
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
      dataKey: "champion-id",
      onSelect: (id) => {
        this.selectedChampionId = id;
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
    if (!this.selectedChampionId) return;
    const amountInput = this.element.querySelector("[name=\"betAmount\"]");
    const min = Number(amountInput?.min ?? this.params.ante ?? 1);
    const amount = Math.max(min, parseInt(amountInput?.value ?? `${min}`) || min);

    this._resolve({ championId: this.selectedChampionId, amount });
    await this.close();
  }

  async close(options) {
    if (!this._resolved) this._resolve(null);
    return super.close(options);
  }
}
