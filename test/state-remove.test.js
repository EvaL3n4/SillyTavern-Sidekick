import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createState, recordRuling, removeAt } from '../src/state.js';

const ledger = () => createState({
    powers: [
        { id: 'the-spark', name: 'The Spark', limits: ['a', 'b', 'c'], costs: ['sleep'], history: [] },
        { id: 'shear', name: 'Shear', limits: [], costs: [], history: [] },
    ],
    arc: {
        threads: [{ id: 'the-debt', text: 'a favour owed' }],
        pressures: [{ text: 'sleep is short' }, { text: 'cornered' }],
        linesCrossed: [{ line: 'lied' }],
    },
    cosmology: { sources: ['a debt', 'a gift'], stageVocabulary: ['raw'], costVocabulary: ['strain'], taboos: '' },
});

describe('removeAt', () => {
    it('removes a power by its id, and says what it was', () => {
        const state = ledger();

        assert.deepEqual(removeAt(state, 'powers.shear', { at: 5 }), { from: 'Shear' });
        assert.deepEqual(state.powers.map((power) => power.id), ['the-spark']);
    });

    it('removes a thread by its id and a pressure or a line by its index', () => {
        const state = ledger();

        assert.deepEqual(removeAt(state, 'arc.threads.the-debt'), { from: 'a favour owed' });
        assert.deepEqual(removeAt(state, 'arc.pressures.0'), { from: 'sleep is short' });
        assert.deepEqual(removeAt(state, 'arc.linesCrossed.0'), { from: 'lied' });
        assert.deepEqual(state.arc.threads, []);
        assert.deepEqual(state.arc.pressures.map((pressure) => pressure.text), ['cornered']);
        assert.deepEqual(state.arc.linesCrossed, []);
    });

    it('names a power that has no name by its id', () => {
        const state = createState({ powers: [{ id: 'nameless', limits: [], costs: [], history: [] }] });

        assert.deepEqual(removeAt(state, 'powers.nameless'), { from: 'nameless' });
    });

    it('removes one limit or cost and lets the rest shift up', () => {
        const state = ledger();

        assert.deepEqual(removeAt(state, 'powers.the-spark.limits.1'), { from: 'b' });
        assert.deepEqual(state.powers[0].limits, ['a', 'c']);
        assert.deepEqual(removeAt(state, 'powers.the-spark.costs.0'), { from: 'sleep' });
        assert.deepEqual(state.powers[0].costs, []);
    });

    it('removes a word from the setting', () => {
        const state = ledger();

        assert.deepEqual(removeAt(state, 'cosmology.sources.0'), { from: 'a debt' });
        assert.deepEqual(removeAt(state, 'cosmology.stageVocabulary.0'), { from: 'raw' });
        assert.deepEqual(removeAt(state, 'cosmology.costVocabulary.0'), { from: 'strain' });
        assert.deepEqual(state.cosmology.sources, ['a gift']);
    });

    it('records a history event with the summary, and the power\'s own history for a list item', () => {
        const state = ledger();

        removeAt(state, 'powers.the-spark.limits.0', { at: 9, summary: 'Removed The Spark · Limit 1' });

        const event = state.history.at(-1);
        assert.deepEqual(event, {
            summary: 'Removed The Spark · Limit 1',
            origin: 'manual',
            evidence: [],
            at: 9,
            changes: [{ path: 'powers.the-spark.limits.0', from: 'a', to: '' }],
        });
        assert.equal(state.powers[0].history.at(-1), event);
    });

    it('names what it removed in the history summary when the caller gives none', () => {
        const state = ledger();

        removeAt(state, 'powers.shear');
        removeAt(state, 'powers.the-spark.limits.2');

        assert.equal(state.history[0].summary, 'Removed Shear');
        assert.equal(state.history[0].changes[0].from, 'Shear');
        assert.equal(state.history[1].summary, 'Removed c');
    });

    it('names the path when what was removed had no words', () => {
        const state = createState({ powers: [{ id: 'x', limits: [''], costs: [], history: [] }] });

        removeAt(state, 'powers.x.limits.0');

        assert.equal(state.history[0].summary, 'Removed powers.x.limits.0');
    });

    it('refuses what is not there', () => {
        const state = ledger();

        for (const path of [
            'powers.ghost', 'powers.the-spark.limits.9', 'powers.the-spark.limits.-1', 'powers.the-spark.limits.x',
            'powers.ghost.limits.0', 'arc.threads.ghost', 'arc.threads.0', 'arc.pressures.9', 'arc.pressures.x',
            'arc.linesCrossed.5', 'cosmology.sources.9',
        ]) {
            assert.equal(removeAt(state, path), null, path);
        }
        assert.equal(state.history.length, 0);
    });

    it('refuses what may not be removed, so a stray path cannot take a field away', () => {
        const state = ledger();

        for (const path of [
            'hero', 'hero.name', 'arc', 'arc.phase', 'cosmology', 'cosmology.taboos', 'powers',
            'powers.the-spark.name', 'powers.the-spark.limits', 'queue.0', 'rulings.0',
            'settings.evaluationCadence', 'arc.threads.the-debt.text', 'cosmology.sources', '', 'limits.0',
            'hero.limits.0', 'powers.the-spark.cosmology.sources.0',
        ]) {
            assert.equal(removeAt(state, path), null, path);
        }
        assert.equal(state.powers.length, 2);
        assert.equal(state.history.length, 0);
    });

    it('survives a ledger without the lists it would look in', () => {
        assert.equal(removeAt({ history: [], powers: 'nope' }, 'powers.x'), null);
        assert.equal(removeAt({ history: [] }, 'arc.pressures.0'), null);
        assert.equal(removeAt({ history: [] }, 'cosmology.sources.0'), null);
    });
});

describe('removeAt leaves no proposal without a subject', () => {
    const proposal = (id, ...paths) => ({ id, summary: id, changes: paths.map((path) => ({ path, from: '', to: 'x' })) });
    const queued = (state) => Object.fromEntries(state.queue.map((entry) => [entry.id, entry.orphaned === true]));

    it('orphans a proposal about a power that has been removed, and only that', () => {
        const state = ledger();
        state.queue = [
            proposal('about-shear', 'powers.shear.limits.0'),
            proposal('about-spark', 'powers.the-spark.limits.3'),
            proposal('about-hero', 'hero.name'),
        ];

        removeAt(state, 'powers.shear');

        assert.deepEqual(queued(state), { 'about-shear': true, 'about-spark': false, 'about-hero': false });
    });

    it('orphans a proposal that touches the removed entry itself, and any one of several changes', () => {
        const state = ledger();
        state.queue = [
            proposal('renames', 'powers.shear.name'),
            proposal('mixed', 'hero.name', 'powers.shear.capability'),
            proposal('a-prefix-lookalike', 'powers.shear-two.name'),
        ];

        removeAt(state, 'powers.shear');

        assert.deepEqual(queued(state), { renames: true, mixed: true, 'a-prefix-lookalike': false });
    });

    it('orphans a thread\'s proposals by its id', () => {
        const state = ledger();
        state.queue = [proposal('t', 'arc.threads.the-debt.text'), proposal('other', 'arc.threads.other.text')];

        removeAt(state, 'arc.threads.the-debt');

        assert.deepEqual(queued(state), { t: true, other: false });
    });

    it('orphans what sat at or past a removed index, because it now names a different item', () => {
        const state = ledger();
        state.queue = [
            proposal('before', 'arc.pressures.0.text'),
            proposal('at', 'arc.pressures.1.text'),
            proposal('past', 'arc.pressures.5.text'),
            proposal('other-list', 'arc.linesCrossed.1.line'),
        ];

        removeAt(state, 'arc.pressures.1');

        assert.deepEqual(queued(state), { before: false, at: true, past: true, 'other-list': false });
    });

    it('does the same for one item of a list under a power', () => {
        const state = ledger();
        state.queue = [
            proposal('first', 'powers.the-spark.limits.0'),
            proposal('third', 'powers.the-spark.limits.2'),
            proposal('costs', 'powers.the-spark.costs.2'),
            proposal('other-power', 'powers.shear.limits.2'),
        ];

        removeAt(state, 'powers.the-spark.limits.1');

        assert.deepEqual(queued(state), { first: false, third: true, costs: false, 'other-power': false });
    });

    it('does the same for a word of the setting', () => {
        const state = ledger();
        state.queue = [proposal('word', 'cosmology.sources.1')];

        removeAt(state, 'cosmology.sources.0');

        assert.deepEqual(queued(state), { word: true });
    });

    it('leaves the queue alone when nothing was removed, and survives one that is not a list', () => {
        const state = ledger();
        state.queue = [proposal('p', 'powers.shear.limits.0')];

        assert.equal(removeAt(state, 'powers.ghost'), null);
        assert.deepEqual(queued(state), { p: false });

        state.queue = 'nope';
        assert.doesNotThrow(() => removeAt(state, 'powers.shear'));
    });

    it('survives a queue entry with no changes', () => {
        const state = ledger();
        state.queue = [{ id: 'bare' }, null];

        assert.doesNotThrow(() => removeAt(state, 'powers.shear'));
        assert.equal(state.queue[0].orphaned, undefined);
    });
});

describe('recordRuling', () => {
    it('keeps the field a written ruling is about', () => {
        const state = createState();

        recordRuling(state, { proposalId: 'hand:hero.name', summary: 'Hero · Name: Hailey', action: 'written', path: 'hero.name', at: 1 });

        assert.equal(state.rulings[0].path, 'hero.name');
    });

    it('adds no path to a ruling that has none', () => {
        const state = createState();

        recordRuling(state, { proposalId: 'p1', summary: 's', action: 'applied', at: 1 });

        assert.equal('path' in state.rulings[0], false);
    });
});
