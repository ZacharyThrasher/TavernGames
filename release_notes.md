### Cinematic Cut-In Overhaul - PIZAZZ Edition
- **Feature**: Full redesign of all cinematic cut-ins with letterbox bars, radial flash, vignettes, speed lines, stripe echo, and edge sparks.
- **Feature**: Emblem watermark system with per-type iconography across all 14 cut-in types.
- **Feature**: Per-type particle systems, including secondary burst waves for high-impact events.
- **Feature**: Screen shake added for impact types with heavier intensity on Sudden Death.
- **Feature**: Portrait, title, and target-entry animation overhaul with stronger impact timing.
- **Feature**: Coordinated exit sequence with staggered outro and tuned durations.
- **CSS**: Added `styles/cinematic-overlay.css`; removed legacy cinematic block from `styles/tavern.css`.
- **Template/JS**: Reworked `templates/cinematic-overlay.hbs` and enhanced `scripts/ui/cinematic-overlay.js` for new configs and timing.
- **Perf**: Honors reduced-motion by collapsing motion-heavy effects.
