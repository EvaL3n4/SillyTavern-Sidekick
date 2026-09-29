/**
 * The evaluation pass: the scan that proposes PendingChanges for the DM to act
 * on, and the one-way valve it lives behind (§3).
 *
 * The valve matters here more than anywhere else. This module reads raw scenes
 * and structured state and never the digest render—the digest is persuasive by
 * construction, and a scan that reads it back gets over-persuaded by our own
 * prose and proposes deltas that merely restate the render.
 */
import { isDigestMessage } from './inject.js';
import { fingerprintCitations } from './citations.js';
import { estimateTokens, hasState } from './grammar.js';

/** §3: fixed, configurable cadence. Matches LocalSettings.evaluationCadence. */
export const DEFAULT_CADENCE = 15;

/**
 * @param {number} messagesSince evaluation, inclusive
 * @param {number} [cadence]
 * @returns {boolean}
 */
export function shouldEvaluate(messagesSince, cadence = DEFAULT_CADENCE) {
    return Number.isFinite(messagesSince) && messagesSince > 0 && messagesSince % cadence === 0;
}

/**
 * §3: roughly a scene's worth of messages, as a constant rather than a
 * LocalSettings field. §6's LocalSettings carries only evaluationCadence and
 * digestBudgetTokens, so a third setting is a §6 change and needs its own
 * justification.
 */
export const SCENE_WINDOW = 30;

/**
 * §3: the raw material the scan reads. The trailing `limit` messages of the
 * chat, with our own digest render excluded.
 *
 * Each entry carries `index`, its position in the whole chat. §6's
 * PendingChange.evidence is a list of chat message indices and the review queue
 * jumps to them, so a window-relative position would send the DM to the wrong
 * message. The slice keeps the original indices rather than renumbering.
 *
 * The exclusion is defensive, not load-bearing. src/inject.js splices the
 * digest into `coreChat`--the fresh array SillyTavern hands to
 * generation--never into the persisted chat, so no digest reaches this
 * function in normal flow. Keep it anyway: the one-way valve is a property
 * every read enforces, not one the call path is trusted to preserve.
 *
 * @param {object[]} chat the chat array as SillyTavern holds it
 * @param {object} [options]
 * @param {number} [options.limit] window size, defaults to SCENE_WINDOW
 * @returns {object[]} {index, message} entries
 */
export function sceneWindow(chat, { limit = SCENE_WINDOW } = {}) {
    if (!Array.isArray(chat)) {
        return [];
    }

    // a nonsense limit falls back to the default rather than reading nothing
    const size = Number.isInteger(limit) && limit > 0 ? limit : SCENE_WINDOW;
    const readable = chat
        .map((message, index) => ({ index, message }))
        .filter((entry) => !isDigestMessage(entry.message));
    return readable.slice(Math.max(0, readable.length - size));
}

/**
 * §3: what the scan may propose, and what it may never propose. The schema
 * enforces the second half structurally--there is no field for what happens
 * next--so this has to aim the first half, or the model spends its budget
 * re-describing the scene instead of reading the ledger.
 *
 * §4's no-meta-awareness rule governs the *render*, not this prompt: the
 * scan's audience is the model, and naming the ledger is the point.
 */
const SYSTEM_PROMPT = [
    'You are the bookkeeping scan for a tabletop campaign ledger.',
    '',
    'You read a scene and the ledger it belongs to, and you propose state',
    'changes only.',
    '',
    'You may propose:',
    '- entries to write: a power, a thread, a pressure, or a line crossed',
    '- threads to surface: one that has gone quiet, or one coming due',
    '- pressures coming due: tolerance spent, denials accumulating',
    '- phrasing for a turn the DM should record',
    '',
    'You never propose:',
    '- story outcomes',
    '- campaign direction',
    '- opinions about what should happen next',
    '- anything the scene did not justify',
    '',
    'Cite the chat message indices that justify each proposal. If nothing in the',
    'scene justifies a change, propose nothing.',
].join('\n');

/**
 * @param {object|null} state a SidekickState (§6)
 * @returns {string}
 */
function renderState(state) {
    if (!state) {
        return '(no ledger yet)';
    }

    // Structured state only. `rulings` is the documented seam for §8's "drafts in
    // the DM's idiom" work and is omitted rather than half-designed here; so are
    // queue, history and version, which describe the ledger's paperwork rather
    // than the ledger itself.
    const seen = {
        cosmology: state.cosmology,
        hero: state.hero,
        powers: state.powers,
        arc: state.arc,
    };
    return JSON.stringify(seen, null, 2);
}

/**
 * @param {object[]} scene entries from sceneWindow
 * @returns {string}
 */
function renderScene(scene) {
    if (!Array.isArray(scene) || scene.length === 0) {
        return '(no scene yet)';
    }

    return scene
        .map(({ index, message }) => `[${index}] ${message?.name ?? 'unknown'}: ${message?.mes ?? ''}`)
        .join('\n');
}

/**
 * §3: the assembled prompt runs under this many tokens.
 *
 * A constant, not a third LocalSettings field: §6 carries only
 * evaluationCadence and digestBudgetTokens, so a new setting is a §6
 * change. The digest budget is not reused either—§5's governs the render,
 * and coupling the two would make one knob move two unrelated things.
 *
 * The estimate is grammar.js's (1 token ≈ 4 chars): crude but monotonic,
 * and already trusted by the digest's own budget loop.
 */
export const SCENE_PROMPT_BUDGET = 4000;

/**
 * §3: the pass, as prompt text.
 *
 * The one-way valve in force. Built from state fields and the scene window,
 * never from renderDigest: our own prose is persuasive by construction, so a
 * prompt quoting the render would over-persuade the scan and cost the only
 * reader positioned to notice a render drifting from the DM's rulings.
 *
 * §3's scene window bounds the prompt by message count; the budget bounds it
 * by size, because a window of long IC posts overruns on its own. Trimming
 * is oldest-first and never past the last entry—an empty scene reads as
 * '(no scene yet)' and the pass is worthless without one. The ledger half is
 * never trimmed: it is what the scan reads, and a ledger that alone exceeds
 * the budget errors the call exactly as it did before.
 *
 * @param {object|null} state a SidekickState (§6)
 * @param {object[]} scene entries from sceneWindow
 * @param {object} [options]
 * @param {number} [options.budget] token cap, defaults to SCENE_PROMPT_BUDGET
 * @returns {{system: string, user: string}}
 */
export function buildPrompt(state, scene, { budget = SCENE_PROMPT_BUDGET } = {}) {
    const entries = Array.isArray(scene) ? scene : [];
    const ledger = renderState(state);
    const userFor = (window) => [
        '## The ledger',
        '',
        ledger,
        '',
        '## The scene',
        '',
        renderScene(window),
        '',
        '## What to return',
        '',
        'Proposals as JSON. Only what the scene justifies; when nothing',
        'qualifies, return {"proposals": []}.',
    ].join('\n');

    const systemTokens = estimateTokens(SYSTEM_PROMPT);
    let kept = entries;
    while (kept.length > 1 && systemTokens + estimateTokens(userFor(kept)) > budget) {
        kept = kept.slice(1);
    }

    return { system: SYSTEM_PROMPT, user: userFor(kept) };
}

/**
 * The scan's output schema (§6 PendingChange). The hard non-goal is enforced
 * here, not in a prompt: there is no field for what happens next, so the model
 * has nowhere to put a story proposal.
 */
export const PROPOSAL_SCHEMA = {
    name: 'SidekickProposal',
    description: 'State bookkeeping proposals. Never story outcomes.',
    strict: true,
    value: {
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
            proposals: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        summary: { type: 'string' },
                        changes: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    path: { type: 'string' },
                                    from: { type: 'string' },
                                    to: { type: 'string' },
                                },
                                required: ['path', 'to'],
                            },
                        },
                        evidence: { type: 'array', items: { type: 'integer' } },
                    },
                    required: ['summary', 'changes'],
                },
            },
        },
        required: ['proposals'],
    },
};

/**
 * §3: output is validated on receipt, and a non-conforming pass is a silent
 * no-op.
 *
 * The gate reads PROPOSAL_SCHEMA rather than restating it, so the schema that
 * constrains generation is also the schema that gates receipt. Adding a field to
 * PROPOSAL_SCHEMA tightens this with it instead of quietly drifting from it.
 *
 * Only the draft-04 keywords PROPOSAL_SCHEMA actually uses are implemented:
 * type, properties, required, items. Anything unsupported (a $ref, say) reads as
 * a mismatch, because refusing a proposal is recoverable and half-checking one
 * is not.
 *
 * Silence means silence. A rejection returns [] and logs nothing, so a flaky
 * backend does not fill the console mid-session. There is no prose to detect
 * either: a failed pass arrives as the string '{}' from extractJsonFromData.
 *
 * Path validity is deliberately not this validator's job. applyProposal owns the
 * provenance gate and is the only thing positioned to call a path stale; a path
 * check here would reject proposals the DM could still resolve by hand.
 */
function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Walks one node of a schema. True means conforming.
 * @param {*} value the model's data at this node
 * @param {object} schema a schema node in the supported draft-04 subset
 * @returns {boolean}
 */
// Exported so the gate's edge cases can be tested directly: the same keywords
// that make it strict are the ones a schema upgrade would use to weaken it.
export function matchesSchema(value, schema) {
    if (!isObject(schema)) {
        return true; // nothing declared at this node, nothing to enforce
    }

    if (schema.$ref !== undefined || schema.anyOf !== undefined || schema.oneOf !== undefined) {
        return false; // unsupported keyword; reject rather than half-check
    }

    const declared = schema.type;
    if (declared !== undefined) {
        const actual = Array.isArray(value) ? 'array'
            : value === null ? 'null'
                : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number')
                    : typeof value;
        if (actual !== declared) {
            return false;
        }
    }

    if (declared === 'object') {
        for (const key of schema.required ?? []) {
            if (!Object.hasOwn(value, key)) {
                return false;
            }
        }
        for (const [key, child] of Object.entries(schema.properties ?? {})) {
            if (Object.hasOwn(value, key) && !matchesSchema(value[key], child)) {
                return false;
            }
        }
    }

    if (declared === 'array') {
        const items = schema.items;
        if (isObject(items) && !value.every((item) => matchesSchema(item, items))) {
            return false;
        }
    }

    return true;
}

/**
 * Rules PROPOSAL_SCHEMA cannot express, each of which makes a proposal unusable
 * rather than merely unexpected. An empty summary or an empty changes array is
 * schema-conforming and still nothing the DM can act on, and evidence is what
 * the review queue jumps on, so a proposal without it cites nothing. The
 * integer-ness of each evidence index is PROPOSAL_SCHEMA's job, not a second
 * copy of it here.
 *
 * @param {object} proposal already known to conform to PROPOSAL_SCHEMA
 * @returns {boolean}
 */
function isActionable(proposal) {
    return (
        typeof proposal.summary === 'string' &&
        proposal.summary.trim().length > 0 &&
        proposal.changes.length > 0 &&
        Array.isArray(proposal.evidence) && proposal.evidence.length > 0
    );
}

/**
 * @param {*} response whatever runGeneration parsed out of the pass
 * @returns {object[]} the well-formed proposals, or [] for anything else
 */
export function validateProposals(response) {
    if (!matchesSchema(response, PROPOSAL_SCHEMA.value)) {
        return [];
    }

    // The schema walk already enforced every item through .items, so a proposal
    // array holding one malformed entry never reaches here--it is rejected one line
    // above. The same governs the rules the schema cannot express: one unusable
    // proposal voids the pass rather than being quietly dropped.
    //
    // §3 calls this a silent no-op, and that is the stricter reading by design.
    // A pass is one generation, so partial output is that generation's judgement
    // being unreliable, not half of a verdict worth keeping.
    return response.proposals.every(isActionable) ? response.proposals : [];
}

const ID_PREFIX = 'pc';
const ID_SLUG_LIMIT = 40;

/**
 * A summary becomes a url-safe slug: lowercase, every run of non-alphanumerics
 * collapsed to one hyphen, no leading or trailing hyphen.
 */
function slugify(summary) {
    return String(summary ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, ID_SLUG_LIMIT)
        .replace(/-+$/g, '');
}

/**
 * A module counter for a caller that does not know its queue's position, which is
 * how tests and one-off callers arrive. Monotonic, so two proposals from the
 * same pass still get distinct ids.
 *
 * It resets on reload, so a caller that persists the queue injects the counter
 * instead. `queue.length` is the wrong counter to pass: dismissing an entry
 * shifts every later id onto one already used, and §3's ruling log would then
 * cite a change that is no longer the one it ruled on.
 */
let fallbackCounter = 0;

/**
 * §6: a PendingChange is what the DM acts on, and this is where a validated
 * proposal becomes one.
 *
 * PROPOSAL_SCHEMA describes only summary, changes and evidence. Everything
 * else on §6's shape—id, origin, status, createdAt—is ours to supply, and
 * supplying it here rather than at the call site keeps the queue's shape in one
 * place.
 *
 * `from` is the seam worth naming. The schema marks it optional because a
 * proposal that inserts into an empty list has nothing to cite, while §6 declares
 * it required. Resolving it needs the ledger and this function never sees it, so
 * an absent `from` records ''—the same call applyProposal makes, for the same
 * reason: every entry then carries a string, and a change the DM never gated
 * cannot read as free.
 *
 * @param {object} proposal a proposal that passed validateProposals
 * @param {object} meta
 * @param {number} [meta.counter] the queue's position counter
 * @param {number} [meta.now] createdAt, injectable so tests stay deterministic
 * @returns {object} a §6 PendingChange, plain data with no reference into the
 * proposal it came from
 */
export function toPendingChange(proposal, meta = {}) {
    const counter = meta.counter ?? fallbackCounter++;

    return {
        id: `${ID_PREFIX}-${slugify(proposal.summary) || 'proposal'}-${counter}`,
        origin: 'evaluation',
        summary: proposal.summary,
        // changes and evidence are what PROPOSAL_SCHEMA requires and what
        // isActionable then checks for content, so this is the one place in the
        // module that does not need to re-guard them. The arrays are copied
        // rather than aliased: the queue is persisted, and an entry that shares
        // a reference with the response it came from changes when the response
        // does.
        changes: proposal.changes.map((change) => ({
            path: change.path,
            from: change.from ?? '',
            to: change.to,
        })),
        evidence: [...proposal.evidence],
        status: 'pending',
        createdAt: meta.now ?? Date.now(),
    };
}
/**
 * §3: one quiet pass. One API call, nothing written, nothing rendered.
 *
 * `generateRaw`, not `generateQuietPrompt`. Both take jsonSchema and both
 * return the extracted JSON, so the choice falls on the prompt: buildPrompt
 * returns a {system, user} pair, and only generateRaw takes `systemPrompt`
 * beside `prompt`--createRawPrompt prepends it as a real system message. The
 * quiet path has no systemPrompt at all and would pound both halves into one
 * instruction, then runs reasoning-string post-processing over JSON.
 *
 * It hangs off the global: SillyTavern.getContext().generateRaw. The docs warn
 * that importing from ST's modules is unreliable and that getContext is the stable
 * API, so nothing here reaches into script.js--index.js resolves it from getContext
 * and passes it in, which also keeps this module DOM-free and importable under
 * node --test.
 *
 * Quiet by construction, not by a flag: generateRawData hardcodes
 * sendOpenAIRequest('quiet', ...), which also switches streaming off.
 *
 * The one-way valve again. The prompt arrives as text buildPrompt built from
 * state fields and the scene window; nothing here reads the render, and a quiet
 * pass is an API call that returns a string, so nothing here writes to the
 * campaign chat either.
 *
 * @param {{system: string, user: string}} prompt from buildPrompt
 * @param {object} schema a SillyTavern JsonSchema: name, value, strict
 * @param {object} options
 * @param {Function} options.generate generateRaw, or an equivalent for tests
 * @returns {Promise<object>} the parsed response, shape unvalidated
 * @throws {Error} when no generator is injected, or the pass fails
 */
export async function runGeneration(prompt, schema, { generate } = {}) {
    if (typeof generate !== 'function') {
        throw new Error('Sidekick: runGeneration needs a generation function');
    }

    const response = await generate({
        prompt: prompt.user,
        systemPrompt: prompt.system,
        jsonSchema: schema,
    });

    // generateRaw hands back `JSON.stringify(...)` when jsonSchema is set. It is
    // a string even on success, so it has to be decoded before anyone can read
    // a proposal out of it.
    if (typeof response !== 'string') {
        throw new Error(`Sidekick: expected a JSON string from the scan, got ${typeof response}`);
    }

    // Parsing is decoding the transport, not judging the content. What the
    // model actually proposed is sk-gu5.4's job.
    try {
        return JSON.parse(response);
    } catch {
        throw new Error('Sidekick: the scan returned something that is not JSON');
    }
}

/**
 * The queue's next id counter, read off the entries already in it.
 *
 * §6's ids outlive the queue's length: dismissing an entry shifts every later
 * id onto one already used, so `queue.length` cannot be the counter, and the
 * module counter resets on a page reload while the queue does not. The counter
 * rides the id we already persist, so keeping it safe costs nothing new in the
 * ledger. An unparseable id (a hand-edited chatMetadata) counts as nothing and
 * loses to the highest real one.
 *
 * @param {object[]} queue the ledger's current queue (§6 PendingChange[])
 * @returns {number} the next counter, starting again at 0 for an empty queue
 */
function nextQueueCounter(queue) {
    const highest = queue.reduce((highest, entry) => {
        const counter = Number.parseInt(String(entry?.id ?? '').split('-').at(-1), 10);
        return Number.isInteger(counter) && counter > highest ? counter : highest;
    }, -1);
    return highest + 1;
}

/**
 * §3: one pass, end to end—scene window, prompt, generation, validation,
 * assembly. The chain this module is made of, composed where the DM's trigger
 * lands.
 *
 * §3's silence rule is the operative one. A pass that fails—a rejected
 * generation, an unparseable response, a non-conforming one—yields nothing
 * and logs nothing, because a backend that hiccups mid-session should not fill
 * the console. That covers everything that can go wrong *in a pass*. What
 * cannot happen in a pass—a missing generator, a bug in our own chain—
 * throws, so it cannot pass for a quiet failure; the caller logs it once.
 *
 * Persistence stays the caller's. This appends to the queue on the state it is
 * handed and returns what it appended, because §6's chatMetadata read and write
 * are index.js's (bindState), and a module that writes metadata cannot be
 * tested under node --test.
 *
 * @param {object|null} state a SidekickState (§6)
 * @param {object} deps
 * @param {object[]} [deps.chat] the chat as SillyTavern holds it
 * @param {Function} [deps.generate] generateRaw, resolved in index.js
 * @returns {Promise<object[]>} the PendingChange entries appended to
 * state.queue, or [] when the pass yielded nothing (§3's silent no-op)
 * @throws {Error} when the caller wired the pass without a generator
 */
export async function runEvaluation(state, { chat = [], generate } = {}) {
    if (!hasState(state)) {
        return [];
    }

    if (typeof generate !== 'function') {
        throw new Error('Sidekick: runEvaluation needs a generation function');
    }

    // The one-way valve in force: the prompt is built from state fields and the
    // scene window, never from the render. The window is computed once and kept:
    // the scene the model saw is the only place a citation may point.
    const scene = sceneWindow(chat);
    const prompt = buildPrompt(state, scene);

    let response;
    try {
        response = await runGeneration(prompt, PROPOSAL_SCHEMA, { generate });
    } catch {
        // A failed pass is a scan that yielded nothing: the backend refused,
        // the request aborted, or what came back could not be read as a
        // proposal. §3 makes that a silent no-op—see validateProposals for
        // why silence is the strict reading.
        return [];
    }

    const proposals = validateProposals(response);
    if (proposals.length === 0) {
        return [];
    }

    // A citation the window does not hold cites a scene the model never saw, so
    // the pass is void exactly as a non-conforming response is: one pass is one
    // generation, and part of it hallucinating is that generation being
    // unreliable. §3's silence holds; the DM is not told, and will never know.
    const shown = new Set(scene.map((entry) => entry.index));
    if (proposals.some((proposal) => proposal.evidence.some((index) => !shown.has(index)))) {
        return [];
    }
    let counter = nextQueueCounter(state.queue);
    // The fingerprint is attached here, where the chat is in hand: the model
    // cites plain indices (PROPOSAL_SCHEMA says integers), and (index,
    // send_date) is the locator that survives a deletion or a re-roll.
    // toPendingChange stays proposal-shaped; the evidence handed to it is
    // already located.
    const queued = proposals.map((proposal) => toPendingChange(
        { ...proposal, evidence: fingerprintCitations(chat, proposal.evidence) },
        { counter: counter++ },
    ));
    state.queue.push(...queued);
    return queued;
}

let inFlight = null;

/**
 * Starts a pass unless one is already running.
 *
 * §7 explains why a quiet pass cannot use GENERATION_ENDED as its overlap guard:
 * that event is emitted from hideStopButton (script.js:3510), inside
 * interactive generations only, while this scan's pass is generateRaw's quiet
 * call, which emits nothing when it ends. A listener would then be released
 * by the DM's next reply rather than by the pass it guards.
 *
 * So the guard is the pass itself. A trigger arriving while one is in flight is
 * dropped—§3's cadence is a tick, not a queue of scans, and the next tick costs
 * nothing the ledger lacks. The slot frees when the in-flight promise settles,
 * the only completion signal the quiet path has.
 *
 * @param {object|null} state a SidekickState (§6)
 * @param {object} deps as runEvaluation's
 * @returns {Promise<object[]>|null} the queued entries, null when dropped
 */
export function startEvaluation(state, deps) {
    if (inFlight) {
        return null;
    }

    inFlight = runEvaluation(state, deps).finally(() => {
        inFlight = null;
    });
    return inFlight;
}
