import { MODULE_ID } from "../../state.js";

export class ProfileDialog {
  static async show(params) {
    const { targets, actor, invMod } = params;

    const content = await foundry.applications.handlebars.renderTemplate(`modules/${MODULE_ID}/templates/dialogs/profile-dialog.hbs`, {
      targets,
      invMod,
      formatMod: (mod) => mod >= 0 ? `+${mod}` : mod
    });

    let selectedTargetId = null;

    return Dialog.prompt({
      title: "Profile",
      content,
      label: "Profile",
      render: (html) => {
        const portraits = html.find('.portrait-option');
        portraits.on('click', function () {
          portraits.removeClass('selected');
          $(this).addClass('selected');
          selectedTargetId = $(this).data('target-id');
        });

        // Keyboard accessibility
        portraits.on('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            $(this).click();
          }
        });
      },
      callback: () => {
        if (!selectedTargetId) return null;
        return { targetId: selectedTargetId };
      },
      rejectClose: false,
      options: { classes: ["tavern-dialog-window"] }
    });
  }
}