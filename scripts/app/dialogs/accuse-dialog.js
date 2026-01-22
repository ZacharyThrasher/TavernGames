import { MODULE_ID } from "../../state.js";
import { TavernApp } from "../tavern-app.js"; // For DICE_ICONS if needed, but better to duplicate or move constants

export class AccuseDialog {
  static async show(params) {
    const { targetName, targetId, rolls, ante, cost } = params;
    const bounty = ante * 5; // Fixed rule

    // Prepare dice data
    const dice = rolls.map((roll, idx) => {
      const isBlind = roll.blind ?? false;
      const isHole = !(roll.public ?? true);
      const displayResult = isBlind ? "?" : (isHole ? "?" : roll.result);
      // Simple logic for icon mapping
      const icon = roll.die; 
      
      let label = `d${roll.die}`;
      if (isBlind) label += " (Blind)";
      else if (isHole) label += " (Hole)";
      else label += `: ${roll.result}`;

      return { index: idx, icon, displayResult, label };
    });

    const content = await renderTemplate(`modules/${MODULE_ID}/templates/dialogs/accuse-dialog.hbs`, {
      targetName,
      dice,
      cost,
      bounty
    });

    let selectedDieIndex = null;

    return new Promise(resolve => {
      const dialog = new Dialog({
        title: `Accuse ${targetName}`,
        content,
        buttons: {
          accuse: {
            label: "Accuse!",
            icon: '<i class="fa-solid fa-hand-point-right"></i>',
            callback: () => resolve(selectedDieIndex !== null ? { targetId, dieIndex: selectedDieIndex } : null)
          },
          cancel: {
            label: "Cancel",
            icon: '<i class="fa-solid fa-times"></i>',
            callback: () => resolve(null)
          }
        },
        default: "accuse",
        render: (html) => {
          const dieOptions = html.find('.die-option');
          dieOptions.on('click', function () {
            dieOptions.removeClass('selected');
            $(this).addClass('selected');
            selectedDieIndex = parseInt($(this).data('die-index'));
          });
          dieOptions.on('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              $(this).click();
            }
          });
        },
        close: () => resolve(null),
        options: { classes: ["tavern-dialog-window"] }
      });
      dialog.render(true);
    });
  }
}