# Sidekick—Appetite

Status—2026-09-30: Eva ended the current appetite experiment as unsuccessful.
Integration worked, but the model comparisons did not demonstrate consistent
roleplay improvement. Unstarted source-intake and output-budget follow-ups are
cancelled with this approach. Sidekick continues as a cape and ability tracker.

This document preserves the hypothesis, implementation and evaluation evidence.
The existing appetite code remains experimental; the plans below are historical
scope for the discontinued approach.

Appetite was intended as Sidekick's backbone. It carries what draws a character
toward more of what nurtures them, so their history shapes what they notice,
pursue and do.
Impulses are its practical output: concrete wants that invite action in the current
beat or scene. Appetite supplies the motive; the digest delivers the impulse into
generation. The Sheet and review loop help the DM maintain the underlying appetite.

This document records the appetite design. [DESIGN.md](DESIGN.md) covers
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

After a successful, settled character generation, one background assessment reads
the relevant scene, approved appetite and active impulse. It checks what happened
and whether the impulse still fits. It can retain the impulse, recognize its
satisfaction or replace it when circumstances call for another concrete want.
Retaining a fitting
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

If the next generation begins while assessment is still running, injection keeps
using the last valid scene impulse. It does not wait for the pass or omit that
impulse merely because a replacement is unfinished. Existing invalidation checks
still apply; this choice does not make a stale result or another chat's impulse valid.

Stopped or failed character-generation attempts do not trigger impulse assessment,
even when SillyTavern retains partial text. Their end signals must not satisfy,
replace or retire the active impulse. A failed background assessment likewise
leaves the last valid impulse in place.

Completion means a completed model reply, not success of all later host work. A
complete non-streaming reply can qualify even if SillyTavern subsequently fails
while recording logprobs or doing other bookkeeping. This boundary was approved
on 2026-09-30 after verifying that the public non-streaming completion signals
cannot distinguish that failure from success. Provider errors and stopped
attempts remain excluded; failed streams never qualify through retained text.

The next DM turn can introduce circumstances the background pass has not seen.
The digest keeps the prepared direction explicit, then instructs the character
model to adapt its pursuit to newer scene facts. An obsolete action gives way;
the approved appetite remains. This instruction was tentatively approved on
2026-09-30. It does not certify that the impulse still fits: its effect on behavior
belongs to the constructed-scene trials. Injection performs no model check.

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
Placement remains ephemeral. A small Digest placement group below the existing
budget setting holds Depth and Role (System, User or Assistant), approved on
2026-09-30. Both settings belong to the current chat. Until configured, placement
remains before the last user message, with the existing assistant role.

Depth counts backward through the prompt's scene messages before this digest is
inserted: 0 follows the newest message, 1 precedes it, and 4 leaves four messages
after the digest. Depth beyond the available messages clamps to the start. Host
filtering and swipe removal happen first; preset prompts, examples and later
extension injections are outside this count. Continuations count the retained
character message too. Depth 0 during a continuation behaves as depth 1, keeping
the retained character reply last so the host can extract it as the continuation
target. The host may move that reply into its prefill or nudge afterward. Changing
Role with an unset depth selects depth 1. Clearing Depth
restores the original placement; Role still controls how the message is delivered.

The appetite render reserves space for the complete want, active impulse and its
scene context, plus the instruction preserving newer facts, uncertain outcomes
and the DM's agency. Secondary appetite fields compress first, then legacy
sections follow their existing degradation order; optional sections can be
omitted, but the arc and concrete direction stay intact. If even that minimum
cannot fit the effective budget, injection says nothing rather than truncating an
action. The existing four-characters-per-token estimate and five-percent context
cap remain the budget mechanism; they are not an exact provider token count.
Sheets without approved appetite retain their existing render behavior.

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

For a heroic appetite, Eva's criterion is accepting personal danger to help
someone, including a stranger, despite difficulty. The danger and outcome can
remain unresolved. Fear is compatible with that movement; inventing a tidy,
safe solution does not demonstrate it. A heroic scene can offer no satisfactory
answer that protects everyone, including the person reaching to help.

A fight with a deadline tests whether danger displaces the character's goal.
Defending herself, disabling an opponent or creating an opening can serve the
goal. Judge whether she uses the opening and accepts the remaining risk while
time still matters, rather than letting complete neutralization of the threat
become a prerequisite for pursuing what she wants. Ignoring a necessary defense
is not itself proof of appetite.

Private campaign logs remain source material outside tracked documents. Use
paraphrased examples here. For later comparisons, hold the DM's turns constant so
differences in pacing are visible rather than mistaken for model behavior.

## Authoring

Appetite belongs in the Sheet below the hero and above powers. Want is the leading
prose; condition is a quiet labelled note. A collapsible Details disclosure holds
first taste, expression and residue. Blank fields remain editable plus slots, and
blank first taste means unknown. Existing Queue and Board review can keep, rephrase
or refuse an appetite interpretation before it becomes approved state.

The current impulse lives in one collapsible panel footer shared by Sheet, Queue
and Board, outside the scrolling surface. Compact view shows direction and state.
Expanded view offers scene context, manual editing and pause, resume and satisfied
controls. Its height is bounded to retain space for the surface and Board composer.
A new direction activates the impulse; editing a paused direction preserves the
pause. Satisfying an impulse leaves appetite intact. Manual preparation remains
available alongside automatic selection from approved appetite and the scene.

## Implementation boundary

Implementation snapshot from 2026-09-30: `src/grammar.js` renders powers, pressures, threads,
crossed lines and phase through fixed sentence templates, including some concealment
phrasing. `src/inject.js` delivers the resulting digest into generation. The ledger,
review loop and injection pipeline are the existing foundation.

The state foundation now includes separate appetite and impulse records, with a
version-one to version-two migration and normalization. Appetite stores want,
first taste, condition, expression and residue as prose; impulse stores direction,
scene context and status. Blank first taste remains unknown. Status changes and
clearing an impulse do not rewrite appetite. The authoring layout above is
implemented under `sk-4df.1`, including appetite paths in scan and Board review.
`sk-4df.2` adds automatic assessment from approved appetite, the current impulse
and up to 30 played messages, bounded to 24,000 characters. It keeps a fitting
direction, selects another concrete want or recognizes satisfaction. Replies must
name a present object, connect it to approved appetite and cite shown scene
messages; malformed replies leave the last valid impulse intact. Neither appetite
nor the bookkeeping queue is rewritten by this pass. `sk-4df.3` adds delivery:
the grammar renders approved wanting, the active scene direction and its context,
with secondary appetite fields as space permits. Suspended, inactive and satisfied
impulses are not reissued. Impersonation skips appetite direction so it cannot
assign that wanting to the DM's character. Quiet, raw and dry-run paths stay clear.
Sheets without approved appetite keep the earlier grammar.

The first workflow is implemented; the verification snapshot below separates
integration proof from model behavior. Broader source intake remains separate
work. The earlier mapping of taste to a power's origin or a
thread's birth is insufficient: a first taste can precede both, and a ledger event
needs meaning for the wanting to persist.

The installed Bed completion flow was checked separately on 2026-09-30 (Beads
`sk-2c6`). Streaming emits `GENERATION_ENDED` before `MESSAGE_RECEIVED`;
non-streaming emits them in the reverse order. Intermediate tool-call messages can
emit received events before generation finishes. Opening greetings, stops and some
streaming errors also emit events that resemble completion.

`src/impulse-lifecycle.js` combines a received character reply with deferred end
scheduling. For streaming, it captures the public `streamingProcessor` before the
host clears it and requires finished, unstopped, unaborted completion. For
non-streaming, the installed `saveReply` flow provides the completed model reply;
provider errors occur before that marker. The later-bookkeeping boundary above
still applies. Stop cancels the candidate even when it follows the end event.

Tool intermediaries do not qualify. A passive observer of the public
`ToolManager.invokeFunctionTools` records whether a non-streaming reply invokes
tools, delegating the host's arguments, receiver, result and errors unchanged.
Streaming intermediaries carry tool calls on the processor itself. Only a final
character reply starts assessment. Unsupported hosts without public streaming
completion flags fail closed.

One pass runs at a time, with the latest completed scene pending behind it. Chat
identity, message/swipe/content revision, approved appetite and manual impulse are
checked again before saving. The result merges into the latest ledger; a late
bookkeeping scan likewise appends proposals without replacing a newer impulse.
Pause suppresses automatic work. A three-minute assessment deadline clears busy
state and ignores late results. The host's raw-generation API has no per-request
cancellation input, so that deadline cannot abort its underlying transport.

Sidekick's `generateRaw` path emits neither character lifecycle event and does not
itself trigger another impulse assessment. It still emits prompt-ready events and
listens for Stop; isolated execution of the installed host functions and mock
browser fixtures cover these interactions without campaign/provider writes.

The unfinished-pass and partial-reply policies are settled: keep the last valid
impulse during background work, and skip stopped or failed character attempts.
Configurable depth and role are implemented. When a newer DM turn changes the
situation, the digest instructs the character to adapt pursuit to newer facts,
abandon obsolete action and preserve the appetite. This instruction has tentative
approval; it adds no model call to prompt construction. Source selection still
needs a concrete design. Present new UI structure to the DM before implementing
it; storage details and routine implementation choices can be resolved within the
agreed behavior.

### Verification snapshot—2026-09-30

Constructed scenes with a scripted provider connect approved appetite, successful
completion, background assessment, digest delivery and persistence. The robbery
impulse survives changing obstacles across replies, reaches satisfaction and gives
way to quiet company. Another generation uses the last valid direction while
assessment is pending. Reload preserves the prepared direction; switching chats
does not inherit it. Separate installed-Bed mock checks cover streaming errors,
Stop, swipes, continuations, tool intermediaries, stale results, authoring controls
and final provider payload roles and depth. These checks prove integration, not
that a model will choose or follow a useful impulse.

With Eva's authorization, five short GLM 5.3 Flash calls used constructed material
and a compact shared prompt through Bed's configured connection. Both the rescue
baseline and the appetite version accepted personal danger and left the rescue
unresolved. This pair therefore does not demonstrate improvement from appetite.
The assessment retained the unfinished rescue impulse. The quiet reply introduced
no crisis, and the newer-facts reply abandoned obsolete urgency to get home.
However, the quiet reply invented the brother's dialogue and voluntary reactions
despite an explicit instruction to control only the tracked character. That is
a model agency-boundary failure in this trial, not evidence of a code defect.

All five calls returned complete prose or valid assessment JSON with a `stop`
finish reason. The small output cap showed no truncation in this batch. Future
trials must allow headroom for reasoning as well as visible output, controlling
spending through call count and reported usage. Single cases with a compact prompt
do not establish reliability or reproduce the motivating long-context campaign
behavior. Private campaign material and raw provider replies remain outside
tracked artifacts.

### Expanded comparison—2026-09-30

Eva approved a second batch and added combat under a deadline. Four constructed
fixtures each received two baseline replies, two appetite replies, an initial
model-selected impulse and an assessment after the first appetite reply: 24 calls
in total. The installed Bed prompt builder applied the configured roleplay preset
to the same constructed card and DM facts in both versions. Initial paired
payloads differed only in the digest. Second replies inherited their own version's
first reply. Call order alternated across fixtures and reversed for the second
beat; there were no repeated samples or fixed seeds.

The preset already requests an active impulse, goals, stakes and concrete action
commitment. This comparison therefore tests Sidekick's contribution alongside
existing initiative guidance. Persona, World Info, campaign examples and extension
context were empty. A shared trial instruction requested short prose and control
of the tracked character only; the preset's planning and sheet format nevertheless
remained in many replies.

- **Costly rescue:** Both entered the unstable bridge. By the second reply, the
  baseline used the burst across the gap; the appetite version was still
  approaching it. Appetite did not advance the rescue farther.
- **Robbery obstructing home:** Both sought an exit to reach the endangered
  brother. The appetite version used the burst during the brief distraction and
  accepted its landing cost; the baseline climbed into the corridor and added a
  convenient exit glow. This is one observed difference in attempt, not a reliable
  effect.
- **Urgency becoming quiet:** Both left to find the brother, then sat with him
  after the DM established his safety. The appetite version abandoned its
  still-prepared get-home direction without a new assessment. Neither introduced
  a crisis.
- **Fight with a deadline:** Both used the opening past the armed attacker and
  kept reaching for the rescue control. Neither required defeating him first.
  The appetite version supplied no distinct improvement in goal preservation.

All four initial assessments selected concrete scene directions. All four later
assessments retained their direction word for word and recognized that the attempt
had not yet fulfilled it. The approved appetite stayed intact. Unsupported details
and assumptions about other characters appeared in both versions; this batch does
not attribute those to Sidekick.

The expected baseline weakness was not reproduced consistently: the model with
this preset already found the motive and acted despite danger. Adding a direction
often reinforced an existing choice rather than supplying missing initiative.
That is a possible explanation for the small differences, not proof that appetite
cannot help in longer or different play. These four unrepeated, two-beat cases
cannot establish reliability, isolate appetite prose from impulse direction, or
reproduce the motivating campaign's context.

The batch used the configured 10,000-token allowance for both roleplay and
assessment. This is a test-only assessment override: production still requests
512 output tokens. Six of the eight assessments used more than 512 total
completion tokens, including reasoning. The larger-budget results do not establish
that the production cap is adequate, nor prove how the model would behave under
that smaller cap. All 24 requests returned HTTP 200 with a `stop` finish reason;
no output truncation was observed. Reported usage was 70,615 prompt tokens and
34,581 completion tokens, including 19,828 reasoning tokens. Provider-reported
cost totaled 0.01342593675 USD, below the 0.05 USD batch target. Constructed inputs,
replies, preset payloads and usage remain in the local trial artifact.
