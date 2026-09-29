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
import { ledger, theSpark } from './fixtures.js';

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
        const { text, tokens } = renderDigest(ledger());

        assert.match(text, /a blue-black force that wraps what she protects/);
        assert.match(text, /no control/);
        assert.match(text, /unfocused it takes everything from the waist down/);
        assert.match(text, /cracked asphalt/);
        assert.ok(tokens > 0);
    });

    it('renders shame as concealment rather than as an admission', () => {
        const { text } = renderDigest(ledger());

        assert.match(text, /keeps her family must not learn out of the open/);
        assert.match(text, /the keeping costs her/);
    });

    it('renders an open pressure as due and a hidden one as concealed', () => {
        // the ledger fixture holds one of each, so both branches of the split
        // have to render or the fixture has drifted again
        const { text } = renderDigest(ledger());

        assert.match(text, /What is due: the council wants answers/);
        assert.match(text, /keeps her family must not learn out of the open/);
    });

    it('drops a blank limit rather than rendering a dangling clause', () => {
        // list() filters falsy entries, so a half-filled limit from a partial
        // edit must not leave "it: ." hanging in the render
        const { text } = renderDigest(ledger({ powers: [{ ...theSpark(), limits: [''] }] }));

        assert.match(text, /Hailey Kogami Green can one thing:/);
        assert.doesNotMatch(text, /while she is doing it/);
    });

    it('renders a power that carries neither limits nor costs', () => {
        // the false side of both gates: an early ledger has a capability only,
        // and it must render rather than trailing empty clauses
        const { text } = renderDigest(ledger({
            powers: [{ id: 'p', name: 'P', capability: 'a first push', limits: [], costs: [] }],
        }));

        assert.match(text, /can one thing: a first push/);
        assert.doesNotMatch(text, /while she is doing it/);
        assert.doesNotMatch(text, /leaves a bill/);
    });

    it('renders residue as what the line provided and what it cost', () => {
        const { text } = renderDigest(ledger());
        assert.match(text, /public breakage/);
        assert.match(text, /a witness/);
    });

    it('compresses limits and costs before it touches the arc', () => {
        const result = renderDigest(ledger(), { budget: 40 });

        assert.ok(result.degraded.includes('capability'));
        assert.ok(result.degraded.indexOf('capability') < result.degraded.indexOf('arc'));
    });

    it('never drops the arc, even at an absurd budget', () => {
        const result = renderDigest(ledger(), { budget: 1 });

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
        const { text } = renderDigest(ledger(), { budget: 1 });
        const lowered = text.toLowerCase();

        for (const word of ['digest', 'state', 'ledger', 'sidekick', 'prompt', 'character', 'model']) {
            assert.ok(!lowered.includes(word), `render mentioned "${word}"`);
        }
    });

    it('stops short of resolving anything', () => {
        // §4 rule 4: it ends before the outcome, never at it.
        const { text } = renderDigest(ledger());
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
        assert.equal(shouldSkip({ type: 'quiet', state: ledger() }), true);
    });

    it('skips sessions that have no state yet', () => {
        assert.equal(shouldSkip({ type: 'normal', state: createState() }), true);
        assert.equal(shouldSkip({ type: 'normal', state: null }), true);
    });

    it('does not skip a real generation with a ledger', () => {
        assert.equal(shouldSkip({ type: 'regenerate', state: ledger() }), false);
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
