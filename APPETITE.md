# Sidekick—Appetite

Appetite is Sidekick's backbone. It carries what draws a character toward more of
what nurtures them, so their history shapes what they notice, pursue and do. The
digest delivers that pull into generation. The Sheet and review loop help the DM
maintain it.

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

Render those relationships as leans the model acts through. A character drawn toward
an ideal notices an opening and reaches for it; a concealed appetite shapes the
circumstances in which they allow themselves to reach. The character need not name
either process.

Appetite makes commitment available while leaving the outcome open. The world and
other people retain their own actions. More impulsive prose by itself does not prove
that the appetite is carried; the movement must belong to this character and their
history.

## Editorial control

The DM owns the interpretation of what nurtures the character. The scan may propose
bookkeeping grounded in the character material and played scenes; the DM keeps,
rephrases or refuses it. The Board remains a place for the DM to work out that
interpretation.

An appetite cannot authorize a story proposal or a predetermined outcome. The digest
is a one-way valve: it renders approved state into generation, while the scan reads
the campaign and ledger rather than treating our persuasive rendering as evidence.

## Judging the feature

Judge appetite through movement across scenes. Does the character's established
attraction influence what they notice and reach for? Does nourishment, denial or
concealment change later behavior? Does a reckoning leave residue the next encounter
can inherit?

The motivating comparison is a hero in the making against a civilian organizing an
emergency around personal safety. Both can attempt a rescue. The distinction is how
the character's upbringing, ability and attraction to an ideal become movement, and
what that experience leaves available afterward. The chosen Bed exchange is a bud
for a taste, not proof of an appetite already developed through play.

Private campaign logs remain source material outside tracked documents. Use
paraphrased examples here. For later comparisons, hold the DM's turns constant so
differences in pacing are visible rather than mistaken for model behavior.

## Implementation boundary

As checked on 2026-09-30, `src/grammar.js` renders powers, pressures, threads,
crossed lines and phase through fixed sentence templates, including some concealment
phrasing. `src/inject.js` delivers the resulting digest into generation. The ledger,
review loop and injection pipeline are the existing foundation.

That foundation does not yet carry the account of appetite defined here. The earlier
mapping of taste to a power's origin or a thread's birth is insufficient: a first
taste can precede both, and a ledger event needs meaning for the wanting to persist.

The next implementation decisions are how to represent appetite and its origin,
relate it to existing ledger entries, propose and approve changes, and render its
influence within the digest budget. Those choices remain open. This document settles
the intended behavior before choosing fields, controls or update mechanics.
