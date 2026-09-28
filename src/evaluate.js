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
