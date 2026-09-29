import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isEmptyRow, sheetGroups } from '../src/sheet.js';
import { createState, setPath } from '../src/state.js';

const group = (state, id) => sheetGroups(state).find((one) => one.id === id);
const rowOf = (card, path) => card.rows.find((row) => row.path === path);

function written() {
    return createState({
        hero: { name: 'Hailey', codename: 'Glint', statusQuo: 'assumed unmanifested' },
        cosmology: { sources: ['a debt'], stageVocabulary: [], costVocabulary: ['sleep'], taboos: '' },
        powers: [
            { id: 'the-spark', name: 'The Spark', stage: 'raw', capability: 'a small light', limits: ['no control', '', 'daylight'], costs: [] },
            // the shape state.js makes for a power nobody has written in yet
            { id: 'bare', name: '', capability: '', limits: [], costs: [], stage: '', history: [] },
        ],
        arc: {
            phase: 'first week',
            threads: [
                { id: 'the-debt', text: 'owes a favour', lastTouched: 1_700_000_000_000 },
                { id: 'quiet', text: 'a rumour' },
            ],
            pressures: [
                { text: 'sleep is short', denialCount: 1 },
                { text: 'cornered', denialCount: 3 },
                { text: 'calm', denialCount: 0 },
            ],
            linesCrossed: [{ line: 'lied', provides: 'time', cost: '', msgId: { index: 4, send_date: 9 } }, { line: 'ran' }],
        },
    });
}

describe('sheetGroups', () => {
    it('has nothing to draw without a ledger', () => {
        assert.equal(sheetGroups(null), null);
        assert.equal(sheetGroups(undefined), null);
        assert.equal(sheetGroups('a ledger'), null);
    });

    it('still draws an empty ledger, as collapsed slots she can write into', () => {
        const groups = sheetGroups(createState());

        assert.deepEqual(groups.map((one) => one.id), ['hero', 'powers', 'arc', 'cosmology']);
        assert.ok(groups[0].cards[0].rows.every(isEmptyRow));
        assert.equal(groups[1].cards.length, 0);
        assert.deepEqual(groups[1].adds, [{ noun: 'power', path: 'powers' }]);
        assert.deepEqual(groups[2].cards.map((card) => card.id), ['phase']);
        assert.ok(groups[3].cards[0].rows.every(isEmptyRow));
    });

    it('reads a state with none of its parts as empty rather than throwing', () => {
        const groups = sheetGroups({});

        assert.equal(groups.length, 4);
        assert.equal(groups[1].cards.length, 0);
        assert.equal(rowOf(groups[0].cards[0], 'hero.name').value, '');
    });

    it('gives the hero card its three fields in reading order', () => {
        const card = group(written(), 'hero').cards[0];

        assert.deepEqual(card.rows.map((row) => [row.style, row.path, row.value]), [
            ['title', 'hero.name', 'Hailey'],
            ['meta', 'hero.codename', 'Glint'],
            ['text', 'hero.statusQuo', 'assumed unmanifested'],
        ]);
    });

    it('makes one card per power, empty ones included', () => {
        const cards = group(written(), 'powers').cards;

        assert.deepEqual(cards.map((card) => card.id), ['power:the-spark', 'power:bare']);
        const bare = cards[1];
        assert.ok(bare.rows.every(isEmptyRow), 'a power nobody has written in is all slots');
    });

    it('lists limits and costs by their own index, and skips a blank without renumbering', () => {
        const spark = group(written(), 'powers').cards[0];
        const limits = spark.rows.find((row) => row.label === 'Limits');

        assert.deepEqual(limits.items, [
            { path: 'powers.the-spark.limits.0', value: 'no control' },
            { path: 'powers.the-spark.limits.2', value: 'daylight' },
        ]);
        assert.equal(limits.addPath, 'powers.the-spark.limits.3');
        assert.equal(limits.noun, 'limit');
    });

    it('offers the first cost at index 0 when there are none', () => {
        const costs = group(written(), 'powers').cards[0].rows.find((row) => row.label === 'Costs');

        assert.deepEqual(costs.items, []);
        assert.equal(costs.addPath, 'powers.the-spark.costs.0');
        assert.equal(isEmptyRow(costs), true);
    });

    it('reads a list that is not a list as an empty one', () => {
        const state = createState({ powers: [{ id: 'bare', limits: 'not a list' }] });
        const limits = group(state, 'powers').cards[0].rows.find((row) => row.label === 'Limits');

        assert.deepEqual(limits.items, []);
        assert.equal(limits.addPath, 'powers.bare.limits.0');
    });

    it('starts the arc with a phase card and adds a card per thread, pressure and line', () => {
        const cards = group(written(), 'arc').cards;

        assert.deepEqual(cards.map((card) => card.id), [
            'phase', 'thread:the-debt', 'thread:quiet', 'pressure:0', 'pressure:1', 'pressure:2', 'line:0', 'line:1',
        ]);
        assert.deepEqual(cards.map((card) => card.caption), [
            'Phase', 'Thread', 'Thread', 'Pressure', 'Pressure', 'Pressure', 'Line crossed', 'Line crossed',
        ]);
    });

    it('offers the three entries the arc can grow', () => {
        assert.deepEqual(group(written(), 'arc').adds.map((add) => add.noun), ['thread', 'pressure', 'line crossed']);
    });

    it('notes when a thread was last touched, and says nothing when it never was', () => {
        const [touched, untouched] = group(written(), 'arc').cards.filter((card) => card.id.startsWith('thread'));

        assert.equal(touched.rows.filter((row) => row.style === 'note').length, 1);
        assert.equal(untouched.rows.filter((row) => row.style === 'note').length, 0);
    });

    it('notes a pressure\'s denials in the singular, the plural, and not at all', () => {
        const notes = group(written(), 'arc').cards
            .filter((card) => card.id.startsWith('pressure'))
            .map((card) => card.rows.find((row) => row.style === 'note')?.value);

        assert.deepEqual(notes, ['denied 1 time', 'denied 3 times', undefined]);
    });

    it('gives a crossed line its three fields, and the message it was born at', () => {
        const [first, second] = group(written(), 'arc').cards.filter((card) => card.id.startsWith('line'));

        assert.deepEqual(first.rows.map((row) => [row.path, row.label, row.value]), [
            ['arc.linesCrossed.0.line', 'Line', 'lied'],
            ['arc.linesCrossed.0.provides', 'Provides', 'time'],
            ['arc.linesCrossed.0.cost', 'Cost', ''],
        ]);
        assert.deepEqual(first.cite, { citation: { index: 4, send_date: 9 } });
        assert.equal(second.cite, undefined);
    });

    it('draws the setting as its own card, empty parts included', () => {
        const rows = group(written(), 'cosmology').cards[0].rows;

        assert.deepEqual(rows.map((row) => [row.path ?? row.addPath, isEmptyRow(row)]), [
            ['cosmology.sources.1', false],
            ['cosmology.stageVocabulary.0', true],
            ['cosmology.costVocabulary.1', false],
            ['cosmology.taboos', true],
        ]);
    });

    it('ignores an entry that is not an object, and an id that is not written', () => {
        const state = createState({ powers: [null, { name: 'Nameless id' }], arc: { threads: [null, { text: 'no id' }] } });

        // a null at 0 must not renumber what follows: a path counts the stored list
        assert.deepEqual(group(state, 'powers').cards.map((card) => card.id), ['power:1']);
        assert.equal(rowOf(group(state, 'powers').cards[0], 'powers.1.name').value, 'Nameless id');
        assert.equal(group(state, 'arc').cards.find((card) => card.caption === 'Thread').rows[0].path, 'arc.threads.1.text');
    });

    it('trims what is written, so a field of spaces is empty', () => {
        const state = createState({ hero: { name: '   ', codename: ' Glint ', statusQuo: '' } });
        const [name, codename] = group(state, 'hero').cards[0].rows;

        assert.equal(isEmptyRow(name), true);
        assert.equal(codename.value, 'Glint');
    });

    it('treats a field that is not a string as nothing written', () => {
        const state = createState({ hero: { name: 42 } });

        assert.equal(rowOf(group(state, 'hero').cards[0], 'hero.name').value, '');
    });
});

describe('the Sheet offers exactly the slots the path grammar allows', () => {
    it('never names a path the ledger would call dead', () => {
        const state = written();
        const paths = [];
        for (const one of sheetGroups(state)) {
            for (const card of one.cards) {
                for (const row of card.rows) {
                    if (row.style === 'list') {
                        paths.push(row.addPath, ...row.items.map((item) => item.path));
                    } else if (row.path) {
                        paths.push(row.path);
                    }
                }
            }
        }

        assert.ok(paths.length > 30, 'the walk found the slots');
        for (const path of paths) {
            assert.doesNotThrow(() => setPath(structuredClone(state), path, 'x'), path);
        }
    });

    it('offers the same slots on an empty ledger', () => {
        const empty = createState();
        for (const one of sheetGroups(empty)) {
            for (const card of one.cards) {
                for (const row of card.rows) {
                    const path = row.style === 'list' ? row.addPath : row.path;
                    assert.doesNotThrow(() => setPath(structuredClone(empty), path, 'x'), path);
                }
            }
        }
    });
});

describe('isEmptyRow', () => {
    it('is empty for a blank field and for a list with no items', () => {
        assert.equal(isEmptyRow({ style: 'text', value: '' }), true);
        assert.equal(isEmptyRow({ style: 'list', items: [] }), true);
    });

    it('is not empty once something is written', () => {
        assert.equal(isEmptyRow({ style: 'text', value: 'x' }), false);
        assert.equal(isEmptyRow({ style: 'list', items: [{ path: 'a', value: 'x' }] }), false);
    });
});
