import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DEFAULT_DIGEST_BUDGET,
    effectiveBudget,
    estimateTokens,
    hasState,
    renderDigest,
    shouldSkip,
} from '../src/grammar.js';
import { DEFAULT_CADENCE, PROPOSAL_SCHEMA, shouldEvaluate } from '../src/evaluate.js';
import { createState } from '../src/state.js';

/**
 * The §5 worked ledger, reduced to shape: the spark, its limits and costs, one
 * thread, one hidden pressure, one line crossed, and an arc phase.
 */
function hailey() {
    return createState({
        hero: { name: 'Hailey', codename: '', statusQuo: '' },
        powers: [{
            id: 'the-spark',
            name: 'the Spark',
            capability: 'a blue-black force that wraps what she protects',
            limits: ['no control', 'unfocused it takes everything from the waist down', 'it answers before she asks'],
            costs: ['cracked asphalt', 'witnesses'],
            history: [],
        }],
        arc: {
            phase: 'the first week of having something',
            threads: [{ id: 't1', text: 'what fired the projectile', bornAt: 1, lastTouched: 1 }],
            pressures: [{ text: 'her family must not learn', since: 1, denialCount: 0, hidden: true }],
            linesCrossed: [{
                line: 'public breakage',
                provides: 'a stranger saw her do it',
                cost: 'a witness',
                msgId: 3,
            }],
        },
    });
}

describe('estimateTokens', () => {
    it('grows with length and rounds up', () => {
        assert.ok(estimateTokens('a'.repeat(400)) > estimateTokens('a'.repeat(40)));
        assert.equal(estimateTokens('a'.repeat(4)), 1);
        assert.equal(estimateTokens('a'.repeat(5)), 2);
    });
});

describe('effectiveBudget', () => {
    it('uses the configured budget when there is no context size', () => {
        assert.equal(effectiveBudget({ settings: { digestBudgetTokens: 200 } }), 200);
        assert.equal(effectiveBudget({}), DEFAULT_DIGEST_BUDGET);
    });

    it('caps by context size so a small prompt never loses the deck', () => {
        // 5% of 1000 is 50, which is under the configured 200
        assert.equal(effectiveBudget({ settings: { digestBudgetTokens: 200 }, contextSize: 1000 }), 50);
    });

    it('keeps the configured budget when the context is roomy', () => {
        assert.equal(effectiveBudget({ settings: { digestBudgetTokens: 200 }, contextSize: 40000 }), 200);
    });

    it('never returns a zero or negative budget', () => {
        assert.ok(effectiveBudget({ contextSize: 3 }) >= 1);
        assert.ok(effectiveBudget({ contextSize: -10 }) >= 1);
    });

    it('lets an explicit budget win', () => {
        assert.equal(effectiveBudget({ budget: 12, contextSize: 1000 }), 12);
    });
});

describe('renderDigest', () => {
    it('renders the capability with its limits and costs intact', () => {
        const { text, tokens } = renderDigest(hailey());

        assert.match(text, /a blue-black force that wraps what she protects/);
        assert.match(text, /no control/);
        assert.match(text, /unfocused it takes everything from the waist down/);
        assert.match(text, /cracked asphalt/);
        assert.ok(tokens > 0);
    });

    it('renders shame as concealment rather than as an admission', () => {
        const { text } = renderDigest(hailey());

        assert.match(text, /keeps her family must not learn out of the open/);
        assert.match(text, /the keeping costs her/);
    });

    it('renders residue as what the line provided and what it cost', () => {
        const { text } = renderDigest(hailey());
        assert.match(text, /public breakage/);
        assert.match(text, /a witness/);
    });

    it('compresses limits and costs before it touches the arc', () => {
        const result = renderDigest(hailey(), { budget: 40 });

        assert.ok(result.degraded.includes('capability'));
        assert.ok(result.degraded.indexOf('capability') < result.degraded.indexOf('arc'));
    });

    it('never drops the arc, even at an absurd budget', () => {
        const result = renderDigest(hailey(), { budget: 1 });

        assert.match(result.text, /the first week of having something/);

        // it compresses, but only last: everything above it goes first
        const arc = result.degraded.indexOf('arc');
        assert.ok(arc >= 0, 'the arc compresses rather than being dropped outright');
        for (const name of ['capability', 'concealment', 'threads', 'residue']) {
            assert.ok(result.degraded.indexOf(name) <= arc, `${name} compresses before the arc`);
        }
    });

    it('says nothing about itself', () => {
        // §4 rule 6: no meta-awareness. The render never acknowledges the
        // ledger it came from or the tool doing the rendering.
        const { text } = renderDigest(hailey(), { budget: 1 });
        const lowered = text.toLowerCase();

        for (const word of ['digest', 'state', 'ledger', 'sidekick', 'prompt', 'character', 'model']) {
            assert.ok(!lowered.includes(word), `render mentioned "${word}"`);
        }
    });

    it('stops short of resolving anything', () => {
        // §4 rule 4: it ends before the outcome, never at it.
        const { text } = renderDigest(hailey());
        const lowered = text.toLowerCase();

        for (const word of ['catches', 'saves', 'she manages to', 'successfully']) {
            assert.ok(!lowered.includes(word), `render pre-resolved with "${word}"`);
        }
    });

    it('renders nothing from an empty state', () => {
        assert.equal(renderDigest(createState()).text, '');
    });
});

describe('shouldSkip', () => {
    it('skips quiet generations even with a full ledger', () => {
        assert.equal(shouldSkip({ type: 'quiet', state: hailey() }), true);
    });

    it('skips sessions that have no state yet', () => {
        assert.equal(shouldSkip({ type: 'normal', state: createState() }), true);
        assert.equal(shouldSkip({ type: 'normal', state: null }), true);
    });

    it('does not skip a real generation with a ledger', () => {
        assert.equal(shouldSkip({ type: 'regenerate', state: hailey() }), false);
    });
});

describe('hasState', () => {
    it('is false for an empty default state', () => {
        assert.equal(hasState(createState()), false);
        assert.equal(hasState(null), false);
    });

    it('is true as soon as the ledger has anything worth rendering', () => {
        assert.equal(hasState(createState({ powers: [{ id: 'p' }] })), true);
        assert.equal(hasState(createState({ arc: { phase: 'rising', threads: [], pressures: [], linesCrossed: [] } })), true);
        assert.equal(hasState(createState({ hero: { name: 'Hailey' } })), true);
    });
});

describe('shouldEvaluate', () => {
    it('fires on the cadence and not between ticks', () => {
        assert.equal(shouldEvaluate(15, DEFAULT_CADENCE), true);
        assert.equal(shouldEvaluate(30, DEFAULT_CADENCE), true);
        assert.equal(shouldEvaluate(7, DEFAULT_CADENCE), false);
    });

    it('never fires on nothing', () => {
        assert.equal(shouldEvaluate(0), false);
        assert.equal(shouldEvaluate(-1), false);
        assert.equal(shouldEvaluate(Number.NaN), false);
    });
});

describe('PROPOSAL_SCHEMA', () => {
    it('has nowhere to put a story proposal', () => {
        // The non-goal is enforced structurally: the only fields are bookkeeping.
        const item = PROPOSAL_SCHEMA.value.properties.proposals.items;
        assert.deepEqual(Object.keys(item.properties), ['summary', 'changes', 'evidence']);
        assert.deepEqual(item.required, ['summary', 'changes']);
    });

    it('requires the path and the new value of every change', () => {
        const change = PROPOSAL_SCHEMA.value.properties.proposals.items.properties.changes.items;
        assert.deepEqual(change.required, ['path', 'to']);
    });
});
