import { MODULE_ID } from "../../state.js";

export class BootDialog {
  static async show(params) {
    const { targets, boots } = params;

    const content = await foundry.applications.handlebars.renderTemplate(
      `modules/${MODULE_ID}/templates/dialogs/boot-dialog.hbs`,
      { targets, boots }
    );

    let selectedTargetId = null;

    return new Promise((resolve) => {
      new Dialog({
        title: "Goblin Boot",
        content,
        buttons: {
          boot: {
            label: "Kick Them Back In",
            icon: '<i class="fa-solid fa-shoe-prints"></i>',
            callback: () => {
              if (!selectedTargetId) return resolve(null);
              resolve({ targetId: selectedTargetId });
            }
          }
        },
        default: "boot",
        render: (html) => {
          const portraits = html.find(".portrait-option");
          portraits.on("click", function () {
            portraits.removeClass("selected");
            $(this).addClass("selected");
            selectedTargetId = $(this).data("target-id");
          });

          portraits.on("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              $(this).click();
            }
          });
        },
        close: () => resolve(null),
        options: { classes: ["tavern-dialog-window"] }
      }).render(true);
    });
  }
}
