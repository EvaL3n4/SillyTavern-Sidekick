import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SCAN_SYSTEM_PROMPT, SCAN_BEGIN_PROMPT, SCAN_HEADINGS, SCAN_REPLY_PROMPT } from '../src/scan-prompt.js';
import { PROPOSAL_SCHEMA } from '../src/evaluate.js';
import { createState, getPath, setPath } from '../src/state.js';

/**
 * The prompt is hand-edited prose, so the parts of it that are promises to the
 * gate are checked against the gate: a path the prompt teaches has to be one
 * state.js accepts, or the DM's tuning silently costs her proposals.
 */
describe('the scan prompt keeps its promises to the gate', () => {
    /** Every dotted path the grammar block names, with <id> and <n> filled in. */
    function documentedPaths() {
        const block = SCAN_SYSTEM_PROMPT.split('dot path from the ledger root:')[1].split('<id> is a')[0];
        const roots = block.match(/\b(?:hero|powers|arc)\.[\w<>.]+/g) ?? [];
        const paths = new Set();
        for (const root of roots) {
            // ".capability, .stage" and ".provides, .cost" are shorthand for a sibling of the
            // path just before them, so take the stem up to its last "<id>." or "<n>."
            paths.add(root);
        }
        for (const line of block.split('\n')) {
            const stem = /(powers\.<id>|arc\.linesCrossed\.<n>)/.exec(line)?.[1];
            for (const field of line.match(/\s\.(\w+)/g) ?? []) {
                if (stem) paths.add(`${stem}${field.trim()}`);
            }
        }
        return [...paths]
            .map((path) => path.replace(/[.;,]+$/, '').replace('<id>', 'the-spark').replace('<n>', '0'))
            .filter((path) => path.split('.').length > 1);
    }

    test('names the paths it teaches', () => {
        const paths = documentedPaths();
        for (const expected of [
            'hero.name',
            'hero.statusQuo',
            'powers.the-spark.capability',
            'powers.the-spark.limits.0',
            'arc.phase',
            'arc.threads.the-spark.text',
            'arc.pressures.0.text',
            'arc.linesCrossed.0.cost',
        ]) {
            assert.ok(paths.includes(expected), `the grammar block no longer teaches ${expected}`);
        }
    });

    test('every path it teaches is one the ledger will write', () => {
        for (const path of documentedPaths()) {
            const state = createState();
            assert.doesNotThrow(() => setPath(state, path, 'x'), `${path} is a dead path`);
            assert.equal(getPath(state, path), 'x', path);
        }
    });

    test('its worked example is valid JSON in the shape the schema asks for', () => {
        const example = /\{"path": .*\}/.exec(SCAN_SYSTEM_PROMPT)?.[0];
        assert.ok(example, 'the worked example is gone');
        const change = JSON.parse(example);
        const keys = Object.keys(PROPOSAL_SCHEMA.value.properties.proposals.items.properties.changes.items.properties);
        assert.deepEqual(Object.keys(change).sort(), [...keys].sort());
        assert.notEqual(change.to, '', '"to" is never empty');
        const state = createState({ powers: [{ id: 'the-spark', limits: [] }] });
        setPath(state, change.path, change.to);
        assert.equal(getPath(state, change.path), change.to);
    });

    test('speaks the schema\'s field names', () => {
        const proposal = PROPOSAL_SCHEMA.value.properties.proposals.items.properties;
        assert.ok('source' in proposal, 'the schema lost the field the begin brief sets');
        assert.match(SCAN_BEGIN_PROMPT, /"source": "card"/);
        assert.match(SCAN_REPLY_PROMPT, /\{"proposals": \[\]\}/);
    });

    test('has five distinct headings for the user half', () => {
        const headings = Object.values(SCAN_HEADINGS);
        assert.equal(headings.length, 5);
        assert.equal(new Set(headings).size, 5);
        for (const heading of headings) {
            assert.match(heading, /^## \S/);
        }
    });
});
