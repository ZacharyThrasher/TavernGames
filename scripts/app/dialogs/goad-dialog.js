import { MODULE_ID } from "../../state.js";

export class GoadDialog {
  static async show(params) {
    const { targets, actor, itmMod, perMod } = params;
    const defaultSkill = itmMod >= perMod ? "itm" : "per";

    const content = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/dialogs/goad-dialog.hbs`, {
      targets,
      itmMod,
      perMod,
      defaultSkill,
      formatMod: (mod) => mod >= 0 ? `+${mod}` : mod
    });

    let selectedTargetId = null;

    return Dialog.prompt({
      title: "Goad",
      content,
      label: "Goad!",
      render: (html) => {
        const portraits = html.find('.portrait-option');
        portraits.on('click', function () {
          portraits.removeClass('selected');
          $(this).addClass('selected');
          selectedTargetId = $(this).data('target-id');
        });

        portraits.on('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
          }
        });
      },
      callback: (html) => {
        if (!selectedTargetId) return null;
        const attackerSkill = html.find('[name="attackerSkill"]').val();
        return { targetId: selectedTargetId, attackerSkill };
      },
      rejectClose: false,
      options: { classes: ["tavern-dialog-window"] }
    });
  }
}