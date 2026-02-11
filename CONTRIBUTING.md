# Contributing

## Layer Naming Conventions
- `handleXxx`: socket/transport entry points (`scripts/tavern-actions.js`).
- Bare verbs (`roll`, `hold`, `goad`, `bumpTable`): game rules and phase orchestration.
- `onXxx`: client UI actions (`scripts/app/tavern-client-actions.js`).
- `showXxx` / `playXxx`: visual effects and presentation.
- Utility functions use descriptive names (`getNextActivePlayer`, `isActingAsHouse`).

## State And Rules
- Never mutate `state` or `tableData` objects in place.
- Prefer pure helpers in `scripts/twenty-one/rules/` for deterministic logic.
- Keep I/O boundaries explicit: sockets, logs, notifications, and FX should be outside pure rules.

## Dialogs
- Use `ApplicationV2 + HandlebarsApplicationMixin`.
- Keep markup in `templates/dialogs/*.hbs`; avoid inline HTML strings in JS.

## Accessibility
- Interactive non-button elements must include `role="button"`, `tabindex="0"`, and `aria-label`.
- Support keyboard activation with Enter/Space where applicable.

## Localization
- New user-facing notification/dialog text should use `localizeOrFallback(...)`.
- Add English defaults in `languages/en.json`.

## Validation Before Merge
- Run `npm run check`.
- Add/update tests in `tests/` for any rule changes.
