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
      width: 400,
      height: "auto"
    },
    form: {
      handler: CheatDialog.formHandler,
      closeOnSubmit: true
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
    
    // Skill modifiers
    const sltMod = actor?.system?.skills?.slt?.total ?? 0;
    const decMod = actor?.system?.skills?.dec?.total ?? 0;
    const intMod = actor?.system?.abilities?.int?.mod ?? 0;
    const wisMod = actor?.system?.abilities?.wis?.mod ?? 0;
    const chaMod = actor?.system?.abilities?.cha?.mod ?? 0;

    // Prepare dice data
    const dice = myRolls.map((r, idx) => ({
      index: idx,
      die: r.die,
      result: r.result,
      displayIndex: idx + 1,
      visibility: r.public ? "Visible" : "Hole"
    }));

    // Initial state
    const initialMax = myRolls[0]?.die ?? 20;
    const initialCurrent = myRolls[0]?.result ?? 1;
    const initialPreview = Math.min(initialMax, initialCurrent + 1);

    return {
      dice,
      sltMod, decMod, intMod, wisMod, chaMod,
      heatDC,
      initialCurrent,
      initialPreview,
      adjustments: [
        { value: -3, label: "-3", colorClass: "loss" },
        { value: -2, label: "-2", colorClass: "loss" },
        { value: -1, label: "-1", colorClass: "loss" },
        { value: 1, label: "+1", colorClass: "gain", isDefault: true },
        { value: 2, label: "+2", colorClass: "gain" },
        { value: 3, label: "+3", colorClass: "gain" }
      ]
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // Cheat Type Toggle
    html.find('[name="cheatType"]').on('change', (e) => {
      const isPhysical = e.target.value === 'physical';
      html.find('#physical-skill-group').toggle(isPhysical);
      html.find('#magical-skill-group').toggle(!isPhysical);
    });

    // Preview Updater
    const updatePreview = () => {
      const select = html.find('#cheat-die-select')[0];
      const selectedOption = select.selectedOptions[0];
      const current = parseInt(selectedOption?.dataset?.current ?? 1);
      const max = parseInt(selectedOption?.dataset?.max ?? 20);
      const adj = parseInt(html.find('[name="adjustment"]:checked').val() ?? 0);
      
      let newVal = current + adj;
      if (newVal < 1) newVal = 1;
      if (newVal > max) newVal = max; 

      html.find('#cheat-current-display').text(current);
      const previewEl = html.find('#cheat-preview-value');
      previewEl.text(newVal);
      
      previewEl.removeClass('gain loss neutral');
      if (adj > 0) previewEl.addClass('gain');
      else if (adj < 0) previewEl.addClass('loss');
      else previewEl.addClass('neutral');
    };

    html.find('#cheat-die-select, [name="adjustment"]').on('change', updatePreview);
    
    // Style radio buttons
    html.find('.cheat-adj-btn').on('click', function() {
       html.find('.cheat-adj-btn').removeClass('selected');
       $(this).addClass('selected');
    });

    // Close button
    html.find('[data-action="close"]').on('click', () => this.close());
  }

  static async formHandler(event, form, formData) {
    const data = formData.object;
    // Transform flat data to expected structure
    const result = {
      dieIndex: parseInt(data.dieIndex),
      adjustment: parseInt(data.adjustment),
      cheatType: data.cheatType,
      skill: data.cheatType === "physical" ? data.physicalSkill : data.magicalSkill
    };
    
    this.resolve(result);
  }

  async close(options) {
    if (this.resolve) this.resolve(null);
    return super.close(options);
  }
}
