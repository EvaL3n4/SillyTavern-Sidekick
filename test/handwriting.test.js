import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { IDLE_MS, bornWithMessage, createHandLog, entryPath, slugFor } from '../src/handwriting.js';
import { createState, getPath } from '../src/state.js';

const spark = () => createState({
    hero: { name: 'Hailey', codename: '', statusQuo: '' },
    powers: [{ id: 'the-spark', name: 'The Spark', capability: 'a small light', limits: ['no control'], costs: [], stage: '', history: [] }],
});

/** A log on a clock the test turns by hand. */
function clocked() {
    const clock = { t: 1_000_000 };
    return { clock, log: createHandLog({ now: () => clock.t }) };
}

describe('slugFor', () => {
    it('makes a slug of the words she typed', () => {
        assert.equal(slugFor([], 'Light Throw'), 'light-throw');
        assert.equal(slugFor([], '  The Spark!  '), 'the-spark');
    });

    it('numbers a clash rather than reusing the id', () => {
        assert.equal(slugFor(['light-throw'], 'Light Throw'), 'light-throw-2');
        assert.equal(slugFor(['light-throw', 'light-throw-2'], 'Light Throw'), 'light-throw-3');
    });

    it('drops accents and keeps to letters and digits', () => {
        assert.equal(slugFor([], 'Café Éclair'), 'cafe-eclair');
        assert.equal(slugFor([], 'a  &  b'), 'a-b');
    });

    it('cuts a long sentence to a short id without a dangling hyphen', () => {
        const slug = slugFor([], 'She owes the dockmaster a favour she cannot repay in kind');
        assert.ok(slug.length <= 32, slug);
        assert.doesNotMatch(slug, /-$/);
        assert.match(slug, /^she-owes-the-dockmaster/);
    });

    it('falls back when there is nothing to make an id from', () => {
        assert.equal(slugFor([], '???', 'power'), 'power');
        assert.equal(slugFor([], '', 'thread'), 'thread');
        assert.equal(slugFor([], undefined), 'entry');
        assert.equal(slugFor(['power'], '???', 'power'), 'power-2');
    });

    it('never makes an id that reads as an index', () => {
        assert.equal(slugFor([], '7', 'power'), 'power-7');
        assert.equal(slugFor(['power-7'], '7', 'power'), 'power-7-2');
    });
});

describe('entryPath', () => {
    it('gives a power or a thread an id made from what she typed', () => {
        assert.equal(entryPath(spark(), 'powers', 'Light Throw'), 'powers.light-throw.name');
        assert.equal(entryPath(spark(), 'powers', 'The Spark'), 'powers.the-spark-2.name');
        assert.equal(entryPath(spark(), 'arc.threads', 'A favour owed'), 'arc.threads.a-favour-owed.text');
    });

    it('puts a pressure or a line at the next index', () => {
        const state = createState({ arc: { pressures: [{ text: 'a' }, { text: 'b' }], linesCrossed: [] } });

        assert.equal(entryPath(state, 'arc.pressures', 'x'), 'arc.pressures.2.text');
        assert.equal(entryPath(state, 'arc.linesCrossed', 'x'), 'arc.linesCrossed.0.line');
    });

    it('starts a list that is not there at 0, and refuses one it cannot add to', () => {
        assert.equal(entryPath({}, 'powers', 'x'), 'powers.x.name');
        assert.equal(entryPath({}, 'arc.pressures', 'x'), 'arc.pressures.0.text');
        assert.equal(entryPath(spark(), 'hero', 'x'), null);
    });
});

describe('bornWithMessage', () => {
    const state = createState({
        arc: { threads: [{ id: 'the-debt', text: 'x' }], pressures: [{ text: 'a' }], linesCrossed: [{ line: 'b' }] },
    });

    it('is true for the first field of a thread, pressure or line that is not there yet', () => {
        assert.equal(bornWithMessage(state, 'arc.threads.new-one.text'), true);
        assert.equal(bornWithMessage(state, 'arc.pressures.1.text'), true);
        assert.equal(bornWithMessage(state, 'arc.linesCrossed.1.line'), true);
    });

    it('is false for a field of one that is already there', () => {
        assert.equal(bornWithMessage(state, 'arc.threads.the-debt.text'), false);
        assert.equal(bornWithMessage(state, 'arc.pressures.0.text'), false);
        assert.equal(bornWithMessage(state, 'arc.linesCrossed.0.cost'), false);
    });

    it('is false for anything that is not one of those entries', () => {
        for (const path of ['hero.name', 'arc.phase', 'powers.x.name', 'arc.other.0.text', 'arc.pressures.1', 'cosmology.sources.0']) {
            assert.equal(bornWithMessage(state, path), false, path);
        }
    });

    it('starts a list that is missing at its first entry', () => {
        assert.equal(bornWithMessage({}, 'arc.pressures.0.text'), true);
        assert.equal(bornWithMessage(null, 'arc.threads.a.text'), true);
        assert.equal(bornWithMessage({ arc: { pressures: 'nope' } }, 'arc.pressures.0.text'), true);
    });
});

describe('a hand write', () => {
    it('lands in the ledger, ungated, as a manual change with its own history', () => {
        const state = spark();
        const { log } = clocked();

        assert.equal(log.commit(state, 'powers.the-spark.capability', 'a small light she throws'), 'written');

        assert.equal(getPath(state, 'powers.the-spark.capability'), 'a small light she throws');
        const event = state.history.at(-1);
        assert.equal(event.origin, 'manual');
        assert.deepEqual(event.changes, [{ path: 'powers.the-spark.capability', from: 'a small light', to: 'a small light she throws' }]);
        assert.equal(state.powers[0].history.at(-1), event);
    });

    it('does nothing when the value is what the field already holds', () => {
        const state = spark();
        const { log } = clocked();

        assert.equal(log.commit(state, 'powers.the-spark.capability', 'a small light'), 'unchanged');
        assert.equal(state.history.length, 0);
        assert.equal(state.rulings.length, 0);
    });

    it('treats a field that does not exist yet as empty', () => {
        const state = spark();
        const { log } = clocked();

        assert.equal(log.commit(state, 'powers.the-spark.limits.1', 'daylight'), 'written');
        assert.deepEqual(state.powers[0].limits, ['no control', 'daylight']);
        assert.equal(log.commit(createState(), 'hero.name', ''), 'unchanged');
    });

    it('comes into being under a new id when it writes an entry\'s first field', () => {
        const state = spark();
        const { log } = clocked();

        log.commit(state, entryPath(state, 'powers', 'Light Throw'), 'Light Throw');

        assert.deepEqual(state.powers.map((power) => power.id), ['the-spark', 'light-throw']);
        assert.equal(state.powers[1].name, 'Light Throw');
    });

    it('stamps a created pressure with the message it was written beside', () => {
        const state = createState();
        const { log } = clocked();
        const citation = { index: 7, send_date: 99 };

        log.commit(state, 'arc.pressures.0.text', 'sleep is short', { citation });
        log.commit(state, 'arc.linesCrossed.0.line', 'lied', { citation });

        assert.equal(state.arc.pressures[0].since, 7);
        assert.deepEqual(state.arc.linesCrossed[0].msgId, citation);
    });
});

describe('her hand is a ruling', () => {
    const rulingsOf = (state) => state.rulings.filter((ruling) => ruling.action === 'written');

    it('writes the ruling at the first commit, naming the field and her words', () => {
        const state = spark();
        const { log } = clocked();

        log.commit(state, 'powers.the-spark.limits.0', 'cannot aim it');

        assert.deepEqual(rulingsOf(state).map(({ proposalId, summary, action, path }) => ({ proposalId, summary, action, path })), [{
            proposalId: 'hand:powers.the-spark.limits.0',
            summary: 'The Spark · Limit 1: cannot aim it',
            action: 'written',
            path: 'powers.the-spark.limits.0',
        }]);
    });

    it('amends the open ruling instead of adding a second', () => {
        const state = spark();
        const { clock, log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'first thought');
        clock.t += 5000;
        assert.equal(log.commit(state, 'powers.the-spark.capability', 'second thought'), 'amended');

        assert.equal(rulingsOf(state).length, 1);
        assert.equal(rulingsOf(state)[0].summary, 'The Spark · Capability: second thought');
        assert.equal(getPath(state, 'powers.the-spark.capability'), 'second thought');
    });

    it('drops the ruling when the field comes back to what it was before the first commit', () => {
        const state = spark();
        const { clock, log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'something else');
        clock.t += 1000;
        assert.equal(log.commit(state, 'powers.the-spark.capability', 'a small light'), 'reverted');

        assert.equal(rulingsOf(state).length, 0);
        assert.equal(getPath(state, 'powers.the-spark.capability'), 'a small light');
        assert.equal(log.isOpen('powers.the-spark.capability'), false);
    });

    it('writes a new ruling once the field has been quiet for the idle window', () => {
        const state = spark();
        const { clock, log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'first thought');
        clock.t += IDLE_MS + 1;
        assert.equal(log.commit(state, 'powers.the-spark.capability', 'second thought'), 'written');

        assert.deepEqual(rulingsOf(state).map((ruling) => ruling.summary), [
            'The Spark · Capability: first thought',
            'The Spark · Capability: second thought',
        ]);
    });

    it('still amends at exactly the idle window', () => {
        const state = spark();
        const { clock, log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'first thought');
        clock.t += IDLE_MS;

        assert.equal(log.commit(state, 'powers.the-spark.capability', 'second thought'), 'amended');
    });

    it('measures idle from the last commit, so steady editing never closes it', () => {
        const state = spark();
        const { clock, log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'one');
        for (const word of ['two', 'three', 'four']) {
            clock.t += IDLE_MS - 1000;
            assert.equal(log.commit(state, 'powers.the-spark.capability', word), 'amended');
        }
        assert.equal(rulingsOf(state).length, 1);
    });

    it('keeps one open ruling per field, so two fields do not amend each other', () => {
        const state = spark();
        const { log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'a');
        log.commit(state, 'powers.the-spark.stage', 'raw');

        assert.equal(rulingsOf(state).length, 2);
    });

    it('closes every open ruling on close(), so the next commit is a new one', () => {
        const state = spark();
        const { log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'first thought');
        assert.equal(log.isOpen('powers.the-spark.capability'), true);
        log.close();
        assert.equal(log.isOpen('powers.the-spark.capability'), false);
        assert.equal(log.commit(state, 'powers.the-spark.capability', 'second thought'), 'written');

        assert.equal(rulingsOf(state).length, 2);
    });

    it('writes a fresh ruling when the open one has left the window', () => {
        const state = spark();
        const { clock, log } = clocked();

        log.commit(state, 'powers.the-spark.capability', 'first thought');
        state.rulings.length = 0; // pruned, or the chat moved
        clock.t += 1000;

        assert.equal(log.commit(state, 'powers.the-spark.capability', 'second thought'), 'written');
        assert.equal(rulingsOf(state).length, 1);
    });

    it('says a cleared field was cleared', () => {
        const state = spark();
        const { log } = clocked();

        log.commit(state, 'powers.the-spark.capability', '');

        assert.equal(rulingsOf(state)[0].summary, 'The Spark · Capability: (cleared)');
    });

    it('does not touch a queue proposal\'s ruling on the same field', () => {
        const state = spark();
        const { log } = clocked();
        state.rulings.push({ proposalId: 'p1', summary: 'offered', action: 'applied', at: 1 });

        log.commit(state, 'powers.the-spark.capability', 'mine');

        assert.deepEqual(state.rulings.map((ruling) => ruling.action), ['applied', 'written']);
    });

    it('uses the real clock when it is not given one', () => {
        const state = spark();
        const log = createHandLog();

        assert.equal(log.commit(state, 'hero.name', 'Hailey Green'), 'written');
        assert.ok(Math.abs(state.rulings[0].at - Date.now()) < 5000);
    });
});
