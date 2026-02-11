import { getState } from "../../state.js";
import { MODULE_ID } from "../../twenty-one/constants.js";
import { formatRelativeTime } from "../../twenty-one/utils/time.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LogsWindow extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "tavern-logs-window",
        tag: "div",
        window: {
            title: "Private Log",
            icon: "fa-solid fa-book-secret",
            resizable: true,
            minimizable: true,
        },
        position: {
            width: 350,
            height: 500,
        },
        classes: ["tavern-logs-window"],
    };

    static PARTS = {
        main: {
            template: `modules/${MODULE_ID}/templates/dialogs/logs-window.hbs`,
        },
    };

    async _prepareContext() {
        const state = getState();
        const userId = game.user.id;

        const myPrivateLogs = (state.privateLogs?.[userId] ?? []).slice().reverse().map(entry => ({
            ...entry,
            timeAgo: this._formatTimeAgo(entry.timestamp)
        }));

        return {
            privateLogs: myPrivateLogs
        };
    }

    _formatTimeAgo(timestamp) {
        return formatRelativeTime(timestamp);
    }
    async _onRender(context, options) {
        super._onRender(context, options);
        // Refresh main app to update badge state
        if (game.tavernDiceMaster?.app?.rendered) {
            game.tavernDiceMaster.app.render();
        }
    }

    async close(options) {
        const result = await super.close(options);
        // Refresh main app to update badge state
        if (game.tavernDiceMaster?.app?.rendered) {
            game.tavernDiceMaster.app.render();
        }
        return result;
    }
}
