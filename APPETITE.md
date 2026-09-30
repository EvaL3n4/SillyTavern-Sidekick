# Sidekick—Appetite

Appetite is Sidekick's backbone. It carries what draws a character toward more of
what nurtures them, so their history shapes what they notice, pursue and do.
Impulses are its practical output: concrete wants that invite action in the current
beat or scene. Appetite supplies the motive; the digest delivers the impulse into
generation. The Sheet and review loop help the DM maintain the underlying appetite.

This document is the design reference for appetite. [DESIGN.md](DESIGN.md) covers
the surrounding product, editorial control and generation pipeline.

## The first taste

> She grew up watching heroes and wished to be their ideal; that was her first taste.

A taste can arrive through watching, admiring and wishing. It can precede direct
experience, a power's manifestation or the first scene of play. The character has
already encountered something that makes a way of being desirable.

Backstory supplies causes for movement. Someone raised by heroes, accomplished in
martial arts and belittled by a powered sibling arrives with an attraction already
forming. When someone falls, their trained body and the ideal they grew up with can
meet in the reach. The leap and unexpected survival may deepen that taste.

An experience becomes a taste through what it means to the character. Acquiring a
power alone does not establish that meaning. A rescue can end as an emergency
survived, or leave a pull toward becoming the person who could make it happen again.
Sidekick must carry the connection between the event and the wanting.

## From taste to appetite

Appetite carries the attraction forward and motivates movement toward more of what
nurtures. Its object may be a way of being, an experience, a relationship or something
the original taste develops into.

An appetite can become hunger or suffer starvation. Encounters can feed it, deny it
or transform it. The character's history matters to what the appetite becomes: the
original attraction and the residue of pursuing it remain part of the next reach.

Taste, hunger and starvation describe the character's relationship to what draws
them. This vocabulary has no settled numeric scale or automatic progression. The
DM's reading of the character governs it.

An explicit goal can name one expression of an appetite. The appetite also shapes
attention, opportunity and readiness to act before the character formulates a goal.
It should remain felt in their behavior when they have no reason to explain it.

## Reading the character

The first manual scan is the intended starting point for a sheet. Relevant material
can live in the character's description, personality or scenario, in played chat,
or in World Info entries about people, places and history outside the card.

The DM selects what enters that reading. World Info intake uses selected entries,
with a visible account of the material and a bounded prompt budget. A lorebook can
exceed 100,000 tokens; selecting it must not silently include the whole book.
The source picker and exact budget still need implementation design.

Missing backstory does not prevent an appetite. Traits and current behavior may
support a pre-existing attraction whose first taste is unknown. Record that
uncertainty rather than inventing an origin or making the character acquire the
appetite in the first played scene. The scan proposes an interpretation for the
DM to keep, rephrase or refuse.

## Shame and expression

The character may be ashamed or unashamed of an appetite. Shame concerns their
relationship to the wanting and how they permit it to appear.

An unashamed character can reach openly. An ashamed character may conceal the
wanting, disguise their reasons, sidestep exposure or arrange an opportunity they
can pretend merely happened. Concealment is itself an action and can carry a cost.
The appetite continues to motivate movement through those choices.

Shame can coexist with hunger, starvation or nourishment. Hiding an appetite does
not establish that it is weak, and declaring it openly does not establish that it is
strong. Its condition and its expression need to remain distinguishable.

## Pressure, reckoning and residue

The existing design's pressure, reckoning and residue remain useful language for
how an appetite develops in play:

- **Pressure** brings the wanting to bear on a situation. Existing appetites give
  the DM something to press, including a want the character keeps concealed.
- **Reckoning** is what happens when the reach meets the world. An encounter can
  nourish, deny or transform the appetite; its outcome belongs to play.
- **Residue** is what the encounter leaves in the character. It changes the meaning
  and conditions of later reaches, including how they regard their own wanting.

These describe relationships across encounters. The sequence, storage and update
rules still need design; the terms alone do not establish an implemented lifecycle.

## Impulses in the current scene

An impulse gives the tracked, AI-driven character something to pursue now. It
connects an appetite to the present circumstances strongly enough to guide action.
It may persist across several responses for a beat or a scene. Its lifetime is
determined by the situation, rather than a one-response expiry or a fixed turn count.

During a bank robbery, someone the character cares about at home may be in danger
for another reason. An actionable impulse is: she needs to get home now, and this
robbery is keeping her here. The attachment supplies the motive; the present danger
and obstruction make it immediate. A vague desire for more of what nourishes her
does not provide that direction.

The character might seek an exit, bargain, deceive, fight or enlist help. The impulse
holds the want steady while the available attempts change. It can direct the next
actions explicitly without prescribing every gesture, deciding success or assigning
the DM's character an action, thought, feeling or response.

Sidekick automatically selects an impulse from approved appetite and the current
scene. Automatic selection is the intended degree of initiative; the DM can override
or suspend it. The underlying appetite can remain stable while its expression
changes from scene to scene. An enduring, generic instruction to pursue that appetite
is insufficient—the impulse needs a present object and a reason to act within the
scene.

An attempt can satisfy an impulse without satisfying the appetite. Reaching for a
chance to act, getting away or making contact does not by itself establish that the
larger hunger has been fed. Assess those meanings separately.

## Satiation and downtime

Impulses also make room for rest, company, enjoyment and remaining where nourishment
is already available. After an ordeal, wanting to stay beside someone a little
longer can be as concrete as wanting to get home during danger.

A satiated character still has appetites. Their present impulse can express enough,
recovery or the wish to preserve what they have. Automatic selection must support
that state rather than manufacturing deprivation, danger or another escalation.

The impulse concerns the one tracked character. It does not select a world event or
a route for the whole story. The surrounding world may move during play, but keeping
it constantly in motion is not the appetite pass's job.

## Preparing impulses between generations

After a settled character generation, one background assessment reads the relevant
scene, approved appetite and active impulse. It checks what happened and whether the
impulse still fits. It can retain the impulse, recognize its satisfaction or replace
it when the circumstances call for another concrete want. Retaining a fitting
impulse across replies is valid; changing it on every reply is not a requirement.

This assessment runs off the prompt path. Injection reads the prepared state; it
does not call a model to check the scene or choose an impulse before generating the
character's response. Initial manual setup must provide a way to prepare the first
impulse without adding that wait to injection.

The impulse assessment and the existing ledger scan have different responsibilities.
The former maintains actionable direction after generation. The latter proposes
bookkeeping for DM review on its own cadence. A lasting reinterpretation of appetite
still belongs to editorial review; automatically selecting an impulse does not
silently approve that reinterpretation.

Background work must refer to the chat and message version it actually read. A chat
switch, selected swipe, deletion or newer generation can invalidate that reading.
Recheck before storing a result, and coalesce pending work toward the latest scene
instead of dropping every request that arrives during an active pass. Old results
must not overwrite an impulse prepared from newer material.

The next DM turn can introduce circumstances the background pass has not seen. An
unfinished pass also leaves injection without a fresh result. The freshness policy
for these cases remains open; moving another model check onto the prompt path would
contradict the agreed timing.

## What the digest must do

The digest must make approved character material exert a pull from the first scene.
Later experience can deepen, frustrate or transform that pull. Backstory and events
need to influence the character's attention and choices, beyond being recalled as
facts.

The grammar should carry:

- What first made the wanting desirable.
- What the appetite has become and how it is being nourished or denied.
- How the character permits themselves to pursue it, including concealment.
- What earlier reaches have left behind.
- The concrete impulse that this appetite supports in the present beat or scene.

Render enough of those relationships to make the impulse intelligible, and state its
direction explicitly. A character drawn toward an ideal has a particular opening to
reach for; a concealed appetite shapes how they pursue it. The character need not
explain that motive in dialogue, but the instruction to the model must be usable.

The DM configures injection depth and message role to suit their preset. A system
message at depth 4 and a user message at depth 1 are both intended use cases.
Placement must remain ephemeral and respect the digest budget. Configuration
controls, depth semantics and budget allocation still need implementation design.

Appetite makes commitment available while leaving the outcome open. The world and
other people retain their own actions. More impulsive prose by itself does not prove
that the appetite is carried; the movement must belong to this character and their
history.

## Editorial control

The DM owns the interpretation of what nurtures the character. The scan may propose
bookkeeping grounded in the character material and played scenes; the DM keeps,
rephrases or refuses it. The Board remains a place for the DM to work out that
interpretation.

The ledger scan proposes state changes, not story routes. The impulse pass supplies
the tracked character's immediate wanting and direction from approved appetite;
automatic selection does not predetermine outcomes or choose other characters'
responses. These are separate responsibilities, even if they share generation tools.

The digest is a one-way valve: it renders approved character state and the prepared
impulse into generation. Assessment reads the actual campaign, underlying state and
active impulse, rather than treating persuasive digest prose as evidence that an
appetite was nourished or an action occurred.

## Judging the feature

Judge appetite through movement across scenes. Does the character's established
attraction influence what they notice and reach for? Does nourishment, denial or
concealment change later behavior? Does a reckoning leave residue the next encounter
can inherit?

Judge an impulse through its relevance and actionability. In the robbery example,
the character should have a concrete reason to seek a way home, retain that want
across replies while the situation supports it, and adapt their attempts to the
obstacles. The instruction must leave both outcomes and the DM's character free.
A quiet scene must be able to support a concrete satiated impulse without adding a
new crisis.

The motivating comparison is a hero in the making against a civilian organizing an
emergency around personal safety. Both can attempt a rescue. The distinction is how
the character's upbringing, ability and attraction to an ideal become movement, and
what that experience leaves available afterward. The chosen Bed exchange is a bud
for a taste, not proof of an appetite already developed through play.

Private campaign logs remain source material outside tracked documents. Use
paraphrased examples here. For later comparisons, hold the DM's turns constant so
differences in pacing are visible rather than mistaken for model behavior.

## Implementation boundary

Implementation snapshot from 2026-09-30: `src/grammar.js` renders powers, pressures, threads,
crossed lines and phase through fixed sentence templates, including some concealment
phrasing. `src/inject.js` delivers the resulting digest into generation. The ledger,
review loop and injection pipeline are the existing foundation.

That foundation does not yet carry the account of appetite defined here. The earlier
mapping of taste to a power's origin or a thread's birth is insufficient: a first
taste can precede both, and a ledger event needs meaning for the wanting to persist.

The installed Bed completion flow was checked separately on 2026-09-30 (Beads
`sk-2c6`). Streaming emits `GENERATION_ENDED` before `MESSAGE_RECEIVED`;
non-streaming emits them in the reverse order. Intermediate tool-call messages can
emit received events before generation finishes. Opening greetings, stops and some
streaming errors also emit events that resemble completion.

`GENERATION_ENDED` marks the Stop button being hidden, not a guarantee of successful
generation. Combine a received-message marker with deferred end scheduling and
validate the retained message. Sidekick's `generateRaw` path emits neither character
lifecycle event, so that path does not itself trigger another impulse assessment.
It still emits prompt-ready events and listens for Stop; the actual scheduler needs
regression coverage for those interactions.

The first implementation slice should connect an approved appetite, scene-relevant
automatic impulse selection, background maintenance and configurable digest
injection. Prove that path with constructed scenes and a mock provider before
expanding source intake. This describes planned work, not an implemented feature.

Remaining decisions concern retained partial replies after Stop or failure, and
what injection does when background work is unfinished or the scene changes before
its result can be used. Representation, migration, authoring controls and source
selection also need concrete designs. Present new UI structure to the DM before
implementing it; storage details and routine implementation choices can be resolved
within the agreed behavior.
