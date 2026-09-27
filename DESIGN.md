# Sidekick — Design Foundations

Status: brainstorm phase, decisions locked 2026-09-27. Target: SillyTavern 1.18.0+ (client-only extension, no server plugin, no Extras).

Working name: **Sidekick**. The extension is the DM's sidekick for running an LLM-played
protagonist whose powers and story position change over the campaign. Alternatives if the
name grates: *Cape & Chronicle*, *Continuum*. Renaming is cheap pre-v1 (storage keys are
prefixed with the module id; a rename migrates one key in `chatMetadata`).

## 1. What this is

A consistency engine for a changing protagonist. Not a character sheet, not dice, not a
worldbook editor: the extension keeps structured campaign state in chat metadata, feeds a
compact prose digest of "who the hero is *right now*" into every generation, and runs an
assistive loop that notices and discusses the hero's growth so the DM can ratify it.

The pitch in one sentence: *an LLM player character that has powers, limits, costs, and an
arc—and still recognises all three ten thousand messages later.*

## 2. Core model

Three registers of state. Everything in the extension serves these.

### 2.1 Powers — capability + limits + cost

Every tracked power carries all three parts:

- `capability` — what it does, in the hero's own vocabulary.
- `limits[]` — what it can't do, what's hard, what's going wrong.
- `costs[]` — what using it takes: strain, exposure, collateral, moral prices.

A capability-only entry degenerates into a wish list within ten messages and the LLM stops
respecting limits. The limits and costs are the interesting half and are required, not
optional. Powers also carry a `stage` (the setting's own progression vocabulary—see
cosmology below) and a `history[]` of notable shifts.

### 2.2 Arc — where the hero is in their story

- `phase` — one of the setting's arc phases (origin / rise / complication / fall /
  reckoning, or whatever cosmology the DM defines).
- `threads[]` — unresolved narrative threads (vendettas, promises, investigations).
- `pressures[]` — active stresses (public attention, a partner who suspects, a leash).
- `linesCrossed[]` — moral boundaries the hero has crossed, with what it cost. Never
  deleted.

### 2.3 Expression — the derived, injected register

Nothing about the data model reaches the LLM directly. Each generation gets a compact
prose digest rendered *from* the state (see §5), phrased the way a DM would brief a new
player at the table. This is the only representation the character model sees.

### 2.4 Deltas and provenance

State changes are events, not field edits. Every accepted change records:

- `summary` — the narrative change ("stopped holding back after the bridge").
- `evidence` — which scenes justified it (chat message indices/range).
- `origin` — `evaluation` (extension proposed) or `discussion` (DM and the board agreed).

Provenance exists so the DM can answer "why does it think flight is burned out?" without
archaeology through the chat. It also makes undo honest: reject a proposed delta and the
history entry vanishes with it.

## 3. The assisted loop

The user-facing value of the whole product. Three components:

### 3.1 Evaluation pass (assistive, not authoritative)

On a cadence (default: every 15 messages, configurable; manual trigger always available),
a quiet generation (`generateQuietPrompt`, not rendered in the campaign chat) reads the
recent scene window and returns structured observations and candidate deltas:

```json
{
  "observations": ["Kestrel used flight to outrun the toll, nosebled mid-landing"],
  "proposals": [{
    "summary": "Flight control slipping under stress",
    "changes": [{"path": "powers.flight.limits", "to": "loses precision when frightened"}],
    "sceneRange": [112, 118]
  }]
}
```

The schema is enforced via `generateRaw`/`generateQuietPrompt` `jsonSchema`, but ST does
not validate outputs and can return `'{}'`—we parse and validate ourselves, and a failed
pass is a silent no-op ("no proposals this cycle"), never a state mutation.

### 3.2 Review queue

Proposals land in a queue attached to the extension panel. Each shows summary, changes
(old → new), and evidence (jump-to-message on the cited scenes). DM actions: **apply**,
**edit then apply**, **dismiss**. Nothing touches state without an explicit DM action.

### 3.3 Discussion board

A DM-facing conversation surface—the "I'm not sure what her flight should cost going
forward" space. A separate chat with its own system prompt and a digest of current state;
it does *not* touch the campaign chat history. Board outputs can be turned into state
changes one click at a time, tagged `origin: discussion` with the board message as
evidence. The board is where the DM thinks; the queue is where the extension suggests;
state is where only ratified conclusions live.

## 4. Data model

All campaign state lives in `chatMetadata` under one key (per locked decision #1). Module
id `sidekick`; storage key `sidekick`.

```ts
interface SidekickState {
  version: number;                       // schema version for migrations
  cosmology: {
    sources: string[];                   // where powers come from in this setting
    stageVocabulary: string[];           // the setting's own progression stages
    costVocabulary: string[];            // the setting's cost language (strain, vows...)
    taboos: string;                      // what this world forbids/never does
  };
  hero: {
    name: string;
    codename: string;
    statusQuo: string;                   // current life situation, one paragraph
  };
  powers: Power[];
  arc: Arc;
  queue: PendingChange[];                // proposals awaiting DM action
  settings: LocalSettings;               // per-chat overrides (cadence, digest budget)
  history: ChangeEvent[];                // applied changes with provenance
}

interface Power {
  id: string;                            // stable, human-slug ("flight")
  name: string;
  capability: string;
  limits: string[];
  costs: string[];
  stage: string;                         // from cosmology.stageVocabulary
  history: ChangeEvent[];
}

interface Arc {
  phase: string;
  threads: string[];
  pressures: string[];
  linesCrossed: { line: string; cost: string; msgId: number }[];
}

interface PendingChange {
  id: string;
  origin: 'evaluation' | 'discussion' | 'manual';
  summary: string;
  changes: { path: string; from: string; to: string }[];
  evidence: number[];                    // chat message indices
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: number;
}

interface ChangeEvent {
  summary: string;
  origin: 'evaluation' | 'discussion' | 'manual';
  evidence: number[];
  at: number;
}

interface LocalSettings { evaluationCadence: number; digestBudgetTokens: number; }
```

Hygiène notes: never hold a long-lived reference to `chatMetadata` (the reference changes
on `CHAT_CHANGED`); always fetch via `SillyTavern.getContext().chatMetadata`; persist with
`saveMetadata()`. Config that is *not* campaign-specific (enabled, cadence defaults,
model choice for the evaluator) lives in `extensionSettings.sidekick` and persists with
`saveSettingsDebounced()`. No secrets ever—`extensionSettings` is world-readable to all
extensions.

## 5. Injection design

- **Mechanism**: `generate_interceptor` (manifest field → global function). Runs on every
  non-dry-run generation, receives `(chat, contextSize, abort, type)`.
- **What**: builds the Expression digest from state and inserts one ephemeral message
  before the last user message. Never writes to the real chat array—inject into a
  `structuredClone` if mutation semantics are ever in doubt.
- **Shape**: prose, compact, DM-brief voice. Example of the rendered digest:

  ```
  [HERO STATE — Kestrel, mid-Complication]
  She can fly, but precision fails when frightened; each push costs blood from the nose
  and worse in storms. She is currently performing confidence she does not feel. Trust
  from the city is fraying; she crossed a line at the waterfront and knows its price.
  Recent costs paid: [bridge rescue — exposed to press]. She is holding back in public
  and past that in private.
  ```

- **Budget**: the digest has a token budget (`digestBudgetTokens`, default ~200) enforced
  against `contextSize`; over budget, limits/costs compress before arc does, and the arc
  line is never dropped—it is what makes her behave differently over time.
- **Skips**: `type === 'quiet'` generations (the evaluator and board manage their own
  context explicitly) and when no hero state exists yet.
- **Optional v1.x**: a `{{heroDigest}}` macro registered via `macros.register()` so card
authors can place it by hand; the interceptor remains the default path.

## 6. Architecture map

```
manifest.json      display_name, loading_order, generate_interceptor, minimum_client_version 1.18.0,
                   hooks: { clean: onClean }
index.js           entry point; activates on APP_READY
src/state.js       state load/migrate/save, provenance-gated mutations
src/inject.js      generate_interceptor, digest renderer, budget policy
src/evaluate.js    evaluator prompt + jsonSchema + validation, cadence ticker
src/board.js       discussion board UI (separate generateRaw chat, own system prompt)
src/ui.js          extensions-panel drawer: hero sheet, review queue, board
style.css          near-mono palette + single warm accent
```

Events used: `MESSAGE_RECEIVED` (cadence ticker), `CHAT_CHANGED` (state rebind),
`GENERATION_ENDED` (avoid overlapping quiet passes), `APP_READY` (setup). Slash commands
via `SlashCommandParser.addCommandObject` for `/hero evaluate`, `/hero digest preview`.

## 7. v1 scope / non-goals

**In v1**

- Single hero, chatMetadata store, schema versioning + migration hook.
- Hero sheet UI (powers/arc/cosmology edit forms, inline).
- Expression digest injection via interceptor with budget policy.
- Evaluation pass with cadence + manual trigger; review queue with apply/edit/dismiss.
- Discussion board with state digest in context, "apply as change" on outputs.
- `onClean` hook removing stored data on extension deletion/clean request.

**Non-goals for v1**

- Parties/multiple tracked characters (data model allows a hero array later; UI does not).
- Any dice or mechanical resolution (locked decision #4; `droll` exists in ST libs if this
  is ever revisited—narrative stays sole arbiter).
- World Info read/write integration (a "copy digest as World Info entries" export is a
  cheap stretch goal, not a dependency).
- i18n, preset-field storage, bundlers/frameworks (vanilla JS + Handlebars templates via
  `renderExtensionTemplateAsync`).

If ever submitted upstream: AGPLv3 or similarly libre license, README with
install/usage/features, and it must stay server-plugin-free (it is, by design).

## 8. Open questions before scaffolding

1. Evaluation cadence default—15 messages reasonable, or scale with scene length?
2. Digest insertion point: before the final user message (current plan) vs a pinned
   depth from the end via chat slicing? Before-final is the plan; confirm.
3. Discussion board location: own drawer inside the Extensions panel (current plan) vs a
   popup? Own drawer survives panel scrolling; popup is modal.
4. Should the evaluation pass see the Expression digest itself (meta-awareness: "the hero
   is *supposed* to be holding back") or only raw scenes? Seeing it risks the evaluator
   rubber-stamping injected fiction as fact.
5. Entity naming for the hero's file export/backup—chat file is the store; do we expose
   "export journal" in v1 or defer?
