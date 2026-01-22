import { MODULE_ID } from "../../state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CheatDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "tavern-cheat-dialog",
    window: {
      title: "Attempt Cheat",
      icon: "fa-solid fa-hand-sparkles",
      resizable: false
    },
    position: {
      width: 350,
      height: "auto"
    },
    classes: ["tavern-dialog-window"]
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/dialogs/cheat-dialog.hbs`,
    },
  };

  /**
   * Static helper to show the dialog and wait for result
   * @param {object} params - Context parameters
   * @returns {Promise<object|null>} - The form data or null
   */
  static async show(params) {
    return new Promise((resolve) => {
      new CheatDialog({
        resolve,
        ...params
      }).render(true);
    });
  }

  constructor(options = {}) {
    super(options);
    this.resolve = options.resolve;
    this.params = options;
  }

  async _prepareContext(options) {
    const { myRolls, actor, heatDC } = this.params;
    
    // Skill modifier (Sleight of Hand only)
    const sltMod = actor?.system?.skills?.slt?.total ?? 0;

    // Default to last die for preview
    const lastRoll = myRolls[myRolls.length - 1];
    const initialCurrent = lastRoll?.result ?? 1;
    const initialMax = lastRoll?.die ?? 20;
    const initialPreview = Math.min(initialMax, initialCurrent + 1);

    return {
      sltMod,
      heatDC,
      initialCurrent,
      initialPreview,
      maxVal: initialMax, // Store for JS access
      adjustments: [
        { value: -3, label: "-3", colorClass: "loss" },
        { value: -2, label: "-2", colorClass: "loss" },
        { value: -1, label: "-1", colorClass: "loss" },
        { value: 1, label: "+1", colorClass: "gain", isDefault: true },
        { value: 2, label: "+2", colorClass: "gain" },
        { value: 3, label: "+3", colorClass: "gain" }
      ],
      formatMod: (mod) => mod >= 0 ? `+${mod}` : mod
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Bind Form Submission manually
    this.element.addEventListener("submit", this._onSubmit.bind(this));

    // Preview Updater
    const updatePreview = () => {
      // Get current from HTML or context? HTML is safer if we had select, but here it's static
      const current = context.initialCurrent;
      const max = context.maxVal;
      const adj = parseInt(html.find('[name="adjustment"]:checked').val() ?? 0);
      
      let newVal = current + adj;
      if (newVal < 1) newVal = 1;
      if (newVal > max) newVal = max; 

      const previewEl = html.find('#cheat-preview-value');
      previewEl.text(newVal);
      
      previewEl.removeClass('gain loss neutral');
      if (adj > 0) previewEl.addClass('gain');
      else if (adj < 0) previewEl.addClass('loss');
      else previewEl.addClass('neutral');
    };

    html.find('[name="adjustment"]').on('change', updatePreview);
    
    // Style radio buttons
    html.find('.cheat-adj-btn').on('click', function() {
       html.find('.cheat-adj-btn').removeClass('selected');
       $(this).addClass('selected');
    });

    // Close button
    html.find('[data-action="close"]').on('click', () => this.close());
  }

  async _onSubmit(event) {
    event.preventDefault();
    const formData = new FormDataExtended(event.target).object;
    
    const result = {
      // dieIndex undefined -> backend picks last
      adjustment: parseInt(formData.adjustment),
      // cheatType/skill removed -> backend hardcodes Physical/Slt
    };
    
    if (this.resolve) {
      this.resolve(result);
      this.resolve = null;
    }
    this.close();
  }

  async close(options) {
    if (this.resolve) {
      this.resolve(null);
      this.resolve = null;
    }
    return super.close(options);
  }
}
