import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDigestMessage } from '../src/inject.js';
import { renderDigest } from '../src/grammar.js';
import {
    PROPOSAL_SCHEMA,
    SCENE_WINDOW,
    buildPrompt,
    matchesSchema,
    runEvaluation,
    runGeneration,
    sceneWindow,
    startEvaluation,
    toPendingChange,
    validateProposals,
} from '../src/evaluate.js';

import { chatOf, ledger, mes, proposal, scanPass } from './fixtures.js';

describe('isDigestMessage', () => {
    it('is true only for messages this extension inserted', () => {
        assert.equal(isDigestMessage({ extra: { sidekick: true } }), true);
        assert.equal(isDigestMessage({ extra: { sidekick: false } }), false);
        assert.equal(isDigestMessage({}), false);
        assert.equal(isDigestMessage({ name: 'Sidekick' }), false);
        assert.equal(isDigestMessage(null), false);
    });

    it('does not mistake a character named Sidekick for our render', () => {
        // the flag is what makes the check exact; the name alone would drop a
        // real message from any campaign whose character shares our name
        assert.equal(isDigestMessage(mes('Sidekick')), false);
    });
});

describe('sceneWindow', () => {
    it('reads the trailing messages rather than the whole chat', () => {
        const scene = sceneWindow(chatOf(60));

        assert.equal(scene.length, SCENE_WINDOW);
        assert.equal(scene.at(-1).message.mes, 'line 59');
        assert.equal(scene[0].message.mes, `line ${60 - SCENE_WINDOW}`);
    });

    it('keeps the chat index of every message it reads', () => {
        // §6: PendingChange.evidence is a list of chat message indices, which the
        // review queue jumps to. A window-relative position would send the DM to
        // the wrong message.
        const scene = sceneWindow(chatOf(60));

        assert.equal(scene[0].index, 60 - SCENE_WINDOW);
        assert.equal(scene.at(-1).index, 59);
    });

    it('reads a short chat whole', () => {
        const chat = [mes('Hailey', 'one'), mes('Maxine', 'two', false)];
        assert.deepEqual(sceneWindow(chat).map(({ message }) => message), chat);
    });

    it('honours an explicit limit', () => {
        assert.equal(sceneWindow(chatOf(10), { limit: 3 }).length, 3);
        assert.equal(sceneWindow(chatOf(10), { limit: 3 })[0].index, 7);
    });

    it('falls back to the default rather than reading nothing', () => {
        // a nonsense limit would otherwise slice the chat down to nothing at
        // all, so it must be rejected rather than honoured
        const chat = chatOf(SCENE_WINDOW + 10);
        assert.equal(sceneWindow(chat, { limit: 0 }).length, SCENE_WINDOW);
        assert.equal(sceneWindow(chat, { limit: -4 }).length, SCENE_WINDOW);
        assert.equal(sceneWindow(chat, { limit: 3.5 }).length, SCENE_WINDOW);
    });

    it('never reads more than the chat holds', () => {
        const chat = chatOf(10);
        assert.equal(sceneWindow(chat).length, 10);
        assert.equal(sceneWindow(chat, { limit: 0 }).length, 10);
    });

    it('reads nothing from a missing chat', () => {
        assert.deepEqual(sceneWindow(null), []);
        assert.deepEqual(sceneWindow(undefined), []);
        assert.deepEqual(sceneWindow('not a chat'), []);
    });

    it('never reads our own render back', () => {
        // §3's one-way valve: the scan reads raw scenes and structured state,
        // never the digest render. A digest that somehow reached the persisted
        // chat must neither enter the window nor shrink it.
        const digest = {
            is_user: false,
            name: 'Sidekick',
            mes: 'She can do one thing so far...',
            extra: { sidekick: true },
        };
        const scene = sceneWindow([mes('Hailey', 'one'), digest, mes('Maxine', 'two', false)]);

        // the digest sat at index 1, so the surviving messages keep 0 and 2
        assert.deepEqual(scene.map(({ index }) => index), [0, 2]);
        assert.equal(scene.at(-1).message.mes, 'two');
        assert.ok(!scene.some(({ message }) => isDigestMessage(message)));
    });
});


/**
 * A ledger rich enough that renderDigest produces real prose, so the
 * one-way-valve test has something distinctive to look for.
 */

describe('buildPrompt', () => {
    const scene = sceneWindow([
        mes('Hailey', 'I have to tell someone before she works it out herself.'),
        mes('Alyssa', 'You keep looking at the driveway like it owes you money.', false),
    ]);

    it('offers the ledger as structured state', () => {
        // §3: the scan reads structured state. If the fields are absent the
        // model has nothing to propose against but the scene.
        const { user } = buildPrompt(ledger(), scene);

        assert.match(user, /Hailey Kogami Green/);
        assert.match(user, /a blue-black force that wraps what she protects/);
        assert.match(user, /what fired the projectile/);
        assert.match(user, /her family must not learn/);
        assert.match(user, /public breakage/);
    });

    it('offers the scene as tagged dialogue', () => {
        const { user } = buildPrompt(ledger(), scene);

        assert.match(user, /\[0\] Hailey: I have to tell someone/);
        assert.match(user, /\[1\] Alyssa: You keep looking at the driveway/);
    });

    it('names what the scan may propose', () => {
        const { system } = buildPrompt(ledger(), scene);

        assert.match(system, /entries to write/);
        assert.match(system, /threads to surface/);
        assert.match(system, /pressures coming due/);
        assert.match(system, /phrasing for a turn/);
    });

    it('forbids story outcomes, campaign direction, and opinions', () => {
        // §3 and §8's hard non-goal. The schema enforces it structurally; this
        // is what aims the generation in the first place.
        const { system } = buildPrompt(ledger(), scene);

        const forbidden = system.slice(system.indexOf('You never propose:'));
        assert.match(forbidden, /story outcomes/);
        assert.match(forbidden, /campaign direction/);
        assert.match(forbidden, /opinions about what should happen next/);
    });

    it('asks for chat indices as evidence', () => {
        const { system } = buildPrompt(ledger(), scene);
        assert.match(system, /chat message indices/);
    });

    it('passes an empty scene through rather than failing', () => {
        const { user } = buildPrompt(ledger(), []);
        assert.match(user, /no scene yet/);
        assert.equal(typeof user, 'string');
    });

    it('passes a missing state through rather than failing', () => {
        const { user } = buildPrompt(null, scene);
        assert.match(user, /no ledger yet/);
        assert.match(user, /\[0\] Hailey:/);
    });

    it('never leaks the render into the prompt', () => {
        // §3's one-way valve. The render is our own prose and persuasive by
        // construction, so feeding it back would over-persuade the scan and
        // cost the only reader positioned to notice a render drifting.
        const state = ledger();
        const { text } = renderDigest(state, { contextSize: 100000 });
        assert.ok(text.length > 0, 'the fixture must actually render something');

        const { system, user } = buildPrompt(state, scene);
        assert.ok(!user.includes(text), 'the whole render is present verbatim');
        for (const sentence of text.split(/[.\n]+/)) {
            const trimmed = sentence.trim();
            if (trimmed.length > 12) {
                assert.ok(!user.includes(trimmed), `prompt leaked render line: ${trimmed}`);
            }
        }
        assert.ok(!system.includes(text));
    });

    it('keeps the ruling log out of the prompt', () => {
        // §8's "drafts in the DM's idiom" is deferred; passing rulings in now
        // would half-design it. Documented as the seam for that work.
        const withRulings = {
            ...ledger(),
            rulings: [{ proposalId: 'p1', summary: 'stopped holding back', action: 'applied', at: 1 }],
        };
        const { user } = buildPrompt(withRulings, scene);

        assert.ok(!user.includes('stopped holding back'));
        assert.ok(!user.includes('rulings'));
    });
});

describe('runGeneration', () => {
    const prompt = buildPrompt(null, sceneWindow([]));
    /** Records every call and answers with whatever it is handed. */
    function stub(response = '{"proposals": []}') {
        const calls = [];
        const generate = async (args) => {
            calls.push(args);
            return typeof response === 'function' ? response() : response;
        };
        generate.calls = calls;
        return generate;
    }

    it('passes PROPOSAL_SCHEMA as the jsonSchema object', () => {
        // the whole point: SillyTavern only honours jsonSchema on the Chat
        // Completion path, and it arrives as a per-request parameter of this
        // exact shape
        const generate = stub();

        return runGeneration(prompt, PROPOSAL_SCHEMA, { generate }).then(() => {
            assert.equal(generate.calls.length, 1);
            assert.equal(generate.calls[0].jsonSchema, PROPOSAL_SCHEMA);
        });
    });

    it('sends the system half as systemPrompt and the user half as prompt', () => {
        // createRawPrompt prepends systemPrompt as a {role: 'system'} message,
        // which is the only reason buildPrompt can return two halves
        const generate = stub();

        return runGeneration(prompt, PROPOSAL_SCHEMA, { generate }).then(() => {
            assert.equal(generate.calls[0].systemPrompt, prompt.system);
            assert.equal(generate.calls[0].prompt, prompt.user);
        });
    });

    it('makes exactly one pass', async () => {
        // §3: one scan per trigger. A second call would double the queue and
        // the DM would be asked about the same scene twice
        const generate = stub();
        await runGeneration(prompt, PROPOSAL_SCHEMA, { generate });
        assert.equal(generate.calls.length, 1);
    });

    it('decodes the JSON string SillyTavern returns', async () => {
        // generateRaw hands back JSON.stringify when jsonSchema is set, so the
        // response is a string even on success
        const generate = stub('{"proposals": [{"summary": "s"}]}');
        const result = await runGeneration(prompt, PROPOSAL_SCHEMA, { generate });
        assert.deepEqual(result, { proposals: [{ summary: 's' }] });
    });

    it('returns the shape unvalidated', async () => {
        // decoding is not judging. A bogus proposals value is sk-gu5.4's
        // problem, not this function's
        const generate = stub('{"proposals": "not an array"}');
        const result = await runGeneration(prompt, PROPOSAL_SCHEMA, { generate });
        assert.deepEqual(result, { proposals: 'not an array' });
    });

    it('hands back the empty object a failed extraction produces', async () => {
        // extractJsonFromData returns '{}' when it cannot parse the response,
        // and that is also what a non-Chat-Completion backend yields because
        // jsonSchema never reaches the API there at all
        const generate = stub('{}');
        const result = await runGeneration(prompt, PROPOSAL_SCHEMA, { generate });
        assert.deepEqual(result, {});
    });

    it('propagates a rejected generation rather than swallowing it', async () => {
        const generate = stub(() => Promise.reject(new Error('API Error')));
        await assert.rejects(() => runGeneration(prompt, PROPOSAL_SCHEMA, { generate }), /API Error/);
    });

    it('turns a non-JSON response into a named failure', async () => {
        // the model answered in prose. That is a failed pass, and the caller
        // should be able to turn it into a no-op
        const generate = stub('She considers the ledger.');
        await assert.rejects(() => runGeneration(prompt, PROPOSAL_SCHEMA, { generate }), /not JSON/);
    });

    it('turns a non-string response into a named failure', async () => {
        const generate = stub({ proposals: [] });
        await assert.rejects(() => runGeneration(prompt, PROPOSAL_SCHEMA, { generate }), /JSON string/);
    });

    it('refuses to guess the generation function', async () => {
        // generateRaw lives on SillyTavern.getContext(), never on this module's
        // globals, so it has to be handed in--by index.js in the browser, by a stub
        // under node --test
        await assert.rejects(() => runGeneration(prompt, PROPOSAL_SCHEMA, {}), /generation function/);
    });
});

describe('validateProposals', () => {
    /**
     * A copy of a proposal with keys dropped, which is what a model forgets to
     * send. Copying first matters: the fixture is reused by later assertions.
     */
    function withoutKeys(proposal, ...keys) {
        const copy = { ...proposal };
        for (const key of keys) {
            delete copy[key];
        }
        return copy;
    }

    it('returns the proposals from a conforming pass', () => {
        assert.deepEqual(validateProposals(scanPass([proposal()])), [proposal()]);
    });

    it('returns [] for an empty pass, which is a pass that found nothing', () => {
        // the prompt asks for {"proposals": []} when nothing qualifies, and that
        // is a legitimate answer rather than a failure
        assert.deepEqual(validateProposals(scanPass([])), []);
    });

    it('never throws, whatever it is handed', () => {
        const junk = ['plain prose from a backend', null, undefined, 0, '', [], true,
            {}, { proposals: undefined }, { proposals: null },
            { proposals: 'nope' }, { proposals: {} }, { proposals: [null] },
            { proposals: [{}] }, { proposals: [42] }, { proposals: [[1]] }];

        for (const value of junk) {
            assert.deepEqual(validateProposals(value), [], `accepted ${JSON.stringify(value)}`);
        }
    });

    it('rejects a pass with no proposals key at all', () => {
        // the shape a failed pass arrives in: extractJsonFromData stringifies a {}
        // result, so an absent proposals key is the common failure
        assert.deepEqual(validateProposals({}), []);
    });

    it('rejects a proposal with no summary', () => {
        assert.deepEqual(validateProposals(scanPass([withoutKeys(proposal(), 'summary')])), []);
    });

    it('rejects a proposal with no changes', () => {
        assert.deepEqual(validateProposals(scanPass([withoutKeys(proposal(), 'changes')])), []);
    });

    it('rejects a summary that is not a string', () => {
        assert.deepEqual(validateProposals(scanPass([{ ...proposal(), summary: 7 }])), []);
    });

    it('rejects a change with no path', () => {
        const change = { to: 'moved' };
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [change] })])), []);
    });

    it('rejects a change with no to', () => {
        const change = { path: 'hero.status_quo' };
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [change] })])), []);
    });

    it('rejects a change whose path or to is not a string', () => {
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [{ path: 0, to: 'x' }] })])), []);
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [{ path: 'a', to: 1 }] })])), []);
    });

    it('rejects a change whose from is not a string', () => {
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [{ path: 'a', from: 2, to: 'x' }] })])), []);
    });

    it('accepts a change that carries no from at all', () => {
        // §6 marks from optional: an insert into an empty array has no prior
        const change = { path: 'a', to: 'x' };
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [change] })])),
            [proposal({ changes: [change] })]);
    });

    it('rejects evidence that is not an array of integers', () => {
        for (const evidence of ['4', [4.5], [{}], [null], 4, {}]) {
            assert.deepEqual(validateProposals(scanPass([proposal({ evidence })])), [],
                `accepted evidence ${JSON.stringify(evidence)}`);
        }
    });

    it('rejects a summary that is blank rather than merely short', () => {
        for (const summary of ['', '   ', '\t\n']) {
            const blank = { ...proposal(), summary };
            assert.deepEqual(validateProposals(scanPass([blank])), [], `accepted ${JSON.stringify(summary)}`);
        }
    });

    it('rejects an empty changes array, which is schema-conforming and useless', () => {
        assert.deepEqual(validateProposals(scanPass([proposal({ changes: [] })])), []);
    });

    it('rejects a proposal with no evidence, because it cites no message', () => {
        assert.deepEqual(validateProposals(scanPass([withoutKeys(proposal(), 'evidence')])), []);
    });

    it('voids the whole pass when a single proposal is malformed', () => {
        // one malformed entry never reaches the per-item rules: the schema walk
        // rejects the array through .items first, so the good ones go with it
        const broken = { summary: 'no changes here' };
        assert.deepEqual(validateProposals(scanPass([proposal(), broken, proposal()])), []);
    });

    it('voids the whole pass when a single proposal is unusable', () => {
        // the rules the schema cannot express behave the same way: a blank
        // summary is schema-conforming, and still voids the pass
        const blank = { ...proposal(), summary: '   ' };
        const empty = { ...proposal(), changes: [] };
        const uncited = { summary: 'a move', changes: [{ path: 'a', to: 'b' }] };

        for (const item of [blank, empty, uncited]) {
            assert.deepEqual(validateProposals(scanPass([proposal(), item])), [],
                `kept a pass holding ${JSON.stringify(item)}`);
        }
    });

    it('reads the schema rather than restating it', () => {
        // The gate is the schema. A proposal that satisfies everything
        // PROPOSAL_SCHEMA.value and the code require has nowhere left to fail, so
        // tightening PROPOSAL_SCHEMA must tighten the gate with it--which is the
        // property this test holds open by going through the real schema.
        const item = PROPOSAL_SCHEMA.value.properties.proposals.items;
        assert.ok(item.required.includes('summary'));
        assert.ok(item.required.includes('changes'));
    });
    it('treats a schema keyword it does not implement as a mismatch', () => {
        // refusing a proposal is recoverable; half-checking one is not. A schema
        // upgrade must not be able to loosen the gate by adding a keyword this
        // walker would silently skip.
        const expanded = structuredClone(PROPOSAL_SCHEMA.value);
        expanded.properties.proposals.items.anyOf = [{}];

        const item = { summary: 'anchored', changes: [{ path: 'a', to: 'b' }], evidence: [1] };
        assert.equal(matchesSchema(item, expanded.properties.proposals.items), false);
    });
});

describe('toPendingChange', () => {
    const meta = { counter: 3, now: 1700000000000 };

    it('builds the whole §6 shape from a validated proposal', () => {
        assert.deepEqual(toPendingChange(proposal(), meta), {
            id: 'pc-the-spark-has-a-second-limit-3',
            origin: 'evaluation',
            summary: proposal().summary,
            changes: [{
                path: 'powers.the-spark.limits.0',
                from: 'no control',
                to: 'unfocused it takes everything from the waist down',
            }],
            evidence: proposal().evidence,
            status: 'pending',
            createdAt: 1700000000000,
        });
    });

    it("takes origin from §2's provenance vocabulary, not from the proposal", () => {
        // the scan is the only caller, so this never varies today; naming it
        // here keeps a future discussion-sourced entry from inheriting it
        assert.equal(toPendingChange(proposal({ origin: 'discussion' }), meta).origin,
            'evaluation');
    });

    it("arrives pending, because applied and dismissed are the DM's", () => {
        // the queue's other two statuses are set by the DM acting on it, which
        // is review-queue work; nothing the scan produces can self-apply
        assert.equal(toPendingChange(proposal(), meta).status, 'pending');
    });

    it('carries an id the UI can read, not a bare queue index', () => {
        const id = toPendingChange(proposal(), meta).id;
        assert.match(id, /^pc-the-spark-has-a-second-limit-3$/);
    });

    it('slugs a summary down to url-safe, and trims what it cut', () => {
        const messy = toPendingChange(proposal({ summary: "She Won't  Let Go!" }), meta);
        assert.equal(messy.id, 'pc-she-won-t-let-go-3');

        const long = 'x'.repeat(80);
        const trimmed = toPendingChange(proposal({ summary: long }), meta);
        assert.equal(trimmed.id, `pc-${'x'.repeat(40)}-3`);
    });

    it('falls back to a plain slug when a summary slugs to nothing', () => {
        // non-blank is all isActionable demands, and '***' is non-blank;
        // without this the id would read 'pc--0'
        const id = toPendingChange(proposal({ summary: '***' }), meta).id;
        assert.equal(id, 'pc-proposal-3');
    });

    it('numbers two proposals from one pass distinctly', () => {
        // the fallback counter is the only uniqueness guarantee, because the
        // slug alone collides as soon as one pass touches the same thing twice
        const first = toPendingChange(proposal(), {});
        const second = toPendingChange(proposal(), {});
        assert.notEqual(first.id, second.id);
        assert.ok(first.id.endsWith('-' + second.id.split('-').pop()) === false);
    });

    it('reads createdAt from meta, falling back to the clock', () => {
        assert.equal(toPendingChange(proposal(), meta).createdAt, 1700000000000);
        const before = Date.now();
        assert.ok(toPendingChange(proposal(), {}).createdAt >= before);
    });

    it('records an absent from as an empty string, not undefined', () => {
        // §6 declares from required and PROPOSAL_SCHEMA does not, because a
        // proposal that inserts into an empty list has nothing to cite. Same
        // call applyProposal makes: every entry then carries a string.
        const [change] = toPendingChange(proposal({
            changes: [{ path: 'hero.name', to: 'Hailey Kogami Green' }],
        }), meta).changes;

        assert.deepEqual(change, {
            path: 'hero.name',
            from: '',
            to: 'Hailey Kogami Green',
        });
    });


    it('keeps no reference into the proposal it came from', () => {
        // the queue is persisted; an entry aliasing the response would change
        // when the response did
        const source = proposal();
        const entry = toPendingChange(source, meta);

        source.evidence.push(99);
        source.changes.push({ path: 'hero.name', to: 'elsewhere' });

        assert.deepEqual(entry.evidence, proposal().evidence);
        assert.equal(entry.changes.length, 1);
    });
});

describe('runEvaluation', () => {
    // A real exchange, so the chain tests can prove the prompt carries the chat
    // rather than a render of it.
    const chat = [mes('Dungeon Master', 'the hall is quiet', false), mes('Hero', 'she checks her gear')];

    /** Records every call, like runGeneration's stub. */
    function stub(response = JSON.stringify(scanPass([proposal()]))) {
        const calls = [];
        const generate = async (args) => {
            calls.push(args);
            return typeof response === 'function' ? response() : response;
        };
        generate.calls = calls;
        return generate;
    }

    it('appends one queue entry per validated proposal and returns them', async () => {
        // §6: the queue is where validated proposals wait for the DM, and the
        // returned entries are what the slash command counts.
        const state = ledger();
        const generate = stub();

        const queued = await runEvaluation(state, { chat, generate });

        assert.equal(queued.length, 1);
        assert.equal(state.queue.length, 1);
        assert.deepEqual(state.queue, queued);
    });

    it('generates exactly once, from the scene and the ledger', async () => {
        const state = ledger();
        const generate = stub();

        await runEvaluation(state, { chat, generate });

        assert.equal(generate.calls.length, 1);
        assert.equal(generate.calls[0].jsonSchema, PROPOSAL_SCHEMA);
        assert.match(generate.calls[0].prompt, /\[0\] Dungeon Master: the hall is quiet/);
        assert.match(generate.calls[0].prompt, /\[1\] Hero: she checks her gear/);
    });

    it('never leaks the render into the pass', async () => {
        // §3's one-way valve at the seam that matters: the whole chain could
        // be handed the render and still validate, so the leak is pinned here
        // and not only inside buildPrompt.
        const state = ledger();
        const generate = stub();

        await runEvaluation(state, { chat, generate });

        const { text } = renderDigest(state, { contextSize: 100000 });
        assert.ok(text.length > 0, 'the fixture must actually render something');
        for (const sentence of text.split(/[.\n]+/)) {
            const trimmed = sentence.trim();
            if (trimmed.length > 12) {
                assert.ok(!generate.calls[0].prompt.includes(trimmed),
                    `the pass leaked a render line: ${trimmed}`);
            }
        }
    });

    it('makes no pass at all for an unwritten ledger', async () => {
        const generate = stub();

        const queued = await runEvaluation(null, { chat, generate });

        assert.deepEqual(queued, []);
        assert.equal(generate.calls.length, 0);
    });

    it('refuses to run without a generator', async () => {
        // wiring, not a failed pass: a missing generateRaw is our bug, and it
        // must throw rather than masquerade as a scan that found nothing
        await assert.rejects(runEvaluation(ledger(), { chat }), /needs a generation function/);
    });

    it('queues nothing when the generation is rejected', async () => {
        // a backend that refuses is a pass that yielded nothing, and §3's
        // silence covers it: no console noise mid-session
        const state = ledger();
        const generate = async () => {
            throw new Error('the backend said no');
        };

        const queued = await runEvaluation(state, { chat, generate });

        assert.deepEqual(queued, []);
        assert.equal(state.queue.length, 0);
    });

    it('queues nothing when the response cannot be parsed', async () => {
        const state = ledger();

        const queued = await runEvaluation(state, { chat, generate: () => 'not json at all' });

        assert.deepEqual(queued, []);
        assert.equal(state.queue.length, 0);
    });

    it('queues nothing when the pass does not validate', async () => {
        // validateProposals voids the whole pass; this is where that silence
        // reaches the queue
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal({ summary: '  ' })])));

        const queued = await runEvaluation(state, { chat, generate });

        assert.deepEqual(queued, []);
        assert.equal(state.queue.length, 0);
    });

    it("continues the queue's id counter rather than its length", async () => {
        // §3's rulings cite these ids, so the counter outlives the queue's
        // length: length alone re-spends an id a dismissed entry already
        // used, and a module counter resets on a reload the queue does not
        const state = ledger();
        state.queue.push(toPendingChange(proposal(), { counter: 7, now: 1 }));
        const generate = stub();

        const queued = await runEvaluation(state, { chat, generate });

        assert.ok(queued[0].id.endsWith('-8'), queued[0].id);
    });

    it('numbers two proposals from one pass distinctly', async () => {
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal(), proposal({ summary: 'a second thing' })])));

        const queued = await runEvaluation(state, { chat, generate });

        assert.notEqual(queued[0].id, queued[1].id);
        assert.ok(queued[1].id.endsWith('-1'), queued[1].id);
    });
});

describe('startEvaluation', () => {
    /** A generation held open until the test releases it. */
    function deferred(value = JSON.stringify(scanPass([proposal()]))) {
        let release;
        const generate = () => new Promise((resolve) => {
            release = () => resolve(value);
        });
        return { generate, release: () => release() };
    }

    it('drops a trigger that arrives while a pass is running', async () => {
        // §7's overlap rule, guarding on the pass itself because a quiet
        // pass emits no end event to listen for; the next tick costs nothing
        // the ledger lacks
        const running = deferred();
        const started = startEvaluation(ledger(), { generate: running.generate });

        assert.equal(startEvaluation(ledger(), { generate: deferred().generate }), null);

        running.release();
        assert.equal((await started).length, 1);
    });

    it("leaves the dropped trigger's ledger alone", async () => {
        const running = deferred();
        const started = startEvaluation(ledger(), { generate: running.generate });
        const dropped = ledger();

        assert.equal(startEvaluation(dropped, { generate: deferred().generate }), null);

        running.release();
        await started;
        assert.equal(dropped.queue.length, 0);
    });

    it('starts again once the pass before it has settled', async () => {
        const running = deferred();
        const first = startEvaluation(ledger(), { generate: running.generate });
        running.release();
        await first;

        const next = deferred();
        const started = startEvaluation(ledger(), { generate: next.generate });
        assert.notEqual(started, null);

        next.release();
        assert.equal((await started).length, 1);
    });
});
