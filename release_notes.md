### Reel Animation Visibility Hotfix
- Replaced wall-clock reel cutoff with a guaranteed multi-step spin sequence in `scripts/ui/dice-reveal.js`.
- Reel now always shows visible slot-style number cycling before lock-in, even under brief render-thread stalls.
- Updated blind-roll reel path to deterministic stepped glyph cycling for the same reliability.
- Result: in Standard mode you should now see the actual slot-machine reel phase, not only slam/ring/flash.
