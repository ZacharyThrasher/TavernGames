### Standard Reveal Rerender Guard Hotfix
- Moved Standard betting reveal execution earlier in `scripts/twenty-one/phases/turn.js` so animation plays before log/history state writes trigger rerenders.
- Added reveal-active rerender deferral in `scripts/main.js` for `updateSetting`-driven full app refreshes.
- Added matching reveal-active rerender deferral in `scripts/app/tavern-client-actions.js` for direct `app.render()` calls during UI lock transitions.
- Result: Standard mode reveal sequences are protected from mid-animation DOM replacement.
