# Sidekick — Design

Status: concept phase, restarted 2026-09-28. Target: SillyTavern 1.18.0+ (client-only
extension, no server plugin, no Extras). One audience: the campaigns this tool was built
to serve. Every example in this document is drawn from that campaign; nothing is invented
for generality.

This document supersedes the "Trellis" draft. What survives from it: the appetite
rendering layer, the pressure clock, shame-as-concealment, and residue—rebuilt here as
digest grammar over the original state model. The 2026-09-27 Sidekick foundations draft
(git history, `9df7b5a`) supplies the state model, the assisted loop, and the
architecture; this document re-unions them under one purpose and the acceptance test
they were always meant to pass.

## 1. What this is

A dosage instrument against LLM flatness.

Models smooth friction. They pause, defer, tidy, and negotiate wants away—and under
pressure they don't stall, they insure. The failure has a recognizable shape: give a
model a hero mid-lunge to catch a falling friend and a hedgy model reroutes the sentence
into safety procedure—a foot hooked behind a crossbar "to anchor against the falling
frame," boots wedged under struts—because a body described as a rigging problem never
has to risk itself. Run the same card, same settings, different model, and the behavior
flips: one instance tethers, one springs. That is the flatness Sidekick treats. Not bad
grammar, not stat drift, but the character's survival being quietly promoted above the
character's want.

Sidekick doses the counterweight. It keeps durable campaign state—what the hero can do,
what it costs, what they have crossed, what is unresolved and under pressure—and renders
a lean prose digest of *who the hero is right now* into every generation. The digest is
the product; everything else is calibration machinery for setting its dose.

The pitch, unchanged from the first draft because it was always right: **an LLM player
character that has powers, limits, costs, and an arc—and still recognises all three ten
thousand messages later.**

One audience is a design constraint, not a limitation. The document speaks in the
campaign's own vocabulary, uses its characters as the worked example, and holds every
paragraph to the use-case rule: earns its place against a real surface, or is cut.

## 2. The state model

Three registers of state. Everything in the extension serves these.

**Powers—capability + limits + cost, one indivisible entry.** Every tracked power carries
all three parts: what it does in the hero's own vocabulary, what it can't do or is
getting wrong, and what using it takes. A capability-only entry degenerates into a wish
list and the model stops respecting limits within ten messages. Powers also carry a
`stage` (the setting's progression vocabulary) and a `history[]` of notable shifts.

**Arc—where the hero is in their story.** `phase` from the setting's own phases;
`threads[]` unresolved; `pressures[]` active stresses; `linesCrossed[]` moral boundaries
crossed with what each cost. Lines crossed are never deleted—the ledger's memory of
their weight is the feature.

**Cosmology—the setting's own words.** Where powers come from, what the stages are
called, what the costs are called, what the world forbids. For the reference campaign:
powers originate in manifestation; stages run from unmanifested through trainee to
licensed hero under a national program; costs are paid in strain, exposure, and cover.
The model assumes these defaults; the DM edits them like anything else in the ledger.

**Deltas and provenance.** State changes are events, not field edits. Every accepted
change records its narrative summary ("stopped holding back after the bridge"), its
evidence (which scenes justified it), and its origin—`evaluation` (the scan proposed
it), `discussion` (the board), or `manual` (the DM wrote it). Provenance answers "why
does it think that now?" without archaeology, and makes refusal honest: reject a
proposed delta and the history vanishes with it.

There is deliberately **no appetite register in state**. Appetites are how state renders,
not a second vocabulary to maintain—see §4. One hero, one ledger, one language.

## 3. The loop

The loop in full: the DM rules, the ledger holds, the digest renders, the hero acts, the
world answers, the scan reads what happened, proposals return, the DM rules. The last
arrow is the one that makes this a loop instead of a notepad.

**The scan.** On a cadence (default every 15 messages, configurable, manual trigger
always available), a quiet generation—never rendered in the campaign chat—reads the
recent scene window and returns structured observations and candidate deltas. Output is
schema-constrained and validated on receipt; a failed pass is a silent no-op, never a
state mutation.

**The queue.** Proposals land in a queue attached to the extension panel. Each shows
summary, changes (old → new), and evidence with jump-to-message. DM actions: apply,
edit-then-apply, dismiss. Nothing touches state without an explicit DM action.

**The board.** The DM's thinking space: a discussion surface with its own chat, its own
system prompt, and a digest of current state in context. Board outputs convert to state
changes one click at a time, tagged `origin: discussion`. The queue is where Sidekick
suggests; the board is where the DM thinks.

**Proposals are bookkeeping, never beats.** What the scan may propose: entries to write,
threads to surface, pressures coming due, phrasing for a turn it thinks the DM should
record. What it may never propose: story outcomes, campaign directions, opinions about
what should happen next. The scan reads the campaign; it does not author it.

**Rulings are feedback.** The half of the loop a notepad doesn't have. Every ratify,
refuse, rephrase, and retune is recorded and compounds: what the DM keeps teaches what
to propose next, what they dismiss teaches what to stop proposing, how they reword
teaches the voice proposals should arrive in. Over a campaign the scan should draft in
the DM's idiom and anticipate their calls. This memory persists across sessions; it is
the difference between a tool that repeats itself and one that has learned its user.

**Sovereignty.** The DM authors and rules, always. The protection is editorial, not
muteness: nothing enters the ledger or the chat unbidden, every change is reversible,
every entry is theirs to edit. Sidekick holds opinions and says them plainly—its value
is the quality of what it puts in front of you—but the word that enters the record is
yours.

## 4. The appetite layer — digest grammar

The rendering layer. It turns state into leans the model acts through, and it is where
the anti-flatness dosage is actually delivered.

The lifecycle from the Trellis era survives, mapped onto state rather than stored
alongside it:

- **Taste** — first contact with a hunger. In state: a scene that becomes a power's
  origin, or the moment a thread is born. The ledger holds it so the want has a
  birthplace.
- **Pressure** — the clock. In state: `pressures[]` and denied threads aging across
  scenes. A want comes due because pressure passed tolerance, not because a new issue
  wandered in.
- **Reckoning** — the want breaks into action: sated, starved, or transformed. In state:
  a thread resolving into a turn, a power changing stage, a line crossed.
- **Residue** — what reckoning leaves. In state: `linesCrossed[]`, history entries,
  inherited into the next taste.

**Shame decides visibility, and it is a mechanic, not a mood.** A shamed want doesn't
collide openly—it hides, and hiding is an action: the proxy route, the arranged
situation, the concealment that costs. The shamed character's most consequential
external acts are the ones that maintain the disguise, not the ones that feed the want.
Pressure on a hidden want doesn't decay; it accrues quietly and surfaces, three scenes
later, as exposure—and exposure lands harder than the original conflict would have. In
state terms: concealment shows up as `costs[]` entries paid in cover and exposure, and
as pressures the DM can read but the character won't say aloud.

**The grammar rules.** These are the spec, derived from the reroll evidence—the same
beat rerolled until the difference between tether-writing and springboard-writing was
legible:

1. **Lean, not label.** Render a pull the model acts through, never a fact it
   acknowledges. "She finds herself moving; afterwards she'll call it protocol," not
   "she is conflicted about her power."
2. **Decision-first.** Never render deliberation the character is standing in. The
   digest should make committing the cheaper sentence than anchoring—the want stated
   so plainly that safety-procedure reads as the harder path.
3. **The want is the objective.** Never let the character's own survival sit in the
   constraint set next to the want. Tether-writing is what a model produces when it is
   asked to keep everyone alive *and* reach; the render must make the reach the only
   goal.
4. **The outcome stays open.** The digest never pre-resolves the scene. It ends at
   "before the wind pulls her completely out of reach," not at the catch. Resolution is
   the model's and the world's, never the ledger's.
5. **The world stays alive around her.** Attention outward—the other person, the
   witness, the sirens—never spent on furniture. A render that burns its budget
   re-describing the environment invites the model to do the same.
6. **No meta-awareness.** The digest never acknowledges itself. The hero never knows
   why she moves; we never mention that we are the reason.

## 5. The render

**Mechanism.** A `generate_interceptor` runs on every non-dry-run generation, builds the
digest from state, and inserts one ephemeral message before the last user message—never
writing to the real chat array. The digest is prose in DM-brief voice, roughly 200
tokens, budget-enforced against context size: when over budget, limits and costs
compress before the arc does, and the arc line is never dropped—it is what makes her
behave differently over time. Quiet generations and sessions with no state are skipped.

**The worked render.** Hailey, freshly manifested, ledger to date: the spark (capability:
a blue-black force that wraps what she protects; limits: no control, unfocused it takes
everything from the waist down, it answers before she asks; costs: cracked asphalt and
witnesses), threads (what fired the projectile), pressures (her family must not learn;
forces beyond the city may have seen), one line crossed (public breakage, in front of a
stranger meta). The render:

> She can do one thing so far, and it arrives before she calls it: a blue-black force
> that wraps whatever she is holding when it comes, or everything if she is frightened.
> Two people and a stranger in a white shirt have seen it. Her parents' careful hopes
> and Alyssa's mockery both hang on a question she hasn't told them is live, so the
> spark stays her own business, and the lying is its own cost. Allie is alive because
> of what came out of her, and something was fired at a Ferris wheel to make that
> happen. She is finished watching people fall from safe ground.

That is the dose: power with its limits intact, shame as concealment, pressure audible,
and a closing lean that pre-refuses the tether pattern by name.

**The acceptance test.** The campaign's catch beat—the hero mid-lunge for a falling
friend—rendered from a similar lean must come back as springboard: foot planted to
launch, not to anchor; decision narrated, not procedure; the world still speaking
("Maxine, stay down!"); the outcome unresolved to the last clause. When a model given
this digest still tethers, the grammar is wrong and the render changes. The test is
model-agnostic by construction—the digest carries the dose, not the card.

## 6. Data model

```ts
interface SidekickState {
  version: number;                       // schema version for migrations
  cosmology: {
    sources: string[];                   // where powers come from in this setting
    stageVocabulary: string[];           // the setting's own progression stages
    costVocabulary: string[];            // the setting's cost language (strain, exposure...)
    taboos: string;                      // what this world forbids/never does
  };
  hero: { name: string; codename: string; statusQuo: string };
  powers: Power[];
  arc: Arc;
  queue: PendingChange[];                // proposals awaiting DM action
  history: ChangeEvent[];                // applied changes with provenance
  rulings: Ruling[];                     // DM feedback that trains the scan (§3)
  settings: LocalSettings;               // per-chat overrides (cadence, digest budget)
}

interface Power {
  id: string;                            // stable, human-slug ("the-spark")
  name: string;
  capability: string;
  limits: string[];
  costs: string[];
  stage: string;                         // from cosmology.stageVocabulary
  history: ChangeEvent[];
}

interface Arc {
  phase: string;
  threads: Thread[];
  pressures: Pressure[];
  linesCrossed: { line: string; cost: string; msgId: number }[];
}

interface Thread { id: string; text: string; bornAt: number; lastTouched: number; }
interface Pressure { text: string; since: number; denialCount: number; }

interface PendingChange {
  id: string;
  origin: 'evaluation' | 'discussion' | 'manual';
  summary: string;
  changes: { path: string; from: string; to: string }[];
  evidence: number[];                    // chat message indices
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: number;
}

interface ChangeEvent { summary: string; origin: string; evidence: number[]; at: number; }

interface Ruling {
  proposalId: string;                    // what was proposed
  action: 'applied' | 'edited' | 'dismissed';
  edit?: string;                         // how the DM reworded it, if they did
  at: number;
}

interface LocalSettings { evaluationCadence: number; digestBudgetTokens: number; }
```

Hygiene: never hold a long-lived reference to `chatMetadata` (the reference changes on
`CHAT_CHANGED`); fetch via `SillyTavern.getContext().chatMetadata`, persist with
`saveMetadata()`. Configuration that is not campaign-specific lives in
`extensionSettings.sidekick` and persists with `saveSettingsDebounced()`. No secrets
ever—`extensionSettings` is world-readable to all extensions.

## 7. Architecture map

```
manifest.json      display_name, loading_order, generate_interceptor, minimum_client_version 1.18.0,
                   hooks: { clean: onClean }
index.js           entry point; activates on APP_READY
src/state.js       state load/migrate/save, provenance-gated mutations, ruling log
src/inject.js      generate_interceptor, digest renderer, budget policy
src/grammar.js     the §4 grammar: state → lean prose (the dosage rules live here)
src/evaluate.js    evaluator prompt + jsonSchema + validation, cadence ticker
src/board.js       discussion board UI (separate generateRaw chat, own system prompt)
src/ui.js          extensions-panel drawer: hero sheet, review queue, board
style.css          near-mono palette + single warm accent
```

Events used: `MESSAGE_RECEIVED` (cadence ticker), `CHAT_CHANGED` (state rebind),
`GENERATION_ENDED` (avoid overlapping quiet passes), `APP_READY` (setup). Slash commands
via `SlashCommandParser.addCommandObject` for `/hero evaluate`, `/hero digest preview`.

## 8. v1 scope / non-goals

**In v1**

- Single hero, chatMetadata store, schema versioning + migration hook.
- Hero sheet UI (powers/arc/cosmology edit forms, inline).
- Digest injection via interceptor with budget policy and the §4 grammar.
- Evaluation pass with cadence + manual trigger; review queue with apply/edit/dismiss.
- Ruling log feeding proposal ranking; the scan drafts in the DM's idiom over time.
- Discussion board with state digest in context, "apply as change" on outputs.
- `onClean` hook removing stored data on extension deletion/clean request.

**Non-goals for v1**

- Parties/multiple tracked characters (the model allows a hero array later; the UI does
  not).
- Any dice or mechanical resolution. Narrative stays the sole arbiter.
- World Info read/write integration (a "copy digest as World Info entries" export is a
  cheap stretch goal, not a dependency).
- **Story proposals of any kind.** The scan never proposes what happens next. This is a
  hard non-goal, enforced at the schema level: proposals address state, not scenes.
- **Per-model tuning.** The digest is instance-agnostic by design; no per-branch card
  patching, no model-specific phrasing branches.
- i18n, preset-field storage, bundlers/frameworks (vanilla JS + Handlebars templates via
  `renderExtensionTemplateAsync`).

## 9. Open questions

1. Should the evaluation pass see the Expression digest itself (meta-awareness: "the
   hero is *supposed* to be holding back") or only raw scenes? Seeing it risks the
   evaluator rubber-stamping injected fiction as fact.
2. Digest insertion point: before the final user message (current plan) vs a pinned
   depth from the end via chat slicing.
3. Discussion board location: own drawer inside the Extensions panel vs a popup.
4. Evaluation cadence: 15 messages, or scaled with scene length?
5. The ruling log's persistence: where it lives in chatMetadata, how long it survives
   branch switching, and how much of a refusal the scan is allowed to remember.
6. Dose response: the scan reads recent scenes anyway—should flatness signals (tether-
   writing in the actual output) strengthen the next render's lean? Candidate for v1.x.
7. Hero file export/backup semantics—the chat file is the store; expose a journal export
   in v1 or defer.
