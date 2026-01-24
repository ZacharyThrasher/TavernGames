import { MODULE_ID } from "../../state.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HelpDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "tavern-help-dialog",
        tag: "div",
        window: {
            title: "Tavern Twenty-One Rules",
            icon: "fa-solid fa-book",
            resizable: true,
        },
        position: {
            width: 600,
            height: 700,
        },
        classes: ["tavern-help"],
    };

    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/templates/dialogs/help-dialog.hbs`,
        },
    };

    _onRender(context, options) {
        super._onRender(context, options);

        // Manual Tab Handling (Simple without TabsV2 for now to keep dependencies light)
        // Or we can use foundry's built-in tabs if we configure them, but simple click listeners work best for custom styling.
        const tabs = this.element.querySelectorAll('.tavern-tabs .item');
        const sections = this.element.querySelectorAll('.tavern-tab-content .tab');

        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                // Remove active
                tabs.forEach(t => t.classList.remove('active'));
                sections.forEach(s => s.classList.remove('active'));

                // Add active
                const target = tab.dataset.tab;
                tab.classList.add('active');
                this.element.querySelector(`.tab[data-tab="${target}"]`)?.classList.add('active');
            });
        });
    }
}
