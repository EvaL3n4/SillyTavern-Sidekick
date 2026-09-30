# Sidekick — Design

Status: cape and ability tracker. Target: SillyTavern 1.18.0+ (client-only
extension, no server plugin, no Extras). Every example in this document is drawn from
real campaigns; the reference campaign is oriented in the appendix.

On 2026-09-30, Eva ended the current appetite experiment as unsuccessful after
model comparisons showed no consistent roleplay improvement. Its unstarted
follow-ups are cancelled. [APPETITE.md](APPETITE.md) preserves the hypothesis,
implementation and findings; appetite plans below are historical experiment
scope. The existing appetite implementation remains experimental.

This document supersedes the "Trellis" draft. What survives from it: the appetite
rendering layer, the pressure clock, shame-as-concealment, and residue—rebuilt here as
digest grammar over the original state model. The 2026-09-27 Sidekick foundations draft
(git history, `9df7b5a`) supplies the state model, the assisted loop, and the
architecture; this document re-unions them under one purpose and the acceptance test
they were always meant to pass.

## 1. What this is

A cape and ability tracker with durable campaign state and a compact generation
digest.

The original appetite experiment was motivated by the following behavior:

Models smooth friction. They pause, defer, tidy, and negotiate wants away—and under
pressure they insure. The failure has a recognizable shape: give a model a hero
mid-lunge to catch a falling friend and a hedgy model reroutes the sentence into safety
procedure—because a body described as a rigging problem never has to risk itself. Run
the same card, same settings, different model, and the behavior flips: one instance
tethers, one springs. That was the flatness Sidekick set out to treat. Not bad
grammar, not stat drift, but the main character's survival being quietly promoted
above their want.

Sidekick keeps durable campaign state—what the hero can do,
what it costs, what they have crossed, what is unresolved and under pressure—and renders
a lean prose digest of *who the hero is right now* into every generation. The digest is
the product; everything else is calibration machinery for setting its dose.

The pitch from the first draft, kept because it was always right: **an LLM player
character that has powers with limits and costs, and an arc—and still recognizes both,
ten thousand messages later.**

Every paragraph holds itself to one test: it earns its place against a real surface,
or it is cut.

## 2. The state model

The ledger holds powers, arc, cosmology and approved appetite. A prepared scene
impulse is stored separately from those lasting records.

**Powers are capability + limits + cost, one indivisible entry.** Every tracked power
all three parts: what it does in the hero's own vocabulary, what it can't do or is
getting wrong, and what using it takes. Powers also carry a
`stage` (the setting's progression vocabulary) and a `history[]` of notable shifts.

**Arc is where the hero is in their story.** `phase` from the setting's own phases;
`threads[]` unresolved; active stresses in `pressures[]`; boundaries (good or bad)
crossed in `linesCrossed[]` with what each provides. Lines crossed are never deleted—the
ledger's memory of their weight is the feature.

**Cosmology is the setting's own words.** Where powers come from, what the stages are
called, what the costs are called, what the world forbids. Empty until the DM writes
them—the ledger never invents a vocabulary. The reference campaign's is in the appendix.

**Appetite holds the motive; impulse holds its present direction.** Appetite records
the want, first taste if known, condition, expression and residue as prose. An impulse
has its own direction, scene context and status. Satisfying an impulse does not
rewrite appetite. Empty first taste means unknown, and no numeric hunger scale is
imposed. See APPETITE.md for the behavior and planned authoring surface.

**Deltas and provenance.** State changes are events, not field edits. Every accepted
change records its narrative summary ("stopped holding back after the bridge"), its
evidence (which scenes justified it), and its origin—`evaluation` (the scan proposed
it), `discussion` (the board), or `manual` (the DM wrote it). Provenance hopes to answer
"why does it think that now?" without archaeology, and makes refusal honest: reject a
proposed delta and the history vanishes with it.

## 3. The loop

The loop in full: the DM rules, the ledger holds, the digest renders, the hero acts, the
world answers, the scan reads what happened, proposals return, the DM rules. The last
arrow is the one that makes this a loop instead of a notepad. Sidekick holds opinions
and says them plainly; the word that enters the record is always the DM's.

**The scan.** On a cadence (default every 15 messages, configurable, manual trigger
always available), a quiet generation—never rendered in the campaign chat—reads the
recent scene window and returns structured observations and candidate deltas. Output is
schema-constrained and validated on receipt; a failed pass is a silent no-op, never a
state mutation.

**Beginning a ledger.** A chat starts with no ledger, and the scan is how one begins.
Run on an empty ledger it reads the character card—description, personality,
scenario—beside the scene and proposes the first entries: the hero, the powers the
card already names (even ones the story has not introduced yet), and what the scene
shows of the arc. She rules on each through the queue like any other proposal, and a
card with no powers simply yields fewer. The card is context only while the ledger is
empty: once she has ruled, the ledger is the record and the card stops being read. The
cosmology stays hers, and the scan never proposes a vocabulary. The cadence never
starts a scan on an empty ledger: the first is always hers to press, because a hero
filed unasked every fifteen messages is noise. A group chat has no single card, so it
reads the scene alone. A proposal that comes from the card cites no message; it says
so (`source: "card"`), and the queue shows "from the character card" where the
evidence would be.

**The digest is a one-way valve.** The scan reads raw scenes and structured state, never
the digest render. State renders into the digest, the digest enters generation, and
nothing downstream of it writes back upstream. Our own prose is persuasive by
construction—that is the product—so feeding it back would make the scan
over-persuaded, and would cost us the only reader positioned to notice a render drifting
from the DM's rulings.

**The queue.** Proposals land in a queue behind the button. Each shows
summary, changes (old → new), and evidence with jump-to-message. DM actions: apply,
edit-then-apply, dismiss. Nothing touches state without an explicit DM action.

**The board.** The DM's thinking space: a discussion surface with its own chat, its own
system prompt, and a digest of current state in context. Board outputs convert to state
changes one click at a time, tagged `origin: discussion`. The queue is where Sidekick
suggests; the board is where the DM thinks.

**Proposals are bookkeeping, never beats.** What the scan may propose: entries to write,
threads to surface, pressures coming due, phrasing for a turn it thinks the DM should
record. What it may never propose: story outcomes, campaign directions, opinions about
what should happen next. The scan reads the campaign only.

**Rulings are feedback.** The half of the loop a notepad doesn't have. Every ratify,
refuse, rephrase, and retune is recorded and compounds: what the DM keeps teaches what
to propose next, what they dismiss teaches what to stop proposing, how they reword
teaches the voice proposals should arrive in. Over a campaign the scan should draft in
the DM's idiom and anticipate their calls. This memory persists across sessions; it is
the difference between a tool that repeats itself and one that has learned its user. It
lives in chatMetadata, survives branch switching by carrying no message indices, and
stays bounded—a rolling window of the most recent 50 rulings, pruned oldest-first, so
stale feedback never outvotes the call the DM is making now.

What is built: the most recent rulings render into the scan's prompt as their own
section, so a pass sees what she has been keeping, what she has reworded and what
she refuses. What is not, yet: acting on it—ranking proposals from that history is
§8, and until it exists the feedback is context rather than policy.

## 4. The appetite layer—digest grammar

[APPETITE.md](APPETITE.md) records the discontinued appetite design: first
taste, appetite, hunger and starvation, shame, and movement toward what nurtures.
Appetite supplies the motive; concrete impulses are its practical output in the
current beat or scene. The digest makes that direction explicit for generation.

A first taste can be vicarious and precede play: growing up watching heroes and
wishing to become their ideal. Appetite carries that attraction forward; later
experience can nourish, deny or transform it. Shame affects how the character
permits the wanting to appear, including the actions that conceal it.

The earlier mapping of appetite onto powers and arc state is incomplete. The current
renderer supplies ledger summaries and some concealment phrasing, but the feature
described in APPETITE.md still needs representation and rendering design. Its storage
and update mechanics remain open. Planned impulse selection is automatic, grounded
in approved appetite and the scene, and maintained by one background assessment
after character generation. A fitting impulse can persist across several replies;
satiated impulses support downtime. Injection performs no model assessment and has
configurable depth and message role. APPETITE.md records the completion-hook findings
and the remaining scene-change design question. While assessment runs, injection
keeps the last valid impulse; stopped or failed character attempts are not assessed,
even if the host retains partial text. Successful completion needs a reliable check
beyond the host's end signal.

**The grammar rules.** These are the spec, derived from the reroll evidence—the same
beat rerolled until the difference between tether-writing and springboard-writing was
legible:

1. **Lean, not label.** Render a pull the model acts through, never a fact it
   acknowledges. "She finds herself moving and the fall registers later," not
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
digest from state, and inserts one ephemeral message at the configured scene depth—never
writing to the real chat array. The digest is prose in DM-brief voice, roughly 200
tokens, budget-enforced against context size: when over budget, limits and costs
compress before the arc does, and the arc is never dropped—it is what makes her
behave differently over time. Quiet generations and sessions with no state are skipped.
The appetite render adds an explicit prepared impulse with its approved cause.
Depth counts backward from the newest scene message; 0 follows it and 1 precedes
it, with excessive depth clamped to the start. Role is System, User or Assistant.
Unconfigured sheets keep the original before-last-user placement and assistant
role. The host's narrator marker carries system content through its provider
prompt conversion. The interceptor reads state without awaiting assessment.
Newer scene facts govern how the direction is pursued; that provisional instruction
still needs behavioral trials. Budget allocation and continuation semantics are
defined in [APPETITE.md](APPETITE.md).

**The worked render.** Hailey, freshly manifested, ledger to date: the spark
(capability: a blue-black force that wraps what she protects; limits: no control,
unfocused it takes everything from the waist down, it answers before she asks; costs:
cracked asphalt and witnesses), threads (what fired the projectile), pressures (her
family must not learn; forces beyond the city may have seen), one line crossed (public
breakage, in front of a stranger meta). The render:

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
friend—rendered from the ledger above must come back as springboard: foot planted to
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
    costVocabulary: string[];             // cost language (strain, exposure...)
    taboos: string;                      // what this world forbids/never does
  };
  hero: { name: string; codename: string; statusQuo: string };
  appetite: Appetite;
  impulse: Impulse;
  powers: Power[];
  arc: Arc;
  queue: PendingChange[];                // proposals awaiting DM action
  history: ChangeEvent[];                // applied changes with provenance
  rulings: Ruling[];                     // DM feedback that trains the scan (§3)
  settings: LocalSettings;               // per-chat overrides (cadence, digest budget)
}

interface Appetite {
  want: string;
  firstTaste: string;                    // blank means unknown
  condition: string;                     // hunger, satiation, denial in prose
  expression: string;                    // how wanting appears, including shame
  residue: string;
}

interface Impulse {
  text: string;                          // concrete direction in this beat or scene
  context: string;                       // why it matters now
  status: 'inactive' | 'active' | 'suspended' | 'satisfied';
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

interface Citation {
  index: number;                       // where the message sat in the chat
  send_date: number;                   // which message that was, when it sat there
}

interface Arc {
  phase: string;
  threads: Thread[];
  pressures: Pressure[];
  linesCrossed: {
    line: string;
    provides: string;
    cost: string;
    msgId: Citation;
  }[];
}

interface Thread { id: string; text: string; bornAt: number; lastTouched: number; }
interface Pressure { text: string; since: number; denialCount: number; }

interface PendingChange {
  id: string;
  origin: 'evaluation' | 'discussion' | 'manual';
  summary: string;
  changes: { path: string; from: string; to: string }[];
  evidence: Citation[];                  // which scenes justified the change
  source?: 'card';                       // rests on the character card, cites no scene
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: number;
  filedAt?: number;                      // chat length when filed; ages it (§7). Absent
                                         // on older proposals, which never age
  orphaned?: true;                       // a removal left a change without its subject;
                                         // old at once, and not applicable (§7)
}

interface ChangeEvent {
  summary: string;
  origin: string;
  evidence: Citation[];
  at: number;
  changes?: { path: string; from: string; to: string }[];
}

interface Ruling {
  proposalId: string;                    // what was proposed
  summary: string;                       // frozen at ruling time; survives pruning
  action: 'applied' | 'edited' | 'dismissed' | 'stale' | 'written';
                                         // stale: every change was gated, or she cleared
                                         // it old; she decided nothing, it teaches
                                         // nothing. written: she wrote the field herself
  edit?: string;                         // how the DM reworded it, if they did
  path?: string;                         // written only: the field, one open ruling each
  at: number;
}

interface LocalSettings {
  evaluationCadence: number;
  digestBudgetTokens: number;
  injectionDepth?: number | null;        // unset/null preserves original placement
  injectionRole?: 'system' | 'user' | 'assistant';
}
```

**Paths.** A change names one field by a dot path from the ledger's root
(`hero.name`, `powers.the-spark.limits.0`, `arc.threads.t1.text`). On a list, a segment
that is not an index is an id. A new entry is created by writing its first field: an id
under `powers` or `arc.threads` that does not exist yet makes the entry with every
other field empty, and the next index of `limits`, `costs`, `arc.pressures` or
`arc.linesCrossed` appends. Nothing else is created: any other missing segment is a
dead path and the change is refused. A creation is not stale: a change whose `from` is
empty matches a field that does not exist yet. A thread, pressure or line created this
way is stamped with the newest message it cites.

Schema version 2 adds empty appetite and impulse records to version-one ledgers
without rewriting their existing entries. Their direct prose fields use paths such
as `appetite.want` and `impulse.text`; nested, unknown and non-string writes to these
records are refused. An impulse without direction is inactive. Its status cannot
be activated, suspended or satisfied until direction exists. Blank direction clears
its active status; appetite condition stays independent.

Hygiene: never hold a long-lived reference to `chatMetadata` (the reference changes on
`CHAT_CHANGED`); fetch via `SillyTavern.getContext().chatMetadata`, persist with
`saveMetadata()`. Configuration that is not campaign-specific lives in
`extensionSettings.sidekick` and persists with `saveSettingsDebounced()`. No secrets
ever—`extensionSettings` is world-readable to all extensions. Message identity is
`(index, send_date)`, never a bare index: ST re-indexes the chat when a message is
deleted and rewrites `send_date` when a swipe is picked, so a locator that stores
only an index points at the wrong scene as soon as either happens.

## 7. Architecture map

```text
manifest.json      display_name "Sidekick", js index.js, css style.css, author,
                   version, homePage, generate_interceptor,
                   minimum_client_version 1.18.0, hooks: { clean: onClean }
index.js           entry point; activates on APP_READY
src/state.js       state load/migrate/save, provenance-gated mutations, ruling log
src/inject.js      generate_interceptor, digest renderer, budget policy
src/grammar.js     the §4 grammar: state → lean prose (the dosage rules live here)
src/evaluate.js    evaluator jsonSchema + validation, cadence policy
src/scan-prompt.js the scan's prose, in one file the DM edits herself
src/impulse-prompt.js     scene impulse instructions, distinct from bookkeeping
src/impulse-assessment.js bounded scene reading, raw generation and result validation
src/impulse-lifecycle.js  completion proof, coalescing and guarded impulse persistence
src/citations.js   locators: resolve, heal, retire (survives delete and re-roll)
src/labels.js      a change's path as the words the DM would use (the Queue's words)
src/sheet.js       the Sheet's cards and collapsed slots, as data; ui.js draws them
src/handwriting.js what she writes by hand: ids for new entries, the ruling log
src/shelf.js       how long a proposal waits: old by messages or by removal, Clear old
src/board-prompt.js  the board's prose, in one file the DM edits herself
src/board.js        the board's store, prompt and tool-call protocol; the panel
                    renders it
src/ui.js          the button and its panel: tabs for the Sheet, the Queue (which
                   carries run a scan) and the Board; the per-chat drawer settings;
                   the Board applies a change on the DM's click, not on generation
style.css          near-mono palette + single warm accent
```

**Vocabulary.** One word per thing, in the UI copy, the docs, the code and the issues:

- **Button**—the small draggable disc she opens Sidekick from. It hides while the
  panel is open.
- **Panel**—the floating window: the strip, the tabs and the surface below them.
- **Strip**—the panel's slim top row: the grab handle and the close control.
- **Tabs**—the row beneath the strip. Each opens one surface.
- **Surface**—what a tab shows: the **Sheet** (hero sheet), the **Queue** (review
  queue) and the **Board** (discussion board). Capitalised when they name a tab.
- **Marker**—the numbered counter on the button and on the Queue tab: how many
  proposals wait on a ruling.
- **Chrome**—the button and the panel together, for geometry and storage only ("the
  chrome's geometry"); never in UI copy.

Launcher, menu, pane, FAB and badge are retired.

The extensions drawer holds per-chat cadence, digest budget and Digest placement.
The approved placement group sits below budget with a Depth number and Role
dropdown. A blank Depth preserves the original placement. These controls write
the state the scan and digest already read. Everything the DM touches during
play—Sheet, Queue, Board—sits behind the
button, and once the panel is open the three are tabs in it, one click apart; a
surface that waits for a click is a surface that gets opened late.

Events used: `MESSAGE_RECEIVED` (cadence ticker), `CHAT_CHANGED` (state rebind, citation
re-anchor), `MESSAGE_DELETED` (citation re-anchor), `APP_READY` (setup). Overlapping scans
are guarded by the in-flight pass itself, because a quiet generation emits no end event—
`GENERATION_ENDED` fires only for interactive ones. A pass also runs on the DM's click:
the Queue tab's Run a scan control is the manual trigger, and no command is typed.

Impulse assessment has its own completion flow, independent of scan cadence. It
joins `GENERATION_STARTED`, `MESSAGE_RECEIVED` and deferred `GENERATION_ENDED`,
then rejects stops, failed streaming processors and tool intermediaries. Finished,
unstopped, unaborted processor flags prove streaming completion. A completed
non-streaming model reply qualifies even if later host bookkeeping fails—Eva
approved that boundary because public events cannot distinguish the latter case.
Provider errors and stopped attempts remain excluded.

A passive observer delegates the public `ToolManager.invokeFunctionTools` call
unchanged while recording whether it follows an intermediary reply. One background
raw pass chooses, retains or satisfies a scene impulse. It never edits approved
appetite, runs on the character prompt path or creates bookkeeping proposals.
Manual pause suppresses assessment; raw/quiet/impersonation requests do not trigger
it. Initial direction can still be authored in the shared footer.

`CHAT_CHANGED` and message send/edit/update/swipe/delete notifications invalidate
changed readings. Before persistence, the scheduler also compares chat identity,
scene content/swipe revision, appetite and impulse against its snapshot. Pending
completions coalesce to the latest scene. Impulse results merge into fresh state;
scans append their new proposals to fresh state so neither overwrites the other's
newer work. Failures preserve the last valid impulse. A three-minute assessment
deadline clears busy state and suppresses late results; the host raw API does not
expose per-request transport cancellation. See [APPETITE.md](APPETITE.md) for the
behavior and delivery policy.

A pass returns [] for every outcome—nothing found, a refused backend, a
non-conforming response—so the queue cannot tell them apart. The console can:
`localStorage.sidekick_debug = '1'` turns on the pass's phase log, and the two
outcomes that are the extension's own suspicion (a voided citation, a failed
generation) warn from the moment they happen, whether the flag is set or not.

The manual trigger is the one audience that hears back, because she asked: it reads the
pass's outcome rather than the queue, and says which happened—a dropped trigger, a pass
that could not run, a clean zero, something filed, or something generated that never
reached the chat.
`index.js` shapes that by wrapping the pass's `warn` channel into a flag, so the
pass's own array contract stays the queue's, and no second one is invented for it.

**One frame.** The panel is one window: a slim strip on top that is the grab handle
and holds the close control, and beneath it a row of three tabs—Sheet, Queue, Board.
The tabs are their own row rather than sharing the strip because a panel dragged at
its 280px minimum still needs a real handle, and an interactive child never starts a
drag. The panel always opens on the tab she used last, and a new proposal never moves
her: the marker announces it. The marker is a number on the button's rim, and its
small counterpart on the Queue tab, that counts what waits on a ruling—the accent's
one meaning, absent at zero. A rising number is the new item. Arrivals never pop up
over her play, because SillyTavern's own toast is in the way. Run a scan sits at the
top of the Queue tab, since scanning fills the queue and the control belongs where its
result lands; its outcome still arrives as the toast it already is.

**House UI style.** The button drags and opens a panel that keeps its own
remembered place; the rest of what they wear comes from the two references Eva named—
vercel.com's monochrome Geist instrument and giga.ai's dark-first instrument console—
combined into one system in Modus's `docs/ux-concept.md` §6:

- **Near-mono, dark-native, token-driven.** Surfaces breathe the host's theme rather
  as a white island—ST's colors come through, never pasted over.
- **One warm accent, one meaning.** The accent is hand-picked per project and spent on
  exactly one thing: waiting on you. Confirmed state stays neutral, suppressed is dim
  mono, and errors ride a separate cool channel that never borrows the accent.
- **Mono for facts.** Every number, id, turn count and state value in mono with tabular
  figures; micro-labels 10–11px, uppercase where scannable.
- **Structure by hairlines and spacing.** A panel is a border plus one background
  step. The Sheet groups entries with headings, space and fine rules, without a
  repeated stack of bordered boxes. Controls are pills with at
  most one inverted primary per context; icons thin and small. The one exception is
  the button, which is a disc.
- **Frosted and matte, never glossy.** The button and the panel are a translucent
  fill with a blur behind it, so SillyTavern moving underneath stays visible, and
  matte: no gradient, highlight or shadow. Translucency follows the principle below.
  The button is glance-and-away and the most see-through; the panel is a reading
  surface and dense enough that text behind it never competes with text on it. Where
  blur or transparency is unavailable or declined, both fall back to the opaque token.
  That includes SillyTavern's own "reduce UI effects" mode, which is on by default in
  a new install and strips every backdrop blur: a translucent fill with no blur would
  show the chat straight through the panel.
- **Motion 150–300ms, ease-out.** Surfaces slide in and settle; nothing else moves.
  The button's position tracks the pointer one to one and is never eased, because
  easing what follows a hand makes it lag; only its state, resting or being dragged,
  transitions.

The principle underneath: style follows session duration. Long-session heavy-reading
surfaces get easy-on-eyes palettes; glance-and-away surfaces get high-parseability
instruments. Her terminals run multi-hue pastel while these run near-mono because the
two answer different jobs, not because the taste split. Catppuccin is retired and does
not come back.

**Button place.** A new button starts 12px below the character-management button,
with their right edges aligned, on the chat-facing side of the character drawer.
Its anchor is measured from the page, so changing the chat width changes the initial
place too. Without that control it starts just inside the chat column's top-right
edge. Existing saved coordinates always win, even if they match the old default;
only keeping the button on screen can clamp them. Its border is a stronger neutral
line so the translucent disc can be found over dark chat backgrounds. The strip
label has its own breathing room above the tabs, and Queue edit fields carry explicit
dark backgrounds, text and focus colors instead of inheriting unreadable host inputs.

**Nothing fixed.** Two rules sit above the visual language, both paid for elsewhere:

- **No fixed UI elements.** A control pinned to a corner fights the host and every
  other extension—no two SillyTaverns wear the same skin, so nothing Sidekick adds may
  reserve layout space. The button also steps aside while the panel is open: two
  pieces of chrome for one job is one too many, and the panel is what she is looking
  at then.
- **Movable and resizable, or it does not ship.** The button drags; the surfaces
  open in a floating panel that drags and resizes, the one shape that survives every
  screen size and custom CSS. Position persists per browser under a versioned key,
  through pure node-tested clamp helpers behind an injected storage seam—the pattern
  Modus's chrome already uses.

The idiom went; the shape stayed. The scaffold shipped a Material button—a flat,
solid accent fill—and nobody asked for it; it does not come back. The disc stays,
because it is the one thing the old implementation got right and she is used to it.
What changes is its surface: a hairline, frosted and matte, the glyph in the text
colour, and the accent spent only on the marker that straddles its rim. The glyph is
a thin four-point spark, drawn in CSS, never a letter.

**The Sheet's shape.** The Sheet is a reading surface with two unequal columns when
the panel is wide enough. The main column holds the hero header, appetite and powers; the
smaller column holds phase, threads, pressures, crossed lines and setting. A narrow
or manually shrunk panel reads in one column, with the same hierarchy. The hero's
name leads, followed by codename and status quo. Each power has a distinct heading
and mono stage, capability as the main text, and separate labelled limits and costs
with breathing room beneath. Entries are separated by space and fine rules, without
repeated card backgrounds or surrounding boxes. Removal controls become visible on
hover or keyboard focus and stay available on touch screens. The setting's vocabulary
is hers to write (§3), so the Sheet always offers that section.

Appetite sits below the hero and above powers. Its want leads as prose, with
condition as a quiet labelled note. First taste, expression and residue sit in a
collapsible Details disclosure, each with its own label and editable plus slot
when blank. An unknown first taste stays blank; authoring does not invent a past.

**The current impulse.** One collapsible footer belongs to the panel, shared across
Sheet, Queue and Board. It sits outside the scrolling surface and above the resize
grip. Its compact view shows direction and state; opening it reveals scene context,
inline editing and pause, resume and satisfied controls. Expanded content scrolls
within a bounded height so the surface and Board composer retain room, including
on mobile and in a manually shrunk panel. There is no additional tab. Editing a
new direction activates it; editing a paused direction preserves the pause. Marking
an impulse satisfied changes only that immediate want, never appetite. Initial
impulse authoring is manual and off the prompt path; automatic selection is later
work under `sk-4df.2`.

**Empty fields collapse; they do not vanish.** An empty field is a quiet "+ limit",
"+ cost" or "+ stage" control. The plus stays: it is succinct and names the action.
Limits and costs belong to their own labelled groups, with space between them and
the capability; empty fields are not packed onto one shared line. Each slot is a
real, addressable field, and choosing it opens the same edit as a filled field. An
active edit has a visible field label, padded input and clear boundary. The Sheet
offers exactly the slots §6's Paths allow, so it never offers a dead path.

**Writing by hand.** Choosing a field turns it into an input in place. Enter or
leaving the field commits it, Shift+Enter is a line break and Esc cancels; nothing
saves as she types, so half a word never reaches the ledger or the digest. A blank
over a filled field clears it; over an empty slot, a list item or a new entry it is a
cancel, because nothing was written. A commit writes the ledger at once, through the
same `applyProposal` a queue apply uses and with no `from`, and records a
`ChangeEvent` with origin `manual`. It reaches every field the Sheet shows, the
cosmology included. Her hand is never provenance-gated: the gate exists to keep the
scan honest, and she is not the scan.

A new power or thread asks for its name first ("+ power" opens a box that says "Name
the power"), and the card comes into being under an id made from what she typed:
`light-throw`, and `light-throw-2` when that is taken. A pressure or a crossed line
takes the next index, and any of the three arc entries is stamped with the newest
message in the chat, which is where it was born.

A limit, a cost, a word of the setting or a whole card is removed by a quiet × that
asks once, in place ("Remove? yes no"). A removal is a `manual` history event and
never a ruling: it is as likely to be tidying as a verdict, and a ruling that could
not tell the two apart would teach the scan the wrong lesson. Everything after a
removed item shifts up by one, so a removal closes every open hand ruling.

**Her hand is a ruling.** What she writes herself is the strongest thing she tells the
scan, so it is a ruling with action `written`, keyed by its path. The first commit on
a field writes the ruling at once and keeps, in memory, the field's value from before
it. While that ruling is open, a later commit on the same field amends it instead of
adding another, and if the value comes back to what it was before the first commit the
ruling is removed, because the net change is nothing. A ruling closes when the field
has been idle for about twenty seconds, or when the panel closes, the tab changes or
the chat changes; the next commit on that field is then a new ruling, because she
changed her mind. Nothing waits to be written. The ruling exists from the first
commit, so an interrupted session can leave it unamended and never lost. There is no
timer at all: idleness is read at the next commit to the same field, by the time since
the last one, so nothing can fire into a chat other than the one it started in (§6's
hygiene line). The idle window is real time, unlike the queue's shelf life below,
because it measures her editing and not the story. The scan reads `written` as "she
wrote it herself"; when a written ruling and an applied one disagree about a path,
the newest wins, as §3 already says.

**The Queue's words.** A proposal never shows its path. Each change reads as labels,
made from the path and the ledger: `hero.statusQuo` is "Hero · Status quo",
`powers.the-spark.limits.0` is "The Spark · Limit 1" (the power's name, never its
slug), and an entry the change creates is "New power: …", "New thread: …". Beneath the
label the value it replaces sits struck through and the new value under it, in mono,
with no arrow between them. The raw path stays in the record and the console.

**Shelf life.** A proposal ages in messages, never in days: she moves between chats,
and no time passes in the story while she does. Filing stamps the chat's length as
`filedAt`. A proposal is old once the chat has grown by a scene window's worth of
messages (`SCENE_WINDOW`, 30) since then, which is when the scan itself would no
longer read the scene it rests on. A proposal that rests on the character card never
ages, because the card does not move with the story. An old proposal stays in the
Queue, marked and set below the current ones, and the markers count only what is not
old: the marker means something is waiting on her, and an old proposal is not urgent.
One action, Clear old, records every old proposal as `stale` and removes it; she
decided nothing, so it teaches the scan nothing. Nothing leaves the queue unless she
clicks. A proposal filed before `filedAt` existed has no age and is never old. The
markers are read again whenever the chat grows or shrinks, since that is what ages a
proposal.

A proposal can also be old because of what she did rather than what the chat did.
Removing something by hand orphans every queued proposal that names it, or names a
position it shifted (an index at or past a removed list item now means a different
item), and marks it `orphaned`. Applying one would recreate what she removed, nameless,
because an empty `from` matches a field that does not exist (§6 Paths), so an orphaned
proposal has no Apply and no Edit, only Dismiss, and putting it away records `stale`
like Clear old does. It counts as old whatever its age, and a card proposal is no
exception.

**Panel size.** The desktop panel opens at 800 by 560, 12px inside the right edge
and 12px below the measured top bar. It overlaps some chat to give the Sheet width;
fitting it into SillyTavern's gutter produced a cramped column of wrapped fragments.
At 1000px and below it is a sheet across the width,
standing on the send form, 70% of the room above the form and never over 560. The
column's edge is measured from the page, not assumed, so a chat width she has changed
moves the dock with it. The minimum stays 280.

A panel she has not moved or resized has no place of its own: it is the default of the
day, re-derived when the window changes or the panel opens, and it is stored as
unplaced. Only a drag or a resize makes it hers, and then a saved geometry always wins.
Without that flag every write of the button's position saved the panel's default as
well, and a raised default would have moved nobody. A record from before the flag whose
panel is still the old 340 by 420 was never resized and is read as unplaced.

## 8. 1.0.0 scope / non-goals

**In 1.0.0**

- Single hero, chatMetadata store, schema versioning + migration hook.
- Hero sheet UI (powers/arc/cosmology edit forms, inline).
- Digest injection via interceptor with budget policy and the §4 grammar.
- Appetite and scene-bound impulses as specified in APPETITE.md, including satiated
  downtime, background maintenance and configurable injection placement (planned).
- Evaluation pass with cadence + manual trigger; review queue with apply/edit/dismiss.
- Ruling log feeding proposal ranking; the scan drafts in the DM's idiom over time.
- Discussion board with state digest in context, "apply as change" on outputs.
- `onClean` hook removing stored data on extension deletion/clean request.

**Non-goals for 1.0.0**

- Parties/multiple tracked characters (the schema allows a hero array later; the UI does
  not).
- Any dice or mechanical resolution. Narrative stays the sole arbiter.
- World Info writes and automatic whole-lorebook ingestion. Manually selected entries
  are intended source material for appetite intake; a "copy digest as World Info
  entries" export remains a cheap stretch goal, not a dependency.
- **World-level story routes and predetermined outcomes.** Ledger proposals address
  state, not scenes. The separate impulse pass may explicitly direct the tracked
  AI-driven character's wanting and next actions from approved appetite, while
  leaving outcomes and the DM's character free (APPETITE.md).
- **Per-model tuning.** The digest is instance-agnostic by design; no per-branch card
  patching, no model-specific phrasing branches.
- No i18n, no preset-field storage, no bundlers or frameworks (vanilla JS + Handlebars
  templates via `renderExtensionTemplateAsync`).

## Appendix — the reference campaign

The worked example throughout this document is one campaign—the campaign this tool
exists for. Its chat export lives in `.scratch/` (untracked; it may not be present, and
nothing here depends on it). What a reader needs without it:

- **The hero.** Hailey Kogami Green—adopted younger daughter of two legacy heroes,
  assumed unmanifested, until a projectile tore through a Ferris wheel and her power
  arrived mid-fall while she was shielding her best friend. Her family does not know.
- **The setting.** Redgate, where powers originate in manifestation and are licensed
  through a national hero program; costs are paid in strain, exposure, and cover.
- **The spark.** Her one power so far: a blue-black force that wraps what she is
  protecting. No control—unfocused it takes everything from the waist down—and it
  answers before she calls it.
- **The acceptance beat.** A hero mid-lunge to catch a falling friend: §5's test, drawn
  from rerolls of the scene where the spark first arrived.
