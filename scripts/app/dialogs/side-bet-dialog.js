import { MODULE_ID } from "../../state.js";

export class SideBetDialog {
  static async show(params) {
    const { champions, ante } = params;

    const content = await renderTemplate(`modules/${MODULE_ID}/templates/dialogs/side-bet-dialog.hbs`, {
      champions,
      ante
    });

    let selectedChampionId = null;

    return new Promise(resolve => {
      const dialog = new Dialog({
        title: "Place Side Bet",
        content,
        buttons: {
          bet: {
            label: "Place Bet!",
            icon: '<i class="fa-solid fa-sack-dollar"></i>',
            callback: (html) => {
              if (!selectedChampionId) return resolve(null);
              const amount = parseInt(html.find('[name="betAmount"]').val()) || ante;
              resolve({ championId: selectedChampionId, amount });
            }
          },
          cancel: {
            label: "Cancel",
            icon: '<i class="fa-solid fa-times"></i>',
            callback: () => resolve(null)
          }
        },
        default: "bet",
        render: (html) => {
          const championCards = html.find('.portrait-option');
          championCards.on('click', function () {
            championCards.removeClass('selected');
            $(this).addClass('selected');
            selectedChampionId = $(this).data('champion-id');
          });
          championCards.on('keydown', function (e) {
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