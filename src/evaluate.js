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
 * The exclusion is defensive, not load-bearing. src/inject.js splices the
 * digest into `coreChat`--the fresh array SillyTavern hands to
 * generation--never into the persisted chat, so no digest reaches this
 * function in normal flow. Keep it anyway: the one-way valve is a property
 * every read enforces, not one the call path is trusted to preserve.
 *
 * @param {object[]} chat the chat array as SillyTavern holds it
 * @param {object} [options]
 * @param {number} [options.limit] window size, defaults to SCENE_WINDOW
 * @returns {object[]} the messages the scan may read
 */
export function sceneWindow(chat, { limit = SCENE_WINDOW } = {}) {
    if (!Array.isArray(chat)) {
        return [];
    }

    // a nonsense limit falls back to the default rather than reading nothing
    const size = Number.isInteger(limit) && limit > 0 ? limit : SCENE_WINDOW;
    const readable = chat.filter((message) => !isDigestMessage(message));
    return readable.slice(Math.max(0, readable.length - size));
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
