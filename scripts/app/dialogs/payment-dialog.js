import { MODULE_ID } from "../../state.js";

export class PaymentDialog {
  static async show(params) {
    const { cost, purpose, gp, canAffordGold, drinksNeeded } = params;

    const content = await renderTemplate(`modules/${MODULE_ID}/templates/dialogs/payment-dialog.hbs`, {
      cost,
      purpose,
      gp,
      canAffordGold,
      drinksNeeded
    });

    return new Promise((resolve) => {
      const d = new Dialog({
        title: "Payment Method",
        content,
        buttons: {},
        render: (html) => {
          html.find('.btn-payment').on('click', function () {
            const method = $(this).data('method');
            d.close();
            resolve(method);
          });
        },
        close: () => resolve(null),
        options: { classes: ["tavern-dialog-window", "payment-window"] }
      });
      d.render(true);
    });
  }
}