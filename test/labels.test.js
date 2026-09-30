import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { labelChange } from '../src/labels.js';
import { createState } from '../src/state.js';

const state = createState({
    powers: [{ id: 'the-spark', name: 'The Spark', limits: ['no control'] }],
    arc: {
        threads: [{ id: 'the-debt', text: 'She owes the dockmaster a favour she cannot repay in kind' }],
        pressures: [{ text: 'denials mount' }],
        linesCrossed: [{ line: 'lied to a friend', provides: '', cost: '' }],
    },
});

const label = (path, changes) => labelChange(state, { path }, changes);

describe('labelChange', () => {
    it('names the hero fields', () => {
        assert.equal(label('hero.name'), 'Hero · Name');
        assert.equal(label('hero.codename'), 'Hero · Codename');
        assert.equal(label('hero.statusQuo'), 'Hero · Status quo');
    });

    it('names a power by its name and counts a list from 1', () => {
        assert.equal(label('powers.the-spark.capability'), 'The Spark · Capability');
        assert.equal(label('powers.the-spark.stage'), 'The Spark · Stage');
        assert.equal(label('powers.the-spark.name'), 'The Spark · Name');
        assert.equal(label('powers.the-spark.limits.0'), 'The Spark · Limit 1');
        assert.equal(label('powers.the-spark.costs.2'), 'The Spark · Cost 3');
    });

    it('names appetite and impulse fields without treating arbitrary keys as fields', () => {
        for (const [key, name] of Object.entries({ want: 'Want', firstTaste: 'First taste', condition: 'Condition', expression: 'Expression', residue: 'Residue' })) {
            assert.equal(label(`appetite.${key}`), `Appetite · ${name}`);
        }
        for (const [key, name] of Object.entries({ text: 'Direction', context: 'Why now', status: 'State' })) {
            assert.equal(label(`impulse.${key}`), `Impulse · ${name}`);
        }
        for (const path of ['appetite.constructor', 'appetite.want.extra', 'impulse.__proto__', 'impulse.text.extra']) {
            assert.equal(label(path), path);
        }
    });

    it('says a power is new, by the name the same proposal gives it', () => {
        const changes = [
            { path: 'powers.light-throw.name', to: 'Throw Light' },
            { path: 'powers.light-throw.capability', to: 'she can throw light' },
        ];
        assert.equal(label('powers.light-throw.capability', changes), 'New power: Throw Light · Capability');
        assert.equal(label('powers.light-throw.name', changes), 'New power: Throw Light · Name');
    });

    it('falls back to the slug, made readable, when nothing names a new power', () => {
        assert.equal(label('powers.light-speed-shear.limits.0'), 'New power: Light Speed Shear · Limit 1');
    });

    it('lets the ledger name a power over a sibling that renames it', () => {
        const changes = [{ path: 'powers.the-spark.name', to: 'Sparkle' }];
        assert.equal(label('powers.the-spark.capability', changes), 'The Spark · Capability');
    });

    it('names a thread by what it says, and a new one as new', () => {
        assert.equal(label('arc.threads.the-debt.text'), 'Thread “She owes the dockmaster a favour…”');
        assert.equal(label('arc.threads.the-rival.text'), 'New thread');
    });

    it('cuts a long word with no space to cut at, instead of losing it', () => {
        const long = createState({ arc: { threads: [{ id: 't', text: 'x'.repeat(50) }] } });
        assert.equal(labelChange(long, { path: 'arc.threads.t.text' }), `Thread “${'x'.repeat(32)}…”`);
    });

    it('keeps a short thread whole and survives one with no text', () => {
        const short = createState({ arc: { threads: [{ id: 't', text: 'short' }, { id: 'u' }] } });
        assert.equal(labelChange(short, { path: 'arc.threads.t.text' }), 'Thread “short”');
        assert.equal(labelChange(short, { path: 'arc.threads.u.text' }), 'Thread “”');
    });

    it('numbers pressures and lines, and says the next one is new', () => {
        assert.equal(label('arc.pressures.0.text'), 'Pressure 1');
        assert.equal(label('arc.pressures.1.text'), 'New pressure');
        assert.equal(label('arc.linesCrossed.0.provides'), 'Line crossed 1 · Provides');
        assert.equal(label('arc.linesCrossed.1.line'), 'New line crossed · Line');
        assert.equal(label('arc.linesCrossed.1.cost'), 'New line crossed · Cost');
    });

    it('names the phase and the cosmology', () => {
        assert.equal(label('arc.phase'), 'Arc · Phase');
        assert.equal(label('cosmology.taboos'), 'Cosmology · Taboos');
        assert.equal(label('cosmology.sources.0'), 'Cosmology · Source 1');
        assert.equal(label('cosmology.stageVocabulary.1'), 'Cosmology · Stage word 2');
        assert.equal(label('cosmology.costVocabulary.0'), 'Cosmology · Cost word 1');
    });

    it('gives a path that is none of the ledger\'s own back as itself', () => {
        for (const path of [
            'hero.age',
            'hero.name.first',
            'hero',
            'powers',
            'powers.the-spark',
            'powers.the-spark.constructor',
            'powers.the-spark.limits',
            'powers.the-spark.limits.x',
            'powers.the-spark.name.extra',
            'arc.threads.the-debt.title',
            'arc.threads.text',
            'arc.pressures.x.text',
            'arc.pressures.0.since',
            'arc.linesCrossed.0.msgId',
            'arc.phase.now',
            'arc.unknown',
            'cosmology.taboos.0',
            'cosmology.sources',
            'cosmology.sources.x',
            'settings.evaluationCadence',
        ]) {
            assert.equal(label(path), path, path);
        }
    });

    it('survives no state, no siblings and no path', () => {
        assert.equal(labelChange(null, { path: 'powers.the-spark.limits.0' }), 'New power: The Spark · Limit 1');
        assert.equal(labelChange(null, { path: 'arc.threads.a.text' }), 'New thread');
        assert.equal(labelChange(null, { path: 'arc.pressures.0.text' }), 'New pressure');
        assert.equal(labelChange(state, { path: 'hero.name' }, null), 'Hero · Name');
        assert.equal(labelChange(state, {}), '');
        assert.equal(labelChange(state, undefined), '');
    });
});
