# Trellis — Abstract Foundations

Status: concept phase, agreed 2026-09-27. Target: SillyTavern 1.18.0+ (client-only
extension, no server plugin, no Extras).

This document supersedes the earlier "Sidekick" draft wholesale. That draft made limits
and consistency enforcement the spine of the product; it was wrong in voice and wrong in
loyalty. What survives from it: chatMetadata storage, single hero, no mechanics, a
DM-ratified state loop. Everything else below is the design as it now stands.

**No schema in this document, by design.** The data model comes later, after the concept
has been lived with. Structure before shape.

## Terminology

The document began in a garden metaphor, and the metaphor still carries the philosophy.
It is now demoted to *voice*: it may appear in how we talk to each other and in the
product's user-facing copy, never in function names, state, or mechanism sections. The
mapping is frozen:

| Metaphor | Mechanism |
| --- | --- |
| the garden | the ledger (all durable state) |
| the gardener | the DM |
| the seed | the LLM-played character |
| weather, growth notes | observations (scan output) |
| a bloom | a recorded turn |
| legacy | residue |
| pruning, trimming | editing, retiring appetite entries |
| tending | ratifying a change |

The product's functions, plainly named:

- **The Ledger** — durable state: the appetite register, threads, turns, residue, history.
- **The Digest** — the per-generation conditions block handed to the character model.
- **The Scan** — the periodic observation pass over recent scenes.
- **The Queue** — observations awaiting the DM's decision.
- **The Board** — the DM's discussion surface. Observes only.
- **The Sheet** — the DM-facing full view of the ledger.

No new metaphors are invented from here. The existing ones are already spoken for.

## 1. The three roles

The capstone. Everything in the product sorts under this:

- **The DM authors and rules.** They write the character's appetites and limits, decide
  where and how things go, and own every arrangement in the campaign.
- **The LLM plays the character.** It acts on the appetites it has been given, under the
  conditions Trellis renders. It is never told what to want.
- **Trellis renders the conditions.** It holds the ledger, observes the campaign, and
  hands the character its impulses. It authors nothing.

The founding image, kept as voice: *the LLM is the seed, Trellis is the trellis it grows
through, the DM is the gardener who owns the plot.* Nature works because it never argues,
never suggests, never explains itself.

## 2. Purpose

Modern models are consistent because consistency is what training rewards — and
consistency in a protagonist reads as machinery. They meet friction by *smoothing*:
pausing, deferring, tidying, negotiating the want away. Trellis exists to make that
harder. It is a counter-current instrument: it keeps one changing character alive,
hungry, and legible across a campaign long past where human memory would have quietly
dropped half the story.

Two readers, two registers, one engine: the DM sees a complete, remembered ledger; the
character acts on impulse. Neither is told anything.

## 3. Sovereignty

The DM determines limitations and chooses where and how things go down. Our purpose is
to make the choosing *informed by a living, complete, remembered ledger* — never to
choose, suggest, or arrange.

Why silence is better than suggestion: a DM offered arrangements starts approving the
tool's taste instead of ruling their own campaign; a model told where to lean performs
the lean instead of feeling it. Suggestion corrupts both sides. The moment we explain
ourselves, we are just another voice — and the table already has the two voices that
matter.

Constraints are the DM's instrument. A limit enters the ledger only because the DM wrote
it there. We never invent limits, never require them, never enforce them.

Appetite genesis follows the same law: no new want enters the register unbidden. Appetites
are written by the DM directly, or — only where the DM has granted growth permission —
surfaced by the scan and ratified before taking root. Editing and retiring entries are
the DM's tools too. Unbidden want-spawning is the old failure mode by another name
(escalation ex nihilo, one issue thrashing into the next), and the register stays closed
to it by default.

## 4. The unit: the turn

All change in the ledger is a **turn** — a narrative event, never a stat adjustment.

> "She stopped holding back after the bridge."

A turn is voiced in the register of the story, not the register of a spreadsheet. If a
proposed change cannot be phrased as something that *happened* or *became true*, it is
not a turn yet.

## 5. The turn lifecycle

**Thread.** Play creates potential without announcing it: she used flight in front of the
mayor's kid; he offered her a seat in the Syndicate and she didn't say no. Threads are
moments where the story's potential energy changed. Most are never resolved and quietly
lapse. That's fine.

**Surfaced.** The scan's real work: making ripening threads *visible* to the DM. Not
verdicts — observations. "This one has been denied for three scenes now." "The Syndicate
offer is still open in the story's memory."

**Ratified.** The DM calls it: when, whether, or never. Resolve now, hold, let it lapse.
Every fork in the story is theirs; we hold no opinion and offer none.

**Turn.** The ratified thread resolves into a new truth, voiced narratively: "she took
the mask off," "she said yes." A turn is a height event — escalation, revelation,
transformation, or price — and every turn creates fresh threads.

**Residue.** What a turn leaves: exposure, favors owed, lines the city drew, people who
saw. Residue is quiet until it isn't. Three arcs on, the villain reads her exposure and
finds the crack. The ledger exists to keep residue alive until it pays off.

Provenance, one layer down: a turn's pedigree is *which threads fed it*. The DM can
always ask "why is this true now?" and the ledger answers with its own history.

## 6. The appetite register

What the character is made of, morally neutral. Hero and villain hold these in equal
measure; the register tracks hunger, never permission.

- **Wants** — what she's chasing right now (the city's love; to matter before the
  diagnosis lands).
- **Fears** — what she runs from (being ordinary; being *seen* ordinary; being rescued
  twice).
- **Enjoyments** — what she likes that maybe she shouldn't (the winning; the fear in a
  room; flight itself at 3am).
- **Debts and grudges** — what she owes, what she's owed (the waterfront; a partner's
  patience).
- **Shames** — appetites she'd deny if anyone named them out loud.
- **Contradictions** — the pairings that cannot both hold (wants to save them; loves
  being the reason they need her).

The engine is conflict, and it is appetite colliding with appetite, or appetite colliding
with a price. That is drama. Incident is only noise.

## 7. Shame decides visibility

Shame doesn't color a want; it decides whether the want **collides** or **hides**. External
conflict isn't the reward for being unashamed — it's what any *seen* appetite generates,
because people react to what they can see: allies object, rivals exploit, the world pushes
back on an open want. The unashamed appetite shows itself, so it collides immediately and
legibly.

The shamed appetite would generate the same collision — and suppresses it by hiding. But
hiding is an action, not an absence: the midnight route, the proxy, the arrangement of
situations so nobody looks. The internal struggle is only half of it; the other half is a
continuous external campaign of concealment. Internal friction wearing external events as a
costume — and now we know why the costume exists.

The two clocks this creates:

- The **unashamed** appetite is kept honest by immediate collision; its reckoning comes
  due when the world's pushback passes tolerance.
- The **shamed** appetite hides from the clock. Nothing external forces the issue, so
  pressure does not decay — it accrues quietly and waits for exposure. When the want
  surfaces (and it surfaces, three arcs later), the collision is worse than it would have
  been, because concealment has turned a conflict into a betrayal. Exposure is the shamed
  pathway to reckoning, and it arrives uninvited.

Two consequences worth keeping: a hidden appetite that gets exposed lands harder than one
that was never hidden — the reveal is its own turn — and a shamed character's most
consequential external acts are the ones that maintain the disguise, not the ones that
feed the want.

## 8. The taste lifecycle

How an appetite is born and what becomes of it. Campaigns begin at or just after the
first taste, so appetites start young, pliable, with a known origin scene.

**Taste.** First contact with the hunger: an admiration, a wound, a win that tasted
better than expected. "I want to be like them" is the moment it is born. Tastes do not
occur spontaneously: the character acquires one because the DM wrote it, or because the
scan surfaced a candidate and the DM ratified it where growth is permitted (§3).

**Naming.** The want takes shape and picks its valence: sayable or unsayable. Shame is
either born with the want or acquired later — an appetite that was fine to admit becomes
unsayable after some scene marks it. A corrupted appetite is a recurring wound, not a
one-time event.

**Pressure.** The want is fed, denied, or tempted, repeatedly, over time. Pressure is
the clock: a turn comes due when an appetite has been under pressure past tolerance —
not when a new issue wanders in. Thrash-proof by construction.

**Reckoning.** The appetite breaks into action, and there are three honest ends:
**sated** (she gets it, and it tastes expected — or wrong), **starved** (she goes
without; the appetite hardens, reroutes, or curdles into a grudge), or **transformed**
(she discovers mid-stride that she wants something else now). Every reckoning is a turn,
and every reckoning can plant the origin of the next taste.

**Residue.** What a reckoning leaves: new tastes originating from what just happened,
habits of appetite (the pattern of how she gets fed), and inherited shame — wants passing
downward through events she didn't choose.

## 9. Impulses — the rendering to the character

An **impulse** is appetite rendered to the model as a lean, not a label: a pull it acts
through, not a fact it acknowledges.

The counter-current mechanic: models smooth friction — pause, defer, tidy, negotiate the
want away. A model carrying an impulse acts *through* the friction instead of dissolving
it, and action through friction *generates* friction. That single behavior answers both
perils at once. Blandness: a character with an urge is never mechanical. Thrash:
urge-driven escalation compounds consequences instead of resetting them — each push
into a resisting world produces the next legitimate turn. The wildness and the loyalty
are the same act, viewed from two distances.

The shamed impulse and the unashamed impulse differ in texture, never in force: the
unashamed reach is open ("she goes to them"), the shamed reach acts first and names
itself later ("she finds herself moving; afterwards she'll call it protocol"). The
conditions don't care which; the character moves either way.

## 10. The renderings

One engine, two costumes. The DM sees the fork; the model feels the lean.

**To the DM.** No guide. The ledger itself, made *visible* and *remembered*: what is
open, what is under pressure, what has been resolved, what has lapsed or been retired,
across the whole campaign, for the entire history. Legibility and memory are the entire
gift. Every decision — writing, editing, retiring, deciding what happens next — is
theirs alone, always. The scan speaks as observations: questions and remarks, never
arrangements. Its question-forms:

- *Taste-notices:* "She's never been looked at like that before." — helping the DM
  recognize a birth.
- *Shame-questions:* "Could she say this out loud? If not — how does she get it anyway?"
  — pointing at the proxy route without naming it.
- *Pressure-checkpoints:* "This want has been denied for three scenes now. What is it
  becoming?" — the clock, made audible.
- *Lean-observations:* "She bends toward the kid — reaching means the press line." — where
  the character already leans, and what the leaning costs. Observation of consequence,
  never a recommendation.

**To the character.** Conditions only. Light, season, the pull — never instruction, never
a directive. The impulse is delivered as a lean; the movement is the model's own doing,
and we never mention that we are the reason.

**The Board.** The DM's thinking space, where the ledger is examined and turned over. It
too speaks only through observation. The Board is where the DM hears their own campaign
read back to them, complete and remembered, so they can rule it better.

## 11. Decisions carried forward

Architecture-level decisions from the first round of this design. Not schema.

- **State lives in chat metadata** — per-campaign, private, survives branches and
  continues, works in group chats.
- **Configuration lives in extension settings** — never secrets (settings are readable
  by all extensions).
- **Single hero.** Parties are a later problem with a different shape.
- **No mechanics.** No dice, no resolution, no stat arbitration. The LLM remains the
  sole arbiter of outcomes; narrative is the only currency.
- **The loop is assisted, never autonomous.** The scan observes; the DM writes. Nothing
  enters the ledger without an explicit ratifying act.

## 12. Open threads

- The Sheet: what the DM sees when they open it (shapes, not structure).
- The scan's question-forms in practice: how observations are phrased so they stay
  observations.
- How appetites render into the digest's conditions — the exact grammar of an impulse is
  still open.
- Only after the concept has been lived with: the data model (still banned), file
  layout, event wiring, the extension skeleton itself.
