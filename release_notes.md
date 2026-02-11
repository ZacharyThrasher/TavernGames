### UI Regression Hotfix (Post-PARTS Refactor)
- Restored stable full-app rendering to fix incomplete UI hydration and control/dice interaction regressions.
- Reverted Tavern app PART definitions to `main` only (`scripts/app/tavern-app.js`).
- Reverted state-update refresh path to full render (`scripts/main.js`).
- Removed structural `data-application-part` markers in `templates/tavern-app.hbs` to avoid partial replacement mismatches.
- Result: table visuals, wood trim/frame styling, and roll/action controls render and behave consistently again.
