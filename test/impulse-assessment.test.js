import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createState, SCHEMA_VERSION } from '../src/state.js';
import { assessImpulse, buildImpulsePrompt, impulseScene, readImpulseResult,
    IMPULSE_SCENE_CHARS, IMPULSE_TIMEOUT_MS, IMPULSE_SCHEMA } from '../src/impulse-assessment.js';

const hero = 'Bench hero';
const chat = [
    { name: 'DM', is_user: true, mes: 'The bank is being robbed. Her brother is home alone during a storm.' },
    { name: hero, is_user: false, mes: 'She looks for a way past the blocked exit to get home.' },
];
const want = 'Protecting the people who rely on her';
const state = () => createState({ appetite: { want } });
const result = (overrides = {}) => ({
    decision: 'replace', text: 'Get home now; her brother needs her.',
    context: 'The robbery blocks the way while her brother is alone in the storm.',
    target: 'Her brother at home', connection: want, evidence: [0, 1], ...overrides,
});

describe('scene impulse assessment', () => {
    it('selects an urgent scene want without changing approved appetite or another ledger field', async () => {
        const ledger = state();
        const before = structuredClone(ledger);
        const impulse = await assessImpulse(ledger, { chat, character: hero, generate: async args => {
            assert.equal(args.responseLength, 512);
            assert.equal(args.jsonSchema, IMPULSE_SCHEMA);
            assert.match(args.prompt, /Her brother is home alone/i);
            assert.match(args.prompt, /Protecting the people/);
            assert.match(args.systemPrompt, /never decides success/);
            assert.match(args.systemPrompt, /Never assign or predict the DM/);
            return JSON.stringify(result());
        } });
        assert.equal(impulse.text, result().text);
        assert.equal(impulse.status, 'active');
        assert.deepEqual(ledger, before);
    });

    it('keeps the same concrete want across obstacles and recognizes fulfillment separately from appetite', async () => {
        const ledger = state();
        ledger.impulse = { text: result().text, context: result().context, status: 'active' };
        for (const line of ['The exit is barred; she searches the back hall.', 'She bargains for passage.', 'She reaches the street and runs.']) {
            const reply = { name: hero, mes: line };
            const next = await assessImpulse(ledger, { chat: [...chat, reply], character: hero,
                generate: async () => JSON.stringify(result({ decision: 'retain', context: line, evidence: [2] })) });
            assert.equal(next.text, ledger.impulse.text);
            assert.equal(next.status, 'active');
            ledger.impulse = next;
        }
        const satisfied = await assessImpulse(ledger, {
            chat: [...chat, { name: hero, mes: 'She reaches home and finds her brother safe.' }], character: hero,
            generate: async () => JSON.stringify(result({ decision: 'satisfied', context: 'She has reached home.', evidence: [2] })),
        });
        assert.equal(satisfied.status, 'satisfied');
        assert.equal(ledger.appetite.want, want);
    });

    it('allows a quiet impulse without inventing deprivation or escalation', async () => {
        const quiet = [{ name: hero, mes: 'Everyone is safe. She and her brother sit together after the ordeal.' }];
        const selected = await assessImpulse(state(), { chat: quiet, character: hero, generate: async ({ systemPrompt }) => {
            assert.match(systemPrompt, /Downtime is valid/);
            assert.match(systemPrompt, /Do not invent danger/);
            return JSON.stringify(result({ text: 'Stay beside her brother and rest.',
                context: 'Everyone is safe; company and recovery are enough.', evidence: [0] }));
        } });
        assert.equal(selected.text, 'Stay beside her brother and rest.');
    });

    it('does not call a provider without appetite, during a manual pause, without a scene or on future state', async () => {
        const generate = () => { throw new Error('Must not call'); };
        for (const ledger of [null, createState(), createState({ version: SCHEMA_VERSION + 1, appetite: { want } }),
            createState({ appetite: { want }, impulse: { text: 'Stay home', status: 'suspended' } })]) {
            assert.equal(await assessImpulse(ledger, { chat, character: hero, generate }), null);
        }
        for (const character of [undefined, '', '   ', 5]) {
            assert.equal(await assessImpulse(state(), { chat, character, generate }), null);
        }
        assert.equal(await assessImpulse(state(), { chat: [], character: hero, generate }), null);
        assert.equal(await assessImpulse(state(), { chat, character: hero, generate: async () => JSON.stringify(result({
            decision: 'none', text: '', context: '', target: '', connection: '', evidence: [],
        })) }), null);
    });

    it('bounds very large scene replies and appetite prose, omits digest evidence and preserves shown indices', () => {
        assert.deepEqual(impulseScene(null), []);
        assert.deepEqual(impulseScene([null, {}, { mes: '  ' }]), []);
        const entries = Array.from({ length: 50 }, (_, i) => ({ name: hero, mes: `played ${i}` }));
        entries.push({ name: 'Sidekick', mes: 'MUST NOT READ DIGEST', extra: { sidekick: true } });
        assert.equal(impulseScene(entries)[0].index, 20);
        assert.ok(!impulseScene(entries).some(({ line }) => line.includes('MUST NOT READ')));
        const huge = impulseScene([{ mes: 'earlier' }, { name: 'n'.repeat(200), mes: 'x'.repeat(100_000) + 'LATEST' }]);
        assert.equal(huge.length, 1);
        assert.ok(huge[0].line.endsWith('LATEST'));
        assert.ok(huge[0].line.length <= IMPULSE_SCENE_CHARS);
        const almostFull = 'x'.repeat(IMPULSE_SCENE_CHARS - '[1] a: '.length - '[0] unknown: '.length - 3);
        const bounded = impulseScene([{ mes: 'should only contribute a marker' }, { name: 'a', mes: almostFull }]);
        assert.ok(bounded.map(({ line }) => line).join('\n\n').length <= IMPULSE_SCENE_CHARS);
        const prompt = buildImpulsePrompt(createState({ appetite: { want: 'w'.repeat(100_000) } }), chat, hero);
        assert.ok(prompt.user.length < 4_000);
        assert.match(prompt.user, /…/);
        assert.match(buildImpulsePrompt(null, [], hero).user, /"firstTaste":""/);
    });

    it('refuses unsupported citations, missing motive/target/context and attempts to change a retained direction', () => {
        const scene = impulseScene(chat);
        const previous = { text: result().text, context: '', status: 'active' };
        for (const bad of [null, [], 'prose', { ...result(), extra: 'world route' },
            { ...result(), connection: undefined }, result({ evidence: null }), result({ evidence: [0.5] }),
            result({ evidence: [] }), result({ evidence: [50] }), result({ evidence: [-1] }),
            result({ target: '' }), result({ context: '   ' }), result({ connection: 5 }),
            result({ text: 'x'.repeat(2_001) }), result({ decision: 'invented' }),
            result({ decision: 'retain', text: 'Choose another route' }),
            result({ decision: 'none', text: 'something', evidence: [] })]) {
            assert.throws(() => readImpulseResult(bad, previous, scene), /Sidekick:/);
        }
        const missing = result();
        delete missing.target;
        assert.throws(() => readImpulseResult(missing, previous, scene), /unexpected/);
        for (const status of ['inactive', 'suspended', 'satisfied']) {
            assert.throws(() => readImpulseResult(result({ decision: 'retain' }), { ...previous, status }, scene), /active direction/);
        }
        assert.equal(readImpulseResult(result({ text: '  Get home.  ', context: '  The storm is rising.  ' }), previous, scene).text, 'Get home.');
    });

    it('cleans up after rejection, malformed transport and a timeout; a late response is inert', async () => {
        for (const generate of [async () => { throw new Error('offline'); }, async () => '{}', async () => 'not JSON', async () => 5]) {
            await assert.rejects(assessImpulse(state(), { chat, character: hero, generate }));
        }
        let timeout;
        let release;
        let cleaned = false;
        const pending = assessImpulse(state(), { chat, character: hero,
            generate: () => new Promise(resolve => { release = resolve; }),
            startTimer: (fn, ms) => { timeout = fn; assert.equal(ms, IMPULSE_TIMEOUT_MS); return 7; },
            stopTimer: id => { assert.equal(id, 7); cleaned = true; },
        });
        timeout();
        await assert.rejects(pending, /timed out/);
        assert.ok(cleaned);
        release(JSON.stringify(result()));
        await Promise.resolve();
    });
});
