import { ACCUSATION_BOUNTY_MULTIPLIER, ACCUSATION_COST_MULTIPLIER, MODULE_ID } from "../../twenty-one/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const DICE_ICONS = {
  4: "d4",
  6: "d6",
  8: "d8",
  10: "d10",
  12: "d12",
  20: "d20",
};

export class AccuseDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-accuse-dialog",
    tag: "div",
    window: {
      title: "Accuse",
      icon: "fa-solid fa-hand-point-right",
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
      template: `modules/${MODULE_ID}/templates/dialogs/accuse-dialog.hbs`
    }
  };

  static async show(params) {
    return new Promise((resolve) => {
      new AccuseDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.params = options;
    this.resolve = options.resolve;
    this.selectedDieIndex = null;
    this._resolved = false;
  }

  async _prepareContext() {
    const { targetName, rolls, ante } = this.params;
    const bounty = ante * ACCUSATION_BOUNTY_MULTIPLIER;
    const cost = ante * ACCUSATION_COST_MULTIPLIER;

    const dice = (rolls ?? []).map((roll, idx) => {
      const isBlind = roll.blind ?? false;
      const isHole = !(roll.public ?? true);
      const displayResult = isBlind ? "?" : (isHole ? "?" : roll.result);
      const icon = DICE_ICONS[roll.die] || "d6";

      let label = `d${roll.die}`;
      if (isBlind) label += " (Blind)";
      else if (isHole) label += " (Hole)";
      else label += `: ${roll.result}`;

      return { index: idx, icon, displayResult, label };
    });

    return { targetName, dice, cost, bounty };
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
    const dieOptions = html.find(".die-option");
    dieOptions.attr("aria-pressed", "false");
    dieOptions.on("click", (event) => {
      dieOptions.removeClass("selected").attr("aria-pressed", "false");
      const current = $(event.currentTarget);
      current.addClass("selected");
      current.attr("aria-pressed", "true");
      this.selectedDieIndex = parseInt(current.data("die-index"));
    });
    dieOptions.on("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.currentTarget.click();
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
    if (this.selectedDieIndex === null) return;
    this._resolve({
      targetId: this.params.targetId,
      dieIndex: this.selectedDieIndex
    });
    await this.close();
  }

  async close(options) {
    if (!this._resolved) this._resolve(null);
    return super.close(options);
  }
}
