import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyProposal, createState, getPath, migrate, SCHEMA_VERSION, setPath } from '../src/state.js';

describe('appetite state migration and authoring', () => {
    it('migrates a populated version-one ledger without rewriting its contents', () => {
        const old = createState({
            version: 1,
            hero: { name: 'Fixture hero' },
            powers: [{ id: 'p', capability: 'A recorded capability' }],
            arc: { phase: 'Recovery' },
            queue: [{ id: 'q', status: 'pending' }],
            history: [{ summary: 'Earlier ruling', at: 1 }],
            rulings: [{ action: 'dismissed', summary: 'Earlier proposal' }],
        });
        delete old.appetite;
        delete old.impulse;
        const snapshot = structuredClone(old);
        const loaded = migrate(JSON.parse(JSON.stringify(old)));
        assert.equal(loaded.version, SCHEMA_VERSION);
        assert.equal(loaded.appetite.want, '');
        assert.equal(loaded.appetite.firstTaste, '');
        assert.equal(loaded.impulse.status, 'inactive');
        for (const key of Object.keys(old).filter((key) => key !== 'version')) {
            assert.deepEqual(loaded[key], old[key], key);
        }
        assert.deepEqual(old, snapshot);
    });

    it('normalizes malformed current records without inventing history', () => {
        const state = migrate({
            version: SCHEMA_VERSION,
            appetite: { want: 'Protecting a connection', firstTaste: null, condition: 4, expression: 'Openly' },
            impulse: { text: 'Get home now', context: 'Someone there is in danger', status: 'bogus' },
        });
        assert.equal(state.appetite.firstTaste, '');
        assert.equal(state.appetite.condition, '');
        assert.equal(state.appetite.expression, 'Openly');
        assert.equal(state.impulse.text, 'Get home now');
        assert.equal(state.impulse.status, 'inactive');
        assert.equal(createState({ appetite: [], impulse: 'no record' }).impulse.status, 'inactive');
        assert.equal(createState({ appetite: Object.create({ want: 'Inherited interpretation' }) }).appetite.want, '');
    });

    it('uses the existing provenance gate to keep, rephrase or refuse appetite changes', () => {
        const state = createState();
        const proposed = {
            origin: 'evaluation', summary: 'An existing attachment', evidence: [],
            changes: [{ path: 'appetite.want', from: '', to: 'Being there for someone' }],
        };
        assert.equal(state.appetite.want, ''); // a proposal alone approves nothing
        assert.equal(applyProposal(state, proposed, { at: 10 }).length, 1);
        assert.equal(state.appetite.firstTaste, '');
        setPath(state, 'appetite.want', 'Keeping a connection alive');
        assert.deepEqual(applyProposal(state, proposed), []);
        assert.equal(state.appetite.want, 'Keeping a connection alive');
        assert.equal(state.history[0].origin, 'evaluation');
        assert.equal(state.history[0].at, 10);
        assert.equal(getPath(state, 'appetite.firstTaste'), '');
    });

    it('persists manual impulse overrides and transitions without satisfying appetite', () => {
        const state = createState({ appetite: { want: 'Connection', condition: 'Hungry' } });
        const appetite = structuredClone(state.appetite);
        applyProposal(state, {
            origin: 'manual', summary: 'Reach home during the robbery', evidence: [],
            changes: [
                { path: 'impulse.text', from: '', to: 'Get home now' },
                { path: 'impulse.context', from: '', to: 'Someone there is in danger; the robbery blocks the way' },
                { path: 'impulse.status', from: 'inactive', to: 'active' },
            ],
        });
        for (const status of ['suspended', 'active', 'satisfied']) {
            setPath(state, 'impulse.status', status);
            const loaded = migrate(JSON.parse(JSON.stringify(state)));
            assert.equal(loaded.impulse.status, status);
            assert.equal(loaded.impulse.text, 'Get home now');
            assert.deepEqual(loaded.appetite, appetite);
        }
        setPath(state, 'impulse.text', '');
        assert.equal(state.impulse.status, 'inactive');
        assert.throws(() => setPath(state, 'impulse.status', 'active'), /needs direction/);
        assert.equal(state.impulse.status, 'inactive');
        assert.deepEqual(state.appetite, appetite);
    });

    it('rejects malformed and prototype-traversing paths for the new records', () => {
        const state = createState();
        for (const path of ['appetite', 'appetite.extra', 'appetite.want.deep', 'appetite..want',
            'appetite.__proto__.sidekickAppetiteTest', 'impulse.constructor.prototype.sidekickAppetiteTest']) {
            assert.throws(() => setPath(state, path, 'injected'), /invalid appetite or impulse field/);
        }
        assert.throws(() => setPath(state, 'appetite.want', []), /invalid appetite or impulse field/);
        assert.throws(() => setPath(state, 'impulse.status', 'expired'), /invalid appetite or impulse field/);
        const unsafe = JSON.parse('{"want":"Connection","__proto__":{"sidekickAppetiteTest":"injected"}}');
        assert.equal(createState({ appetite: unsafe }).appetite.want, 'Connection');
        assert.equal(Object.prototype.sidekickAppetiteTest, undefined);
    });

    it('keeps separate chats and future-version data independent', () => {
        const first = createState({ appetite: { want: 'Connection' } });
        const second = createState();
        setPath(first, 'appetite.want', 'Belonging');
        assert.equal(second.appetite.want, '');
        const future = { version: SCHEMA_VERSION + 1, appetite: { later: 'Preserve this' } };
        assert.deepEqual(migrate(future), future);
    });
});
