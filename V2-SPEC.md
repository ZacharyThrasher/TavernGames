# Tavern Twenty-One V2.0 Implementation Spec

## Overview
This document outlines the remaining implementation tasks for Tavern Twenty-One V2.0, a major rules overhaul of the FoundryVTT gambling module.

**Current Status**: Phase 7 (Scan Action) completed. Phases 8-10 remaining.

## Phase 8: Accusation Changes (High Priority)

### Current Implementation
- Cost: ½ pot (half the current pot)
- Requires skill roll (Perception vs Insight)
- If correct: Cheater caught, pot distributed normally
- If incorrect: Accuser forfeits winnings

### V2.0 Changes Required
- **Cost**: Change from ½ pot → **2x ante**
- **No skill roll**: Remove the skill check entirely (direct accusation)
- **Correct accusation**: 
  - Refund the 2x ante fee to accuser
  - **Add 5x ante bounty** taken from the cheater's winnings
- **Incorrect accusation**: 
  - Accuser loses their 2x ante fee to the pot
  - No other penalties

### Files to Modify
- `scripts/twenty-one.js`: Update `accuse()` function
- `scripts/app/tavern-app.js`: Update accusation dialog (remove skill selection)
- `templates/parts/controls.hbs`: Update cost display
- `styles/tavern.css`: Update any related styling

### Implementation Steps
1. Update `accuse()` function logic:
   - Change cost calculation from `pot/2` to `ante * 2`
   - Remove skill roll and DC checks
   - Update payout logic for bounty system
2. Update UI to remove skill selection from accusation dialog
3. Update cost display in controls

## Phase 9: The Duel (High Priority)

### Current Implementation
- Ties result in pot being split evenly
- No tie-breaking mechanism

### V2.0 Changes Required
- **Tie-breaker system**: Replace pot splitting with duels
- **Duel mechanics**:
  - GM rolls 1d6 to determine contest type: STR/DEX/CON/INT/WIS/CHA
  - Each tied player rolls 1d20 + their modifier for that stat
  - Highest total wins the pot
  - If duel results in tie → re-duel with new contest type
- **UI requirements**:
  - Duel announcement showing contest type
  - Player roll prompts during duel
  - Resolution display
  - Re-duel handling for ties

### Files to Modify
- `scripts/twenty-one.js`: 
  - Add `duel()` function
  - Update `finishRound()` to trigger duels instead of splitting
  - Add duel state tracking
- `scripts/app/tavern-app.js`: 
  - Add duel UI context
  - Add duel action handlers
- `scripts/state.js`: Add duel tracking to `emptyTableData()`
- `templates/parts/controls.hbs`: Add duel UI elements
- `styles/tavern.css`: Add duel styling

### Implementation Steps
1. Add duel state to tableData:
   ```javascript
   duel: {
     participants: [], // Array of player IDs
     contestType: null, // 'str'|'dex'|'con'|'int'|'wis'|'cha'
     stat: null, // 'strength'|'dexterity'|etc.
     rolls: {}, // { playerId: rollResult }
     round: 1 // For re-duels
   }
   ```

2. Create `duel()` function:
   - Roll 1d6 for contest type
   - Prompt tied players to roll
   - Resolve winner or trigger re-duel

3. Update `finishRound()`:
   - Detect ties instead of splitting pot
   - Trigger duel for tied players

4. Add duel UI:
   - Contest type announcement
   - Roll prompts for participants
   - Results display

## Phase 10: Polish & Release (Final Phase)

### V2.0 Rules Documentation
- Update `RULES.md` with complete V2.0 ruleset
- Document all changes from V1.0
- Include examples and edge cases

### Module Version Bump
- Update `module.json`:
  - Version: "2.0.0"
  - Update changelog/description
  - Ensure compatibility flags

### Build & Release Process
1. **Build package**:
   ```bash
   # Create release zip
   powershell -Command "Remove-Item 'tavern-dice-master.zip' -ErrorAction SilentlyContinue; Compress-Archive -Path 'languages','scripts','styles','templates','module.json' -DestinationPath 'tavern-dice-master.zip' -Force"
   ```

2. **Git workflow**:
   ```bash
   git add -A
   git commit -m "feat: V2.0 - Major rules overhaul"
   git tag v2.0.0
   git push origin main
   git push origin v2.0.0
   ```

3. **GitHub Release**:
   ```bash
   gh release create v2.0.0 tavern-dice-master.zip module.json \
     --title "v2.0.0 - VTT Edition" \
     --notes "Complete V2.0 rules overhaul..."
   ```

### Testing Requirements
- Test all new mechanics:
  - Variable dice costs
  - Visibility system (hole cards)
  - Turn order by visible total
  - Goad action (force rolls)
  - Bump enhancements (hole die targeting)
  - Cheating overhaul (physical/magical, Tell/Residue DCs)
  - Scan action (investigation)
  - Accusation changes (direct, bounty system)
  - Duel system (tie-breaking)
- Edge cases:
  - Nat 20 = instant 21
  - Nat 1 = cleaning fee
  - Duel re-rolls
  - Multiple cheaters
  - GM scanning/accusing

## Implementation Order
1. **Phase 8**: Accusation changes (simpler, builds on existing code)
2. **Phase 9**: Duel system (more complex, new UI/state)
3. **Phase 10**: Polish and release (documentation + versioning)

## Risk Assessment
- **Phase 8**: Low risk - modifies existing function
- **Phase 9**: Medium risk - adds new game state and UI complexity
- **Phase 10**: Low risk - documentation and packaging

## Success Criteria
- All V2.0 rules implemented and functional
- No regressions in existing functionality
- UI/UX polished and intuitive
- Module successfully builds and installs
- Clear documentation for players and GMs</content>
<parameter name="filePath">G:\Poneglyph\TavernGames\V2-SPEC.md