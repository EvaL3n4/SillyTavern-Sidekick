# Sidekick

A dosage-style hero-arc product for single-DM superhero campaigns, built as a
SillyTavern extension.

The problem it solves is flatness: an LLM tracking a hero arc drifts toward the
median—every hero costs the same, every crossing resolves, no hero is mid-capture.
Sidekick counters that by maintaining a ledger of the campaign's actual wear and
tear and injecting a lean, budgeted digest into generation. Its one job is to make
the model notice the specific hero in front of it.

The design is written up in [DESIGN.md](DESIGN.md), which is the authoritative
document. This README covers how to run it.

## How it works

Sidekick runs a proposal loop. An evaluation scan reads raw scenes and structured
state and proposes `PendingChange` bookkeeping—never story outcomes. The DM rules
on each proposal. Approved changes are applied through a provenance gate and recorded
in `chatMetadata`, so the hero dies with the chat.

The digest is a one-way valve: state renders into the digest, the digest enters
generation, and nothing downstream writes back upstream. Our own prose is persuasive
by construction, so feeding the render back into the scan would over-persuade it and
cost the only reader positioned to notice a render drifting from the DM's rulings.

## Install

Copy the extension into SillyTavern's third-party extensions directory:

```text
{SillyTavern}/scripts/extensions/third-party/SillyTavern-Sidekick/
```

The loader reads `manifest.json` and pulls in `index.js` as an ES module. No build
step—the extension ships as native ES modules and Handlebars templates.

## Development

Requires Node 20 or newer.

```bash
npm install      # install dev dependencies and prepare the git hook
npm test         # node --test over test/, then the coverage floor
npm run lint     # eslint
npm run lint:md  # markdownlint-cli2 over DESIGN.md
```

Commits run `lint-staged` through husky, so staged JS is linted and DESIGN.md is
markdown-linted before anything lands.

## Layout

| File | What it is |
| --- | --- |
| `index.js` | Entry point. Wires `APP_READY`, slash commands, exported hooks |
| `manifest.json` | Loader descriptor |
| `src/state.js` | State load/migrate/save, provenance-gated mutations, ruling log |
| `src/grammar.js` | The digest renderer: state → lean prose (the dosage rules) |
| `src/inject.js` | The `generate_interceptor` and budget policy |
| `src/evaluate.js` | Evaluator prompt, jsonSchema, cadence policy |
| `src/board.js` | The board's store, prompt and tool-call protocol |
| `src/ui.js` | FAB menu and the hero sheet, review queue and board surfaces |
| `style.css` | Near-mono palette with a single warm accent |
| `templates/` | Handlebars templates |

## Status

The scaffold is landed. `src/state.js` and `src/grammar.js` are complete and tested.
The evaluator scan's chain is complete and tested—scene window, prompt,
generation, validation, queue assembly—and `index.js` wires it to the cadence and
the slash command. The three FAB surfaces are built: the hero sheet, the review queue that
rules on a queued proposal, and the discussion board, which turns the DM's own thinking
into a change through one click. Citations survive deletion and re-roll, and the scan's
evidence is fingerprinted at intake.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
