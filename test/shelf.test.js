import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SCENE_WINDOW } from '../src/evaluate.js';
import { clearOld, oldReason, partitionQueue, waitingCount } from '../src/shelf.js';
import { createState } from '../src/state.js';

const entry = (id, extra = {}) => ({ id, summary: `about ${id}`, changes: [], evidence: [], status: 'pending', ...extra });

describe('oldReason', () => {
    it('is not old while the chat is still inside a scene window of where it was filed', () => {
        assert.equal(oldReason(entry('a', { filedAt: 10 }), 10), null);
        assert.equal(oldReason(entry('a', { filedAt: 10 }), 10 + SCENE_WINDOW - 1), null);
    });

    it('is old once the chat has grown a scene window past where it was filed', () => {
        assert.equal(oldReason(entry('a', { filedAt: 10 }), 10 + SCENE_WINDOW), 'aged');
        assert.equal(oldReason(entry('a', { filedAt: 10 }), 500), 'aged');
    });

    it('counts messages, so a chat she left alone does not age it', () => {
        // no message was added while she was in another chat, so the length has not moved
        assert.equal(oldReason(entry('a', { filedAt: 40 }), 40), null);
    });

    it('does not age a chat that has shrunk below where it was filed', () => {
        assert.equal(oldReason(entry('a', { filedAt: 40 }), 12), null);
    });

    it('never ages a proposal that rests on the character card', () => {
        assert.equal(oldReason(entry('a', { source: 'card', filedAt: 0 }), 1000), null);
        assert.equal(oldReason(entry('a', { source: 'card' }), 1000), null);
    });

    it('never ages a proposal filed before it was stamped', () => {
        assert.equal(oldReason(entry('a'), 1000), null);
        for (const filedAt of [null, undefined, '5', NaN]) {
            assert.equal(oldReason(entry('a', { filedAt }), 1000), null, String(filedAt));
        }
    });

    it('does not guess when the chat length is unknown', () => {
        assert.equal(oldReason(entry('a', { filedAt: 0 }), undefined), null);
        assert.equal(oldReason(entry('a', { filedAt: 0 }), NaN), null);
    });

    it('is old at once when a change names something she removed, whatever its age', () => {
        assert.equal(oldReason(entry('a', { orphaned: true }), 0), 'removed');
        assert.equal(oldReason(entry('a', { orphaned: true, source: 'card' }), 0), 'removed');
        assert.equal(oldReason(entry('a', { orphaned: true, filedAt: 0 }), 1000), 'removed');
    });

    it('reads anything that is not an entry as not old', () => {
        assert.equal(oldReason(null, 100), null);
        assert.equal(oldReason(undefined, 100), null);
        assert.equal(oldReason({}, 100), null);
    });
});

describe('partitionQueue', () => {
    it('splits the queue in two and keeps each half in the order it was filed', () => {
        const queue = [
            entry('new-1', { filedAt: 95 }),
            entry('old-1', { filedAt: 10 }),
            entry('card', { source: 'card' }),
            entry('old-2', { orphaned: true }),
            entry('new-2', { filedAt: 90 }),
        ];

        const { current, old } = partitionQueue(queue, 100);

        assert.deepEqual(current.map((one) => one.id), ['new-1', 'card', 'new-2']);
        assert.deepEqual(old.map((one) => one.id), ['old-1', 'old-2']);
    });

    it('gives two empty halves for no queue at all', () => {
        for (const queue of [undefined, null, 'nope', []]) {
            assert.deepEqual(partitionQueue(queue, 100), { current: [], old: [] });
        }
    });
});

describe('waitingCount', () => {
    it('counts only what is not old', () => {
        const state = createState({ queue: [entry('a', { filedAt: 90 }), entry('b', { filedAt: 1 }), entry('c', { orphaned: true })] });

        assert.equal(waitingCount(state, 100), 1);
    });

    it('is zero for no state, and counts everything in a chat too short to age anything', () => {
        assert.equal(waitingCount(null, 100), 0);
        assert.equal(waitingCount(createState({ queue: [entry('a', { filedAt: 0 })] }), 5), 1);
    });
});

describe('clearOld', () => {
    it('records each old proposal as stale and takes it out of the queue', () => {
        const state = createState({ queue: [entry('keep', { filedAt: 95 }), entry('go', { filedAt: 1 }), entry('gone', { orphaned: true })] });

        assert.equal(clearOld(state, 100, { at: 7 }), 2);

        assert.deepEqual(state.queue.map((one) => one.id), ['keep']);
        assert.deepEqual(state.rulings.map(({ proposalId, summary, action, at }) => ({ proposalId, summary, action, at })), [
            { proposalId: 'go', summary: 'about go', action: 'stale', at: 7 },
            { proposalId: 'gone', summary: 'about gone', action: 'stale', at: 7 },
        ]);
    });

    it('does nothing when nothing is old, and never touches a current proposal', () => {
        const state = createState({ queue: [entry('a', { filedAt: 99 })] });
        const before = state.queue;

        assert.equal(clearOld(state, 100), 0);

        assert.equal(state.queue, before);
        assert.equal(state.rulings.length, 0);
    });

    it('freezes an empty summary as empty, and uses the real clock without one', () => {
        const state = createState({ queue: [{ id: 'x', orphaned: true }] });

        clearOld(state, 0);

        assert.equal(state.rulings[0].summary, '');
        assert.ok(Math.abs(state.rulings[0].at - Date.now()) < 5000);
    });

    it('survives no state and no queue', () => {
        assert.equal(clearOld(null, 100), 0);
        assert.equal(clearOld({ queue: 'nope' }, 100), 0);
    });
});
