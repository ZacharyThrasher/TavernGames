import { MODULE_ID } from "../../state.js";

export class BumpDialog {
  static async show(params) {
    const { targets, actor, athMod } = params;

    const content = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/dialogs/bump-dialog.hbs`, {
      targets,
      athMod,
      formatMod: (mod) => mod >= 0 ? `+${mod}` : mod
    });

    let selectedTargetId = null;
    let selectedDieIndex = null;

    return Dialog.prompt({
      title: "Bump the Table",
      content,
      label: "Bump!",
      render: (html) => {
        const portraits = html.find('.portrait-option');
        const dieSelection = html.find('#bump-die-selection');
        const diceContainer = html.find('#bump-dice-container');

        portraits.on('click', function () {
          portraits.removeClass('selected');
          $(this).addClass('selected');
          selectedTargetId = $(this).data('target-id');
          selectedDieIndex = null;
          dieSelection.addClass('hidden');

          // Populate dice for selected target
          const targetData = targets.find(t => t.id === selectedTargetId);
          if (targetData && targetData.dice.length > 0) {
            diceContainer.empty();
            targetData.dice.forEach((d) => {
              const isHole = !d.isPublic;
              const valueDisplay = isHole ? "?" : d.result;
              const btn = $(`
                <button type="button" class="die-btn ${holeClass}" data-die-index="${d.index}">
                  <img src="modules/${MODULE_ID}/assets/d${d.die}-grey.svg" onerror="this.src='icons/svg/d${d.die}-grey.svg'" style="width: 24px; height: 24px;" />
                  <span class="die-label">d${d.die}</span>
                  <span class="die-value">${valueDisplay}</span>
                  <span class="die-visibility">${visLabel}</span>
                </button>
              `);

              btn.on('click', function (e) {
                e.preventDefault();
                diceContainer.find('.die-btn').removeClass('selected');
                $(this).addClass('selected');
                selectedDieIndex = d.index;
              });

              diceContainer.append(btn);
            });
            dieSelection.removeClass('hidden');
          }
        });

        portraits.on('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
          }
        });
      },
      callback: () => {
        if (!selectedTargetId || selectedDieIndex === null) return null;
        return { targetId: selectedTargetId, dieIndex: selectedDieIndex };
      },
      rejectClose: false,
      options: { classes: ["tavern-dialog-window"] }
    });
  }
}