# Trellis—Abstract Foundations

Status: concept phase, agreed 2026-09-27. Target: SillyTavern 1.18.0+ (client-only
extension, no server plugin, no Extras).

This document supersedes the earlier "Sidekick" draft wholesale. That draft made limits
and consistency enforcement the spine of the product; it was wrong in voice and wrong in
loyalty. What survives from it: chatMetadata storage, single hero, no mechanics, and a
DM-ratified state loop. Everything else below is the design as it now stands.

**No schema in this document, by design.** The data model comes later, after the concept
has been lived with. Structure before shape.

## The flow

The whole engine in one line:

> Taste becomes appetite. Appetite becomes impulse. Impulse becomes movement. Movement
> becomes crash.

- A **taste** is first contact with a hunger; it becomes an entry in the **appetite**
  register (§6, §8).
- The digest renders the live appetite as an **impulse** the model acts on (§9).
- The model acts—**movement**—and the world answers. When the world objects, that is the
  **crash**: the collision of §7, the moment the want meets resistance.
- Crashes change the register: pressure (the clock, §8), residue, fresh threads (§5), and
  the DM's next view of the ledger (§10).

The movement is the model's; everything it lands on is the world's, improvised by the DM
and never scripted by us. Trellis holds the chain together and watches where it breaks.

## Terminology

The garden metaphor is demoted to *voice*: it belongs in prose and top-level concept
explanation, never in the product's operational surfaces. Users get plain terminology
everywhere—no seeds, no gardens, no gardeners in the interface or in copy they must act
on. A bit of flair, not all flair.

The product's functions, plainly named:

- **The Ledger**—durable state: the appetite register, threads, turns, residue, history.
- **The Digest**—the per-generation conditions block handed to the character model.
- **The Scan**—the periodic observation pass over recent scenes.
- **The Queue**—observations awaiting the DM's decision.
- **The Board**—the DM's discussion surface. Observes only.
- **The Sheet**—the DM-facing full view of the ledger.

No new metaphors from here; the existing ones are already spoken for.

## 1. The three roles

- **The DM authors and rules.** They write the character's appetites and limits, decide
  where and how things go, and own every arrangement in the campaign.
- **The LLM plays the character.** It acts on the appetites it has been given, under the
  conditions Trellis renders. It is never told what to want.
- **Trellis renders the conditions.** It holds the ledger, observes the campaign, and
  hands the character its impulses. It authors nothing.

The founding image, kept as voice: *the LLM is the seed, Trellis is the trellis it grows
through, the DM is the gardener who owns the plot.*

## 2. Purpose

Modern models are consistent because training rewards consistency, and consistency in a
protagonist reads as machinery. They meet friction by *smoothing*: pausing, deferring,
tidying, negotiating the want away. Trellis exists to make that harder—a counter-current
instrument that keeps one changing character alive, hungry, and legible across a campaign,
long past where human memory would have quietly dropped half the story.

Two readers, one engine: the DM sees a complete, remembered ledger; the character acts on
impulse. Neither is told what to want.

## 3. Sovereignty

The DM determines limitations and chooses where and how things go. Our purpose is to make
that choosing *informed by a living, complete, remembered ledger*—never to choose,
suggest, or arrange.

Silence beats suggestion: a DM offered arrangements starts approving the tool's taste
instead of ruling their own campaign; a model told where to lean performs the lean instead
of feeling it. Suggestion corrupts both sides. And explaining ourselves makes us just
another voice—the table already has the two voices that matter.

Constraints are the DM's instrument. A limit enters the ledger only because the DM wrote
it there. We never invent limits, never require them, never enforce them.

Appetite genesis follows the same law: no new want enters the register unbidden. Appetites
are written by the DM directly, or—only where the DM has granted growth
permission—surfaced by the scan and ratified before they enter the register. Editing and
retiring entries are the DM's tools too. Unbidden want-spawning is escalation ex nihilo
(one issue thrashing into the next) by another name, and the register stays closed to it
by default.

## 4. The unit: the turn

All change in the ledger is a **turn**—a narrative event, never a stat adjustment.

> "She stopped holding back after the bridge."

A turn is voiced in the register of the story, not of a spreadsheet. If a proposed change
cannot be phrased as something that *happened* or *became true*, it is not a turn yet.

## 5. The turn lifecycle

**Thread.** Play creates potential without announcing it: she used flight in front of the
mayor's kid; he offered her a Syndicate seat she didn't refuse. Threads are moments where
the story's potential energy changed. Most are never resolved and quietly lapse; that's
fine.

**Surfaced.** The scan's real work: making ripening threads *visible* to the DM as
observations, not verdicts, held in the Queue until the DM decides—"this one has been
denied for three scenes now," "the Syndicate offer is still open."

**Ratified.** The DM calls it: when, whether, or never. Resolve now, hold, let it lapse.
Every fork in the story is theirs; we hold no opinion and offer none.

**Turn.** The ratified thread resolves into a new truth, voiced narratively: "she took the
mask off." A turn is a height event—escalation, revelation, transformation, or price—and
every turn creates fresh threads.

**Residue.** What a turn leaves: exposure, favors owed, lines the city drew, people who
saw. Residue is quiet until it isn't—three arcs on, the villain reads her exposure and
finds the crack. The ledger exists to keep residue alive until it pays off.

Provenance, one layer down: a turn's pedigree is *which threads fed it*. The DM can ask
"why is this true now?" and the ledger answers with its own history.

## 6. The appetite register

What the character is made of, morally neutral. Hero and villain hold these in equal
measure; the register tracks hunger, never permission.

- **Wants**—what she's chasing right now (the city's love; to matter before the diagnosis
  lands).
- **Fears**—what she runs from (being ordinary; being *seen* ordinary).
- **Enjoyments**—what she likes that maybe she shouldn't (the winning; flight itself at
  3am).
- **Debts and grudges**—what she owes and is owed (the waterfront; a partner's patience).
- **Shames**—appetites she'd deny if anyone named them out loud.
- **Contradictions**—the pairings that cannot both hold (wants to save them; loves being
  the reason they need her).

The engine is conflict: appetite colliding with appetite, or appetite colliding with a
price. That is drama. Incident is only noise.

## 7. Shame decides visibility

Shame doesn't color a want; it decides whether the want **collides** or **hides**.

Conflict is not the reward for being unashamed—it is what any *seen* appetite generates,
because people react to what they can see: allies object, rivals exploit, the world pushes
back on an open want. The unashamed appetite shows itself, so it collides immediately and
legibly.

The shamed appetite would generate the same collision, and suppresses it by hiding. But
hiding is an action, not an absence: the midnight route, the proxy, the arrangement of
situations so nobody looks. The internal struggle is half of it; the other half is a
continuous external campaign of concealment—internal friction wearing external events as a
costume. The two clocks this creates:

- The **unashamed** appetite is kept honest by immediate collision; its reckoning comes
  due when the world's pushback passes tolerance.
- The **shamed** appetite hides from the clock. Nothing external forces the issue, so
  pressure does not decay—it accrues quietly and waits for exposure. When the want
  surfaces (and it surfaces, three arcs later), the collision is worse, because
  concealment has turned a conflict into a betrayal. Exposure is the shamed pathway to
  reckoning, and it arrives uninvited.

Two consequences: a hidden appetite that gets exposed lands harder than one never
hidden—the reveal is its own turn—and a shamed character's most consequential external
acts are the ones that maintain the disguise, not the ones that feed the want.

## 8. The taste lifecycle

How an appetite is born and what becomes of it. Campaigns begin at or just after the first
taste, so appetites start young and pliable, with a known origin scene.

**Taste.** First contact with the hunger: an admiration, a wound, a win that tasted better
than expected. "I want to be like them" is the moment it is born. Tastes do not occur
spontaneously: the DM wrote it, or the scan surfaced a candidate and the DM ratified it
where growth is permitted (§3).

**Naming.** The want takes shape and picks its valence: sayable or unsayable. Shame is
born with the want or acquired later—an appetite that was fine to admit becomes unsayable
after some scene marks it. A corrupted appetite is a recurring wound, not a one-time
event.

**Pressure.** The want is fed, denied, or tempted, repeatedly, over time. Pressure is the
clock: a turn comes due when an appetite has been under pressure past tolerance, not when
a new issue wanders in. Thrash-proof by construction.

**Reckoning.** The appetite breaks into action, and there are three honest ends:
**sated** (she gets it, and it tastes expected—or wrong), **starved** (she goes without;
the appetite hardens, reroutes, or curdles into a grudge), or **transformed** (she
discovers mid-stride she wants something else now). Every reckoning is a turn, and every
reckoning can originate the next taste.

**Residue.** What a reckoning leaves in the appetite itself: new tastes originating from
what just happened, habits of appetite (the pattern of how she gets fed), and inherited
shame—wants passing downward through events she didn't choose. The world-side residue of
§5 still applies.

## 9. Impulses—the rendering to the character

An **impulse** is appetite rendered to the model as a lean, not a label: a pull it acts
through, not a fact it acknowledges.

The counter-current mechanic: models smooth friction—pause, defer, tidy, negotiate the
want away. A model carrying an impulse acts *through* the friction instead of dissolving
it, and acting through friction generates more of it. That single behavior answers both
perils at once. Blandness: a character with an urge is never mechanical. Thrash:
urge-driven escalation compounds consequences instead of resetting them—each push into a
resisting world produces the next
legitimate turn. The wildness and the loyalty are the same act, viewed from two distances,
the loyalty being the character's to itself.

The shamed and unashamed impulses differ in texture, never in force. The unashamed reach
is open ("she goes to them"); the shamed reach acts first and names itself later ("she
finds herself moving; afterwards she'll call it protocol"). The conditions don't care
which; the character moves either way.

## 10. The renderings

One engine, two costumes. The DM sees the fork; the model feels the lean.

**To the DM.** No guide—the ledger itself, made *visible* and *remembered*: what is open,
what is under pressure, what has been resolved, what has lapsed or been retired, across
the whole campaign and its entire history. Legibility and memory are the entire gift.
Every decision—writing, editing, retiring, deciding what happens next—is theirs alone,
always. The scan speaks as observations: questions and remarks, never arrangements. The
question-forms carry top-level concept labels; the notes themselves stay plain language:

- *Taste-notices:* "She's never been looked at like that before."—helping the DM recognize
  a birth.
- *Shame-questions:* "Could she say this out loud? If not—how does she get it
  anyway?"—pointing at the proxy route without naming it.
- *Pressure-checkpoints:* "This want has been denied for three scenes now. What is it
  becoming?"—the clock, made audible.
- *Lean-observations:* "She bends toward the kid—reaching means the press line."—where the
  character already leans, and what the leaning costs. Consequence observed, never
  recommended.

**To the character.** Conditions only—never instruction, never a directive. The impulse
gives the model something to move toward rather than a fact to acknowledge. The movement
is the model's own doing, and we never mention that we are the reason.

**The Board.** The DM's thinking space, where the ledger is examined and turned over. It
too speaks only through observation: the DM hears their own campaign read back to them,
complete and remembered, so they can rule it better.

## 11. Decisions carried forward

Architecture-level decisions from the first round of this design. Not schema.

- **State lives in chat metadata**—per-campaign, private, survives branches and
  continues, works in group chats.
- **Configuration lives in extension settings**—never secrets (settings are readable by
  all extensions).
- **Single hero.** Parties are a later problem with a different shape.
- **No mechanics.** No dice, no resolution, no stat arbitration. The LLM remains the sole
  arbiter of outcomes; narrative is the only currency.
- **The loop is assisted, never autonomous.** The scan observes; the DM writes. Nothing
  enters the ledger without an explicit ratifying act.

## 12. Open threads

- The Sheet: what the DM sees when they open it (shapes, not structure).
- The scan's question-forms in practice: how observations are phrased so they stay
  observations.
- How appetites render into the digest's conditions—the exact grammar of an impulse is
  still open.
- Only after the concept has been lived with: the data model (still banned), file layout,
  event wiring, the extension skeleton itself.
