import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createState, loadState, setPath } from '../src/state.js';
import { createImpulseAssessment, mountImpulseAssessment, sceneRevision, streamSucceeded } from '../src/impulse-lifecycle.js';
import { createInterceptor, isDigestMessage } from '../src/inject.js';

const reply = () => ({ name: 'Bench hero', mes: 'She tries another exit to reach her brother.',
    is_user: false, gen_started: 'start', gen_finished: 'finish', send_date: 'date', swipe_id: 0 });
const choice = () => JSON.stringify({ decision: 'replace', text: 'Get home to her brother now.',
    context: 'The robbery obstructs her way home.', target: 'Her brother', connection: 'Protect her family', evidence: [0] });
const settle = async () => { for (let i = 0; i < 20; i++) { await Promise.resolve(); } };
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function bench({ generate, manager, context: overrides = {}, assessmentOptions = {}, mount = false } = {}) {
    let ledger = createState({ appetite: { want: 'Protect her family' },
        impulse: { text: 'Keep her brother safe.', context: 'He is at home.', status: 'active' } });
    const listeners = new Map();
    const events = ['GENERATION_STARTED', 'MESSAGE_RECEIVED', 'GENERATION_ENDED', 'GENERATION_STOPPED',
        'CHAT_CHANGED', 'MESSAGE_SENT', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED',
        'MESSAGE_DELETED', 'MESSAGE_SWIPE_DELETED', 'TOOL_CALLS_PERFORMED'];
    const context = { chat: [reply()], chatMetadata: {}, chatId: 'bench', characterId: 0, name2: 'Bench hero',
        streamingProcessor: null, ToolManager: manager, ...overrides,
        event_types: Object.fromEntries(events.map(name => [name, name])),
        eventSource: {
            on: (name, fn) => listeners.set(name, fn),
            removeListener: (name, fn) => { if (listeners.get(name) === fn) { listeners.delete(name); } },
        } };
    const timers = new Map();
    const calls = [];
    const saves = [];
    const warnings = [];
    let refreshed = 0;
    const deps = {
        getContext: () => context, getState: () => structuredClone(ledger),
        persist: async (next, captured) => {
            assert.equal(captured, context.chatMetadata);
            saves.push(structuredClone(next)); ledger = structuredClone(next); return true;
        },
        generate: args => { calls.push(args); return generate ? generate(args) : Promise.resolve(choice()); },
        defer: fn => { const key = {}; timers.set(key, fn); return key; }, cancel: key => timers.delete(key),
        refresh: () => { refreshed++; }, log: { warn: (...args) => warnings.push(args) }, assessmentOptions,
    };
    const controller = mount ? mountImpulseAssessment(deps) : createImpulseAssessment(deps);
    const flush = async () => {
        for (const [key, fn] of timers) { timers.delete(key); fn(); }
        await settle();
    };
    const complete = async ({ type = 'normal', stream = false, failed = false, order = 'received-first' } = {}) => {
        controller.started(type);
        if (stream) {
            context.streamingProcessor = { isFinished: !failed, isStopped: failed,
                abortController: new AbortController(), toolCalls: [] };
        } else { context.streamingProcessor = null; }
        if (order === 'ended-first') { controller.ended(); controller.received(0, type); }
        else { controller.received(0, type); controller.ended(); }
        await flush();
    };
    return { controller, context, calls, saves, warnings, flush, complete, listeners, timers, deps,
        get ledger() { return ledger; }, set ledger(value) { ledger = value; }, get refreshed() { return refreshed; } };
}

describe('appetite workflow with a scripted provider', () => {
    it('carries urgent direction through obstacles, satisfaction, quiet replacement and reload', async () => {
        const pending = deferred();
        const scripted = [
            { decision: 'retain', text: 'Get home to her brother now.', context: 'The side exit is locked.' },
            { decision: 'retain', text: 'Get home to her brother now.', context: 'The window opens onto a fenced yard.' },
            { decision: 'satisfied', text: 'Get home to her brother now.', context: 'She reaches home and finds him safe.' },
            { decision: 'replace', text: 'Stay beside her brother and rest.', context: 'Everyone is safe at home.' },
        ];
        const b = bench({ mount: true, generate: async args => {
            // Scene assessment reads played evidence, never its own persuasive digest.
            assert.doesNotMatch(args.prompt, /Newer scene facts take precedence/);
            if (b.calls.length === 1) {
                return pending.promise;
            }
            const next = scripted.shift();
            assert.ok(next, 'No unscripted provider calls');
            return JSON.stringify({ ...next, target: 'Her brother', connection: 'Protect her family',
                evidence: [b.context.chat.length - 1] });
        } });
        b.ledger = createState({ hero: { name: 'Bench hero' }, appetite: { want: 'Protect her family',
            firstTaste: 'Watching her parents care for others', condition: 'Hungry to be useful' },
        settings: { injectionDepth: 1, injectionRole: 'system' } });
        setPath(b.ledger, 'impulse.text', 'Keep her brother safe.');
        setPath(b.ledger, 'impulse.context', 'He is home alone during the storm.');
        setPath(b.ledger, 'impulse.status', 'active');
        const approved = structuredClone(b.ledger.appetite);
        const inject = createInterceptor({ getState: b.deps.getState });
        const delivered = async (type = 'normal') => {
            const before = structuredClone(b.context.chat);
            const core = b.context.chat.filter(() => true);
            const calls = b.calls.length;
            await inject(core, 8000, null, type);
            assert.equal(b.calls.length, calls, 'Injection starts no assessment');
            assert.deepEqual(b.context.chat, before, 'The real chat stays unchanged');
            const digest = core.find(isDigestMessage);
            assert.equal(digest.extra.type, 'narrator');
            assert.equal(core.length - core.indexOf(digest) - 1, 1);
            return digest.mes;
        };
        const played = async (line, type = 'normal') => {
            const emit = (name, ...args) => b.listeners.get(name)?.(...args);
            emit('GENERATION_STARTED', type, {}, false);
            b.context.chat.push({ ...reply(), mes: line, send_date: `date-${b.context.chat.length}` });
            b.context.streamingProcessor = { isFinished: true, isStopped: false,
                abortController: new AbortController(), toolCalls: [] };
            emit('GENERATION_ENDED');
            emit('MESSAGE_RECEIVED', b.context.chat.length - 1, type);
            await b.flush();
        };
        try {
            assert.match(await delivered(), /Keep her brother safe/);
            await played('The robbery blocks the exit. She looks for a way home.');
            assert.equal(b.controller.busy, true);
            assert.match(await delivered(), /Keep her brother safe/);
            pending.resolve(JSON.stringify({ decision: 'replace', text: 'Get home to her brother now.',
                context: 'The robbery obstructs her way home.', target: 'Her brother', connection: approved.want, evidence: [1] }));
            await settle();
            assert.match(await delivered(), /Get home to her brother now/);
            await played('The side exit is locked. She tries the window.');
            assert.match(await delivered(), /Get home to her brother now/);
            assert.match(await delivered(), /side exit is locked/);
            await played('The window opens onto a fenced yard. She studies the fence.', 'continue');
            assert.match(await delivered('continue'), /Get home to her brother now/);
            assert.match(await delivered('continue'), /fenced yard/);
            await played('She reaches home and finds her brother safe.');
            assert.doesNotMatch(await delivered(), /Get home to her brother now/);
            await played('Everyone is safe. She sits beside her brother after the ordeal.');
            const quiet = await delivered();
            assert.match(quiet, /Stay beside her brother and rest/);
            assert.doesNotMatch(quiet, /robbery|Get home to her brother now/);
            assert.deepEqual(b.ledger.appetite, approved);
            assert.equal(scripted.length, 0);
            assert.equal(b.warnings.length, 0);
            const stored = JSON.stringify(b.ledger);
            b.controller.dispose();
            b.ledger = loadState(JSON.parse(stored));
            b.context.chatMetadata = {};
            assert.equal(await delivered(), quiet);
            b.ledger = createState();
            const other = b.context.chat.filter(() => true);
            await inject(other, 8000, null, 'normal');
            assert.equal(other.some(isDigestMessage), false, 'Another unwritten chat inherits no impulse');
        } finally {
            b.controller.dispose();
        }
    });
});

describe('settled character impulse lifecycle', () => {
    it('runs once for either completion order, every character reply type, and ignores repeated notifications', async () => {
        for (const type of ['normal', 'regenerate', 'swipe', 'continue', 'appendFinal']) {
            for (const stream of [false, true]) {
                const b = bench();
                await b.complete({ type, stream, order: stream ? 'ended-first' : 'received-first' });
                b.controller.received(0, type); b.controller.ended(); await b.flush();
                assert.equal(b.calls.length, 1, `${type}, stream=${stream}`);
                assert.equal(b.saves.length, 1);
                assert.equal(b.refreshed, 1);
                assert.equal(b.controller.busy, false);
                b.controller.dispose();
            }
        }
    });

    it('waits for a settled completion, including a RECEIVED event arriving after ENDED', async () => {
        const b = bench();
        b.controller.started(); b.controller.ended(); await b.flush();
        assert.equal(b.calls.length, 0);
        b.controller.received(0, 'normal'); await b.flush();
        assert.equal(b.calls.length, 1);
        b.controller.dispose();
    });

    it('rejects failed, stopped and aborted streams even with retained character text and both events', async () => {
        for (const flags of [
            { isFinished: false, isStopped: true }, { isFinished: false, isStopped: false },
            { isFinished: true, isStopped: true }, { isFinished: true, isStopped: false, aborted: true },
            { isFinished: true, isStopped: false, noController: true },
        ]) {
            const b = bench();
            b.controller.started();
            const abortController = new AbortController();
            if (flags.aborted) { abortController.abort(); }
            b.context.streamingProcessor = { ...flags, abortController: flags.noController ? undefined : abortController };
            b.controller.ended(); b.controller.received(0, 'normal'); await b.flush();
            assert.equal(b.calls.length, 0);
            assert.equal(b.ledger.impulse.text, 'Keep her brother safe.');
            b.controller.dispose();
        }
        assert.equal(streamSucceeded(null), false);
    });

    it('skips a stopped nonstream attempt and provider failures that never delivered a reply', async () => {
        const b = bench();
        b.controller.started(); b.controller.ended(); b.controller.received(0, 'normal');
        b.controller.stopped(); await b.flush();
        assert.equal(b.calls.length, 0);
        const signal = AbortSignal.abort();
        b.controller.started('normal', { signal }); b.controller.received(0, 'normal'); b.controller.ended();
        await b.flush(); assert.equal(b.calls.length, 0);
        b.controller.started(); b.controller.ended(); await b.flush();
        assert.equal(b.calls.length, 0);
        b.controller.dispose();
    });

    it('does not recurse for raw/quiet/impersonation/dry-run requests or run for an unsupported host', async () => {
        const b = bench({ generate: async () => {
            b.controller.started('quiet'); b.controller.ended(); b.controller.received(0, 'quiet'); return choice();
        } });
        for (const type of ['quiet', 'impersonate', 'raw', 'unknown']) {
            b.controller.started(type); b.controller.received(0, type); b.controller.ended();
        }
        b.controller.started('normal', {}, true); await b.flush(); assert.equal(b.calls.length, 0);
        await b.complete(); assert.equal(b.calls.length, 1); b.controller.dispose();
        const unsupported = bench(); delete unsupported.context.streamingProcessor;
        await unsupported.complete(); assert.equal(unsupported.calls.length, 0);
        assert.match(unsupported.warnings[0][0], /completion flags/); unsupported.controller.dispose();
    });

    it('does not mistake a stale failed processor for the next successful nonstream reply', async () => {
        const b = bench({ context: { streamingProcessor: { isStopped: true, isFinished: false } } });
        await b.complete(); assert.equal(b.calls.length, 1); b.controller.dispose();
    });

    it('filters non-character messages and changed or replaced completion candidates', async () => {
        for (const patch of [{ is_user: true }, { is_system: true }, { extra: { sidekick: true } },
            { name: 'Other hero' }, { mes: '' }, { mes: '...' }, { mes: 5 }, { gen_started: '' }, { gen_finished: '' }]) {
            const b = bench(); Object.assign(b.context.chat[0], patch);
            await b.complete(); assert.equal(b.calls.length, 0); b.controller.dispose();
        }
        for (const change of [b => { b.context.chat[0].mes = 'Edited after received'; },
            b => { b.context.chat[0] = reply(); }, b => { b.context.chatMetadata = {}; },
            b => { b.context.characterId = 1; }]) {
            const b = bench(); b.controller.started(); b.controller.received(-1, 'normal');
            b.controller.received(0, 'normal'); b.controller.ended(); change(b); await b.flush();
            assert.equal(b.calls.length, 0); b.controller.dispose();
        }
    });

    it('keeps the last impulse while running and merges the result into the latest cloned ledger', async () => {
        const pending = deferred(); const b = bench({ generate: () => pending.promise });
        await b.complete(); assert.equal(b.controller.busy, true);
        assert.equal(b.ledger.impulse.text, 'Keep her brother safe.');
        b.ledger.hero.name = 'Manual title'; b.ledger.queue.push({ id: 'new scan result' });
        pending.resolve(choice()); await settle();
        assert.equal(b.saves.length, 1); assert.equal(b.ledger.hero.name, 'Manual title');
        assert.deepEqual(b.ledger.queue, [{ id: 'new scan result' }]);
        assert.equal(b.ledger.impulse.text, 'Get home to her brother now.'); b.controller.dispose();
    });

    it('discards stale work after chat, scene/swipe, appetite or manual impulse changes', async () => {
        for (const change of [b => { b.context.chatId = 'other'; }, b => { b.context.chatMetadata = {}; },
            b => { b.context.chat[0].mes += ' Changed in place'; }, b => { b.context.chat[0].swipe_id++; },
            b => { b.ledger.appetite.want = 'A new approved want'; },
            b => { b.ledger.impulse.text = 'A manual direction'; }, b => { b.controller.changed(); },
            b => { b.context.chat.push({ name: 'DM', mes: 'New circumstances', is_user: true }); b.controller.invalidate(); }]) {
            const pending = deferred(); const b = bench({ generate: () => pending.promise });
            await b.complete(); change(b); pending.resolve(choice()); await settle();
            assert.equal(b.saves.length, 0); assert.equal(b.controller.busy, false); b.controller.dispose();
        }
        assert.notEqual(sceneRevision(null), sceneRevision([]));
    });

    it('coalesces completed generations toward the latest scene, without invalidating an unchanged swipe notification', async () => {
        const first = deferred(); const b = bench({ generate: () => b.calls.length === 1 ? first.promise : Promise.resolve(choice()) });
        await b.complete(); b.controller.invalidate();
        assert.equal(b.calls.length, 1);
        b.context.chat[0].mes = 'A second attempt'; await b.complete();
        b.context.chat[0].mes = 'The latest attempt'; await b.complete();
        assert.equal(b.calls.length, 1);
        first.resolve(choice()); await settle();
        assert.equal(b.calls.length, 2); assert.match(b.calls[1].prompt, /latest attempt/);
        assert.equal(b.saves.length, 1); b.controller.dispose();
    });

    it('does not launch queued work during an unfinished newer attempt, a stop or disposal', async () => {
        for (const action of [b => b.controller.started(), b => b.controller.stopped(), b => b.controller.dispose()]) {
            const first = deferred(); const b = bench({ generate: () => first.promise });
            await b.complete(); await b.complete(); action(b); first.resolve(choice()); await settle();
            assert.equal(b.calls.length, 1); assert.equal(b.saves.length, 0); b.controller.dispose();
            b.controller.started(); await b.flush(); assert.equal(b.calls.length, 1);
        }
    });

    it('preserves manual pauses and skips assessment without approved appetite', async () => {
        for (const mutate of [b => { b.ledger.impulse.status = 'suspended'; }, b => { b.ledger.appetite.want = ''; }]) {
            const b = bench(); mutate(b); await b.complete(); assert.equal(b.calls.length, 0); b.controller.dispose();
        }
    });

    it('keeps the last valid impulse after errors, timeouts, persistence failures and empty decisions; clears busy', async () => {
        for (const generate of [async () => { throw new Error('Provider failed'); }, async () => 'not JSON',
            async () => JSON.stringify({ decision: 'none', text: '', context: '', target: '', connection: '', evidence: [] })]) {
            const b = bench({ generate }); await b.complete();
            assert.equal(b.saves.length, 0); assert.equal(b.controller.busy, false);
            assert.equal(b.ledger.impulse.text, 'Keep her brother safe.'); b.controller.dispose();
        }
        const hung = deferred(); let expire;
        const b = bench({ generate: () => hung.promise, assessmentOptions: {
            startTimer: fn => { expire = fn; return 1; }, stopTimer: () => {},
        } });
        await b.complete(); expire(); await settle(); assert.equal(b.controller.busy, false);
        assert.equal(b.saves.length, 0); hung.resolve(choice()); await settle(); assert.equal(b.saves.length, 0);
        b.controller.dispose();
        for (const persist of [async () => { throw new Error('Save failed'); }, async () => false]) {
            const fixture = bench(); fixture.controller.dispose(); fixture.deps.persist = persist;
            const controller = createImpulseAssessment(fixture.deps);
            controller.started(); controller.received(0, 'normal'); controller.ended(); await fixture.flush();
            assert.equal(controller.busy, false); assert.equal(fixture.refreshed, 0); controller.dispose();
        }
    });

    it('avoids unnecessary saves when a retained impulse is unchanged', async () => {
        const b = bench({ generate: async () => JSON.stringify({ decision: 'retain',
            text: 'Keep her brother safe.', context: 'He is at home.', target: 'Her brother',
            connection: 'Protect her family', evidence: [0] }) });
        await b.complete(); assert.equal(b.calls.length, 1); assert.equal(b.saves.length, 0); b.controller.dispose();
    });

    it('observes tool intermediaries without changing invocation arguments, receiver, result or errors', async () => {
        const sentinel = Promise.resolve('Host result');
        const manager = { canPerformToolCalls: () => true, hasToolCalls: data => Boolean(data.calls),
            invokeFunctionTools(...args) { assert.equal(this, manager); assert.equal(args[1], 'host argument'); return sentinel; } };
        const original = manager.invokeFunctionTools;
        const b = bench({ manager }); const second = bench({ manager });
        b.controller.started(); b.controller.received(0, 'normal');
        assert.equal(manager.invokeFunctionTools({ calls: true }, 'host argument'), sentinel);
        b.controller.ended(); await b.flush(); assert.equal(b.calls.length, 0);
        await b.complete(); assert.equal(b.calls.length, 0, 'Missing tool witness must fail closed');
        b.controller.started(); b.controller.received(0, 'normal');
        assert.equal(manager.invokeFunctionTools({ calls: false }, 'host argument'), sentinel);
        b.controller.ended(); await b.flush(); assert.equal(b.calls.length, 1);
        b.controller.dispose(); assert.notEqual(manager.invokeFunctionTools, original);
        second.controller.dispose(); assert.equal(manager.invokeFunctionTools, original);
        const failing = { ...manager, invokeFunctionTools() { throw new Error('Host error'); } };
        const bad = bench({ manager: failing });
        assert.throws(() => failing.invokeFunctionTools({ calls: true }), /Host error/); bad.controller.dispose();
    });

    it('skips a streamed tool intermediary and runs only the final child generation in a tool chain', async () => {
        const manager = { canPerformToolCalls: () => true, hasToolCalls: data => data.calls,
            invokeFunctionTools: async () => [] };
        const b = bench({ manager });
        b.controller.started(); b.context.streamingProcessor = { isFinished: true, isStopped: false,
            abortController: new AbortController(), toolCalls: [{}] };
        b.controller.received(0, 'normal'); b.controller.ended(); await b.flush();
        assert.equal(b.calls.length, 0);
        b.controller.started(); b.controller.received(0, 'normal'); manager.invokeFunctionTools({ calls: true });
        b.controller.started(); b.context.streamingProcessor = null;
        b.context.chat[0] = reply(); b.controller.received(0, 'normal'); manager.invokeFunctionTools({ calls: false });
        b.controller.ended(); await b.flush(); assert.equal(b.calls.length, 1); b.controller.dispose();
    });

    it('fails closed when a tool observer cannot collect evidence and respects other wrappers at disposal', async () => {
        for (const manager of [Object.freeze({ canPerformToolCalls: () => true, hasToolCalls: () => false,
            invokeFunctionTools: async () => [] }), { canPerformToolCalls: () => true },
        { canPerformToolCalls: () => true, hasToolCalls() { throw new Error('Unavailable witness'); },
            invokeFunctionTools: async () => [] }]) {
            const b = bench({ manager }); b.controller.started(); b.controller.received(0, 'normal');
            manager.invokeFunctionTools?.({}); b.controller.ended(); await b.flush();
            assert.equal(b.calls.length, 0); b.controller.dispose();
        }
        const manager = { invokeFunctionTools: () => 'old', hasToolCalls: () => false };
        const b = bench({ manager }); const other = () => 'new'; manager.invokeFunctionTools = other;
        b.controller.dispose(); assert.equal(manager.invokeFunctionTools, other);
    });

    it('mounts and releases host events, including absent optional notifications', async () => {
        const b = bench({ mount: true });
        b.listeners.get('GENERATION_STARTED')('normal'); b.listeners.get('MESSAGE_RECEIVED')(0, 'normal');
        b.listeners.get('GENERATION_ENDED')(); await b.flush(); assert.equal(b.calls.length, 1);
        b.controller.dispose(); assert.equal(b.listeners.size, 0);
        delete b.context.event_types.TOOL_CALLS_PERFORMED;
        const controller = mountImpulseAssessment(b.deps); controller.dispose(); assert.equal(b.listeners.size, 0);
    });
});
