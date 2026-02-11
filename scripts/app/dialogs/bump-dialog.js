import { MODULE_ID } from "../../twenty-one/constants.js";
import { attachPortraitSelection } from "./portrait-selection.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BumpDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "tavern-bump-dialog",
    tag: "div",
    window: {
      title: "Bump the Table",
      icon: "fa-solid fa-hand-fist",
      resizable: false
    },
    position: {
      width: 520,
      height: "auto"
    },
    classes: ["tavern-dialog-window"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/bump-dialog.hbs`
    }
  };

  static async show(params) {
    return new Promise((resolve) => {
      new BumpDialog({ resolve, ...params }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.params = options;
    this.resolve = options.resolve;
    this.selectedTargetId = null;
    this.selectedDieIndex = null;
    this._resolved = false;
  }

  async _prepareContext() {
    const { targets, athMod } = this.params;
    return {
      targets: targets ?? [],
      athMod,
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
    const dieSelection = this.element.querySelector("#bump-die-selection");
    const diceContainer = this.element.querySelector("#bump-dice-container");
    const targets = this.params.targets ?? [];

    attachPortraitSelection(html, {
      onSelect: (id) => {
        this.selectedTargetId = id;
        this.selectedDieIndex = null;
        if (dieSelection) dieSelection.classList.add("hidden");
        if (diceContainer) diceContainer.replaceChildren();

        const targetData = targets.find(t => t.id === id);
        if (targetData && targetData.dice.length > 0 && diceContainer) {
          for (const die of targetData.dice) {
            const isHole = !die.isPublic;
            const valueDisplay = isHole ? "?" : `${die.result}`;
            const visLabel = isHole ? "HOLE" : "Visible";

            const button = document.createElement("button");
            button.type = "button";
            button.className = `die-btn${isHole ? " hole-die" : ""}`;
            button.dataset.dieIndex = `${die.index}`;
            button.setAttribute("aria-label", `d${die.die}, ${visLabel}, value ${valueDisplay}`);

            const icon = document.createElement("img");
            icon.className = "die-icon-img";
            icon.src = `modules/${MODULE_ID}/assets/d${die.die}-grey.svg`;
            icon.alt = `d${die.die}`;
            icon.addEventListener("error", () => {
              icon.src = `icons/svg/d${die.die}-grey.svg`;
            }, { once: true });

            const dieLabel = document.createElement("span");
            dieLabel.className = "die-label";
            dieLabel.textContent = `d${die.die}`;

            const dieValue = document.createElement("span");
            dieValue.className = "die-value";
            dieValue.textContent = valueDisplay;

            const dieVisibility = document.createElement("span");
            dieVisibility.className = "die-visibility";
            dieVisibility.textContent = visLabel;

            button.append(icon, dieLabel, dieValue, dieVisibility);
            button.addEventListener("click", (event) => {
              event.preventDefault();
              for (const dieButton of diceContainer.querySelectorAll(".die-btn")) {
                dieButton.classList.remove("selected");
              }
              button.classList.add("selected");
              this.selectedDieIndex = die.index;
            });
            diceContainer.appendChild(button);
          }

          if (dieSelection) dieSelection.classList.remove("hidden");
        }
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
    if (!this.selectedTargetId || this.selectedDieIndex === null) return;
    this._resolve({
      targetId: this.selectedTargetId,
      dieIndex: this.selectedDieIndex
    });
    await this.close();
  }

  async close(options) {
    if (!this._resolved) this._resolve(null);
    return super.close(options);
  }
}
