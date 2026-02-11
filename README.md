# Tavern Twenty-One

Tavern Twenty-One is a Foundry VTT module that adds a social, high-stakes tavern dice game for D&D 5e tables.

## Features

- Standard Twenty-One mode and Goblin Rules mode
- Skill interactions (Cheat, Profile, Goad, Bump, Hunch)
- Side bets, duels, accusations, and private event logs
- Premium visual effects with optional performance mode
- GM-as-NPC support with table wallet tracking

## Requirements

- Foundry VTT v13
- dnd5e system 4.x+
- `socketlib` module

## Installation

Use this manifest URL in Foundry:

`https://github.com/ZacharyThrasher/TavernGames/releases/latest/download/module.json`

## Development Checks

Run these commands from the repository root:

- `npm run check` - full release checks (syntax + quality + manifest/assets)
- `npm run check:quality` - guardrails for empty catches and stale commented-out code
- `npm run check:syntax` - syntax-only checks (`node --check` via PowerShell)
- `npm run check:manifest` - manifest/assets consistency checks

These checks are zero-dependency.

## CI

Automated checks run on push and pull requests via GitHub Actions:

- workflow: `.github/workflows/module-checks.yml`
