import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    RULING_WINDOW,
    SCHEMA_VERSION,
    applyProposal,
    createState,
    getPath,
    loadState,
    migrate,
    recordRuling,
    setPath,
    pruneRulings,
} from '../src/state.js';

describe('createState', () => {
    it('starts at the current schema version with empty collections', () => {
        const state = createState();
        assert.equal(state.version, SCHEMA_VERSION);
        assert.deepEqual(state.powers, []);
        assert.deepEqual(state.history, []);
        assert.deepEqual(state.rulings, []);
        assert.equal(state.settings.evaluationCadence, 15);
        assert.equal(state.settings.digestBudgetTokens, 200);
    });

    it('accepts overrides without dropping sibling defaults', () => {
        const state = createState({ hero: { name: 'Hailey' } });
        assert.equal(state.hero.name, 'Hailey');
        assert.equal(state.hero.codename, '');
        assert.equal(state.hero.statusQuo, '');
    });

    it('merges a partial override into its siblings instead of replacing them', () => {
        // a shallow spread would silently blank these
        const state = createState({
            hero: { name: 'Hailey' },
            arc: { phase: 'rising', threads: [] },
            settings: { digestBudgetTokens: 100 },
        });

        assert.equal(state.hero.codename, '');
        assert.deepEqual(state.arc.pressures, []);
        assert.deepEqual(state.arc.linesCrossed, []);
        assert.equal(state.arc.phase, 'rising');
        // settings the override did not mention survive
        assert.equal(state.settings.evaluationCadence, 15);
        assert.equal(state.settings.digestBudgetTokens, 100);
    });

    it('replaces arrays wholesale rather than merging into them', () => {
        const state = createState({ powers: [{ id: 'p1' }] });
        assert.equal(state.powers.length, 1);
        assert.equal(state.powers[0].id, 'p1');
    });
});

describe('migrate', () => {
    it('returns a fresh state for nothing at all', () => {
        assert.equal(loadState(null).version, SCHEMA_VERSION);
        assert.equal(loadState(undefined).version, SCHEMA_VERSION);
        assert.equal(loadState(42).version, SCHEMA_VERSION);
    });

    it('fills a pre-schema blob with defaults without discarding what it had', () => {
        const legacy = { hero: { name: 'Hailey' }, powers: [] };
        const state = migrate(legacy);

        assert.equal(state.version, SCHEMA_VERSION);
        assert.equal(state.hero.name, 'Hailey');
        assert.deepEqual(state.arc, { phase: '', threads: [], pressures: [], linesCrossed: [] });
        assert.deepEqual(state.rulings, []);
        assert.equal(state.settings.evaluationCadence, 15);
    });

    it('repairs broken nested fields rather than trusting them', () => {
        const broken = { arc: { threads: 'not-an-array', phase: 'rising' }, powers: 'nope' };
        const state = migrate(broken);

        assert.deepEqual(state.arc.threads, []);
        assert.deepEqual(state.powers, []);
        assert.equal(state.arc.phase, 'rising');
    });

    it('does not mutate the state it was handed', () => {
        const source = { hero: { name: 'Hailey' } };
        const snapshot = structuredClone(source);
        migrate(source);
        assert.deepEqual(source, snapshot);
    });
});

describe('paths', () => {
    it('walks objects, arrays by index, and powers by id', () => {
        const state = createState({
            hero: { name: 'Hailey' },
            powers: [{ id: 'the-spark', name: 'the Spark', limits: ['a', 'b'] }],
        });

        assert.equal(getPath(state, 'hero.name'), 'Hailey');
        assert.equal(getPath(state, 'powers.the-spark.limits.1'), 'b');
        assert.equal(getPath(state, 'powers.nope.limits.0'), undefined);
    });

    it('writes through the same grammar', () => {
        const state = createState({ powers: [{ id: 'the-spark', limits: ['a'] }] });
        setPath(state, 'powers.the-spark.limits.0', 'z');
        assert.equal(getPath(state, 'powers.the-spark.limits.0'), 'z');
    });

    it('throws on a dead segment instead of silently no-opting', () => {
        const state = createState();
        assert.throws(() => setPath(state, 'powers.ghost.limits.0', 'x'), /dead path segment/);
    });
});

describe('applyProposal', () => {
    const power = () => ({ id: 'the-spark', name: 'the Spark', capability: 'the force', limits: ['no control'], costs: [], history: [] });

    function seeded() {
        const state = createState({ powers: [power()] });
        return state;
    }

    const proposal = {
        origin: 'evaluation',
        summary: 'the spark has a second limit',
        evidence: [12, 14],
        changes: [{ path: 'powers.the-spark.limits.0', from: 'no control', to: 'unfocused it takes everything from the waist down' }],
    };

    it('applies a change and records provenance for it', () => {
        const state = seeded();
        const at = 1700000000000;
        const [event] = applyProposal(state, proposal, { at });

        assert.equal(getPath(state, 'powers.the-spark.limits.0'), 'unfocused it takes everything from the waist down');
        assert.equal(event.summary, proposal.summary);
        assert.equal(event.origin, 'evaluation');
        assert.equal(event.at, at);
        assert.deepEqual(event.evidence, [12, 14]);
        assert.deepEqual(event.changes, [{
            path: 'powers.the-spark.limits.0',
            from: 'no control',
            to: 'unfocused it takes everything from the waist down',
        }]);
    });

    it('mirrors the event into the touched power history', () => {
        const state = seeded();
        applyProposal(state, proposal, { at: 1 });
        assert.equal(state.powers[0].history.length, 1);
        assert.equal(state.powers[0].history[0], state.history[0]);
    });

    it('does not mirror into a power the path never touched', () => {
        const state = createState({
            powers: [power()],
            arc: { phase: 'a', threads: [], pressures: [], linesCrossed: [] },
        });
        applyProposal(state, {
            origin: 'evaluation',
            summary: 'phase moved',
            changes: [{ path: 'arc.phase', from: 'a', to: 'b' }],
        }, { at: 1 });
        assert.deepEqual(state.powers[0].history, []);
    });

    it('skips a change whose from no longer matches what is stored', () => {
        const state = seeded();
        setPath(state, 'powers.the-spark.limits.0', 'the DM reworded it');

        const applied = applyProposal(state, proposal, { at: 1 });

        assert.deepEqual(applied, []);
        assert.equal(getPath(state, 'powers.the-spark.limits.0'), 'the DM reworded it');
        assert.deepEqual(state.history, []);
        assert.deepEqual(state.powers[0].history, []);
    });

    it('applies a change with no from, and records the value it displaced', () => {
        const state = seeded();
        const [event] = applyProposal(state, {
            origin: 'manual',
            summary: 'seeded',
            changes: [{ path: 'powers.the-spark.costs.0', to: 'cracked asphalt' }],
        }, { at: 1 });

        // costs started empty, so the event records '' rather than undefined
        assert.equal(event.changes[0].from, '');
        assert.equal(getPath(state, 'powers.the-spark.costs.0'), 'cracked asphalt');
    });
    it('applies each good change and leaves the stale one alone', () => {
        const state = seeded();
        const applied = applyProposal(state, {
            origin: 'evaluation',
            summary: 'mixed batch',
            changes: [
                { path: 'powers.the-spark.limits.0', from: 'no control', to: 'first' },
                { path: 'powers.the-spark.limits.0', from: 'stale', to: 'never' },
                { path: 'powers.the-spark.costs.0', to: 'witnesses' },
            ],
        }, { at: 1 });

        assert.equal(applied.length, 2);
        assert.equal(getPath(state, 'powers.the-spark.limits.0'), 'first');
        assert.equal(getPath(state, 'powers.the-spark.costs.0'), 'witnesses');
    });
});

describe('recordRuling', () => {
    const ruling = (n) => ({
        proposalId: `p${n}`,
        summary: `proposal ${n}`,
        action: 'applied',
        at: n,
    });

    it('keeps the edit when the DM reworded one, and omits the key when they did not', () => {
        const state = createState();

        recordRuling(state, ruling(1));
        recordRuling(state, { ...ruling(2), action: 'edited', edit: 'her phrasing' });

        assert.deepEqual(state.rulings[0], { proposalId: 'p1', summary: 'proposal 1', action: 'applied', at: 1 });
        assert.equal(state.rulings[1].edit, 'her phrasing');
        assert.ok(!('edit' in state.rulings[0]));
    });

    it('holds the window and drops the oldest rulings first', () => {
        const state = createState();
        for (let n = 1; n <= RULING_WINDOW + 5; n += 1) {
            recordRuling(state, ruling(n));
        }

        assert.equal(state.rulings.length, RULING_WINDOW);
        assert.equal(state.rulings[0].proposalId, 'p6');
        assert.equal(state.rulings.at(-1).proposalId, `p${RULING_WINDOW + 5}`);
    });

    it('prunes an already-overfull window down to the cap', () => {
        // a state that arrived over the cap, not one that grew into it
        const state = createState({
            rulings: Array.from({ length: RULING_WINDOW + 3 }, (_, i) => ruling(i + 1)),
        });

        const dropped = pruneRulings(state);

        assert.equal(dropped.length, 3);
        assert.equal(state.rulings.length, RULING_WINDOW);
        assert.equal(state.rulings[0].proposalId, 'p4');
    });
    it('returns what fell out of the window, and nothing while it still has room', () => {
        const small = createState();
        assert.deepEqual(recordRuling(small, ruling(1)), []);

        const full = createState();
        for (let n = 1; n <= RULING_WINDOW; n += 1) {
            recordRuling(full, ruling(n));
        }
        const dropped = recordRuling(full, ruling(RULING_WINDOW + 1));

        assert.equal(dropped.length, 1);
        assert.equal(dropped[0].proposalId, 'p1');
        assert.equal(full.rulings[0].proposalId, 'p2');
    });
});
