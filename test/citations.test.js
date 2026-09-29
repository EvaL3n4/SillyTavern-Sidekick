import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fingerprintCitations, reanchorCitations, resolveCitation } from '../src/citations.js';

/**
 * The chat as ST holds it: a spine of message objects, each with the date its
 * variant was rendered at. `reroll(chat, i, text)` parks the old date in
 * swipe_info and installs a new one, which is what syncSwipeToMes does when the
 * DM picks another swipe.
 */
function stubChat() {
    return [
        { mes: 'the first thing that happened', send_date: 1000 },
        { mes: 'the second thing that happened', send_date: 2000 },
        { mes: 'the third thing that happened', send_date: 3000 },
    ];
}

const reroll = (chat, index, text, date) => {
    chat[index].swipe_info = [{ send_date: chat[index].send_date }];
    chat[index].mes = text;
    chat[index].send_date = date;
};

describe('fingerprintCitations', () => {
    it('attaches the message date to each cited index', () => {
        assert.deepEqual(fingerprintCitations(stubChat(), [0, 2]), [
            { index: 0, send_date: 1000 },
            { index: 2, send_date: 3000 },
        ]);
    });

    it('skips indices the chat does not hold', () => {
        // the caller gates on an empty result: the scan cited something it
        // never saw, and the pass is void the way a bad schema is
        assert.deepEqual(fingerprintCitations(stubChat(), [0, 9]), [
            { index: 0, send_date: 1000 },
        ]);
    });

    it('returns nothing for a chat it cannot read', () => {
        assert.deepEqual(fingerprintCitations(null, [0]), []);
        assert.deepEqual(fingerprintCitations(stubChat(), undefined), []);
        assert.deepEqual(fingerprintCitations(stubChat(), [1.5, -1, Number.NaN]), []);
    });
});

describe('resolveCitation', () => {
    it('is live when the index still holds the cited message', () => {
        assert.deepEqual(resolveCitation(stubChat(), { index: 1, send_date: 2000 }), {
            status: 'live',
            index: 1,
        });
    });

    it('heals when a deletion moved the message', () => {
        const chat = stubChat();
        chat.splice(0, 1); // the first two are gone; the third slid down

        assert.deepEqual(resolveCitation(chat, { index: 2, send_date: 3000 }), {
            status: 'healed',
            index: 1,
        });
    });

    it('is gone when no message carries the date', () => {
        assert.deepEqual(resolveCitation(stubChat(), { index: 1, send_date: 9999 }), {
            status: 'stale',
            reason: 'gone',
        });
    });

    it('is rerolled when only the swipe history carries the date', () => {
        // the slot exists but its variant was replaced; the cited text lives
        // on in swipe_info, which is how we tell a re-roll from a deletion
        const chat = stubChat();
        reroll(chat, 1, 'something else entirely', 4000);

        assert.deepEqual(resolveCitation(chat, { index: 1, send_date: 2000 }), {
            status: 'stale',
            reason: 'rerolled',
        });
    });

    it('resolves a legacy index-only citation conservatively', () => {
        assert.deepEqual(resolveCitation(stubChat(), 2), { status: 'live', index: 2 });
        assert.deepEqual(resolveCitation(stubChat(), { index: 2 }), { status: 'live', index: 2 });
        assert.deepEqual(resolveCitation(stubChat(), { index: 9 }), {
            status: 'stale',
            reason: 'gone',
        });
    });

    it('is stale for an index it cannot trust', () => {
        for (const bad of [-1, 1.5, Number.NaN, undefined]) {
            assert.deepEqual(resolveCitation(stubChat(), { index: bad, send_date: 2000 }), {
                status: 'stale',
                reason: 'gone',
            });
        }
    });

    it('is stale when the chat itself is unreadable', () => {
        // nothing to verify against means nothing to jump to
        assert.deepEqual(resolveCitation(null, { index: 1, send_date: 2000 }), {
            status: 'stale',
            reason: 'gone',
        });
    });
});

describe('reanchorCitations', () => {
    const state = () => ({
        queue: [{ id: 'p1', evidence: [{ index: 2, send_date: 3000 }] }],
        history: [{ summary: 'stopped holding back', evidence: [{ index: 0, send_date: 1000 }] }],
        powers: [{ history: [{ evidence: [{ index: 1, send_date: 2000 }] }] }],
        arc: { linesCrossed: [{ msgId: { index: 1, send_date: 2000 } }] },
    });

    it('rewrites every moved citation in place and counts the outcomes', () => {
        const chat = stubChat();
        chat.splice(0, 1); // everything slides down one; the first message's citation dies with it
        const moved = state();

        assert.deepEqual(reanchorCitations(moved, chat), { live: 0, healed: 3, stale: 1 });
        assert.equal(moved.queue[0].evidence[0].index, 1);
        assert.equal(moved.powers[0].history[0].evidence[0].index, 0);
        assert.equal(moved.arc.linesCrossed[0].msgId.index, 0);
        assert.deepEqual(moved.history[0].evidence[0], { index: 0, send_date: 1000 });
    });

    it('is idempotent: the second pass agrees with the first', () => {
        const chat = stubChat();
        chat.splice(0, 1);
        const moved = state();
        reanchorCitations(moved, chat);

        assert.deepEqual(reanchorCitations(moved, chat), { live: 3, healed: 0, stale: 1 });
    });

    it('leaves a legacy citation alone rather than guessing a date for it', () => {
        const chat = stubChat();
        chat.splice(0, 1);
        const legacy = { queue: [{ id: 'p1', evidence: [1] }] };

        assert.deepEqual(reanchorCitations(legacy, chat), { live: 1, healed: 0, stale: 0 });
        assert.deepEqual(legacy.queue[0].evidence, [1]);
    });

    it('counts nothing when there is no state to walk', () => {
        assert.deepEqual(reanchorCitations(null, stubChat()), { live: 0, healed: 0, stale: 0 });
    });
});
