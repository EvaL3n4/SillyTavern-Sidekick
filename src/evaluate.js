/**
 * The evaluation pass: the scan that proposes PendingChanges for the DM to act
 * on, and the one-way valve it lives behind (§3).
 *
 * The valve matters here more than anywhere else. This module reads raw scenes
 * and structured state and never the digest render—the digest is persuasive by
 * construction, and a scan that reads it back gets over-persuaded by our own
 * prose and proposes deltas that merely restate the render.
 */
import { hasState } from './grammar.js';
import { isDigestMessage } from './inject.js';

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
 * §3: the pass, as prompt text.
 *
 * The one-way valve in force. Built from state fields and the scene window,
 * never from renderDigest: our own prose is persuasive by construction, so a
 * prompt quoting the render would over-persuade the scan and cost the only
 * reader positioned to notice a render drifting from the DM's rulings.
 *
 * @param {object|null} state a SidekickState (§6)
 * @param {object[]} scene entries from sceneWindow
 * @returns {{system: string, user: string}}
 */
export function buildPrompt(state, scene) {
    return {
        system: SYSTEM_PROMPT,
        user: [
            '## The ledger',
            '',
            renderState(state),
            '',
            '## The scene',
            '',
            renderScene(scene),
            '',
            '## What to return',
            '',
            'Proposals as JSON. Only what the scene justifies; when nothing',
            'qualifies, return {"proposals": []}.',
        ].join('\n'),
    };
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
function matchesSchema(value, schema) {
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
        Array.isArray(proposal.evidence)
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
 * Runs one evaluation pass. Not implemented yet—the prompt and validation
 * against PROPOSAL_SCHEMA are the next build.
 *
 * @returns {Promise<object[]>} proposals for the review queue
 */
export async function runEvaluation(state) {
    if (!hasState(state)) {
        return [];
    }
    throw new Error('Sidekick: the evaluation scan is not implemented yet');
}
