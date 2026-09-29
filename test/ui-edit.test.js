/**
 * The review queue's edit path, where the DM's own words reach the content.
 *
 * src/ui.js is browser-only, so this file imports it for the two pure helpers
 * the edit path turns on rather than driving jQuery. The split they guard is
 * the interesting one: `brokenEdits` predicts what applyProposal's provenance
 * gate will do, and a prediction that disagrees with the gate is a silent skip
 * in her favour either way.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { brokenEdits, editedProposal } from '../src/ui.js';
import { ledger, proposal } from './fixtures.js';

/**
 * The shape editPanel's read() returns: her words, as strings, one pair per
 * change. Built off the live entry because that is what the panel does—every
 * field is pre-filled with the value she is looking at—so a test that says
 * nothing about a field gets the value she left alone rather than a blank.
 *
 * @param {object} live the entry the panel was drawn from
 * @param {object} [overrides] what she typed, per field
 * @returns {{summary: string, changes: Array<{from: string, to: string}>}}
 */
const read = (live, overrides = {}) => ({
    summary: live.summary ?? '',
    ...overrides,
    changes: (live.changes ?? []).map((change, i) => ({
        from: change.from ?? '',
        to: change.to ?? '',
        ...(overrides.changes?.[i] ?? {}),
    })),
});

describe('editedProposal', () => {
    it('passes the proposal straight through when the panel was closed', () => {
        const live = proposal();

        const { proposal: out, edit } = editedProposal(live, null);

        assert.equal(out, live);
        assert.equal(edit, '');
    });

    it('carries her summary into the proposal, and records it as the edit', () => {
        const live = proposal();

        const { proposal: out, edit } = editedProposal(live, read(live, {
            summary: 'the spark keeps a second limit',
        }));

        assert.equal(out.summary, 'the spark keeps a second limit');
        // §6: `edit` is a string, how the DM reworded it
        assert.equal(edit, 'the spark keeps a second limit');
        // the change is untouched, because she did not touch it
        assert.deepEqual(out.changes, live.changes);
    });

    it('carries her wording into changes[].to, so the ChangeEvent reads as she wrote it', () => {
        const live = proposal();

        const { proposal: out, edit } = editedProposal(live, read(live, {
            changes: [{ to: 'she cannot aim it' }],
        }));

        assert.equal(out.changes[0].to, 'she cannot aim it');
        // the from she left alone is still the catch it was
        assert.equal(out.changes[0].from, 'no control');
        // she rewrote the content and not the label, so the edit names the field
        // instead of claiming she wrote a summary she did not
        assert.equal(out.summary, live.summary);
        assert.equal(edit, 'reworded powers.the-spark.limits.0');
    });

    it('treats an emptied from as no catch, not as a value that must be empty', () => {
        const live = proposal();

        const { proposal: out } = editedProposal(live, read(live, {
            changes: [{ from: '' }],
        }));

        // The whole point: `from: ''` would make applyProposal require the live
        // value to be an empty string, and refuse a change she meant to free.
        assert.equal(out.changes[0].from, undefined);
    });

    it('leaves a from that was never there as absent', () => {
        const live = proposal({
            changes: [{ path: 'powers.the-spark.limits.0', to: 'unfocused it takes everything from the waist down' }],
        });

        const { proposal: out } = editedProposal(live, read(live));

        assert.equal(out.changes[0].from, undefined);
    });

    it('keeps a from she typed, where there was none to begin with', () => {
        const live = proposal({
            changes: [{ path: 'powers.the-spark.limits.0', to: 'unfocused it takes everything from the waist down' }],
        });

        const { proposal: out, edit } = editedProposal(live, read(live, {
            changes: [{ from: 'unfocused it takes everything from the waist down' }],
        }));

        assert.equal(out.changes[0].from, 'unfocused it takes everything from the waist down');
        // adding a catch is an edit as surely as changing a value
        assert.equal(edit, 'reworded powers.the-spark.limits.0');
    });

    it('prefers her summary over the naming when she wrote both', () => {
        const live = proposal();

        const { proposal: out, edit } = editedProposal(live, read(live, {
            summary: 'the spark keeps a second limit',
            changes: [{ to: 'she cannot aim it' }],
        }));

        assert.equal(out.summary, 'the spark keeps a second limit');
        assert.equal(edit, 'the spark keeps a second limit');
    });

    it('names every field she rewrote in a multi-change proposal, not one blob', () => {
        const live = proposal({
            changes: [
                { path: 'powers.the-spark.limits.0', from: 'no control', to: 'no control' },
                { path: 'powers.the-spark.limits.1', to: 'unfocused it takes everything from the waist down' },
            ],
        });

        const { edit } = editedProposal(live, read(live, {
            changes: [{ to: 'she cannot aim it' }, { to: 'unfocused it takes everything from the waist down and it shows' }],
        }));

        assert.equal(edit, 'reworded powers.the-spark.limits.0, powers.the-spark.limits.1');
    });

    it('records no edit at all when she opened the panel and changed nothing', () => {
        const live = proposal();

        const { edit } = editedProposal(live, read(live));

        assert.equal(edit, '');
    });

    it('survives a proposal with no changes', () => {
        const live = proposal({ changes: [] });

        const { proposal: out, edit } = editedProposal(live, read(live));

        assert.deepEqual(out.changes, []);
        assert.equal(edit, '');
    });
});

describe('brokenEdits', () => {
    it('says nothing about a clean edit', () => {
        const state = ledger();
        const live = proposal();

        assert.deepEqual(brokenEdits(state, live, read(live, {
            changes: [{ to: 'she cannot aim it' }],
        })), []);
    });

    it('names a from that no longer matches what the ledger reads', () => {
        const state = ledger();
        const live = proposal();

        assert.deepEqual(brokenEdits(state, live, read(live, {
            changes: [{ from: 'no control at all' }],
        })), ['powers.the-spark.limits.0 no longer reads what from says']);
    });

    it('names a from she cleared on a change that had one', () => {
        const state = ledger();
        const live = proposal();

        assert.deepEqual(brokenEdits(state, live, read(live, {
            changes: [{ from: '' }],
        })), ['powers.the-spark.limits.0 lost its from check']);
    });

    it('says nothing about a from that was never there to clear', () => {
        const state = ledger();
        const live = proposal({
            changes: [{ path: 'powers.the-spark.limits.0', to: 'unfocused it takes everything from the waist down' }],
        });

        assert.deepEqual(brokenEdits(state, live, read(live)), []);
    });

    it('names a blank to, which carries no gate at all', () => {
        const state = ledger();
        const live = proposal();

        assert.deepEqual(brokenEdits(state, live, read(live, {
            changes: [{ to: '' }],
        })), ['powers.the-spark.limits.0 would be emptied']);
    });

    it('agrees with the gate when a from she typed does match', () => {
        const state = ledger();
        const live = proposal({
            changes: [{ path: 'powers.the-spark.limits.0', to: 'unfocused it takes everything from the waist down' }],
        });

        assert.deepEqual(brokenEdits(state, live, read(live, {
            changes: [{ from: 'no control' }],
        })), []);
    });

    it('reports each reason separately, so no edit hides behind another', () => {
        const state = ledger();
        const live = proposal({
            changes: [
                { path: 'powers.the-spark.limits.0', from: 'no control', to: 'no control' },
                { path: 'powers.the-spark.limits.1', to: 'unfocused it takes everything from the waist down' },
            ],
        });

        assert.deepEqual(brokenEdits(state, live, read(live, {
            changes: [{ to: 'she cannot aim it' }, { from: 'it takes everything from the waist down', to: '' }],
        })), [
            'powers.the-spark.limits.1 no longer reads what from says',
            'powers.the-spark.limits.1 would be emptied',
        ]);
    });

    it('survives a proposal with no changes', () => {
        const state = ledger();
        const live = proposal({ changes: [] });

        assert.deepEqual(brokenEdits(state, live, read(live)), []);
    });

    it('ignores a field it has no counterpart for', () => {
        const state = ledger();
        const live = proposal();

        assert.deepEqual(brokenEdits(state, live, read(live, { changes: [] })), []);
    });
});
