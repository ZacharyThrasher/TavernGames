### Foundry PARTS Rendering Hotfix
- Fixed ApplicationV2 PARTS crash where `header` failed to render because the template returned multiple top-level elements.
- Updated `templates/parts/header.hbs` and `templates/parts/footer.hbs` to each render a single root element.
- Added wrapper layout CSS in `styles/tavern.css` to preserve header/footer visual alignment.
- Result: the `tavern-dice-master` application renders correctly again under Foundry V13 PARTS parsing.
