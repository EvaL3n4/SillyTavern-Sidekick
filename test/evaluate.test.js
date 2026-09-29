import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDigestMessage } from '../src/inject.js';
import { estimateTokens, renderDigest } from '../src/grammar.js';
import { createState } from '../src/state.js';
import {
    PROPOSAL_SCHEMA,
    RULING_FEEDBACK_BUDGET,
    RULING_FEEDBACK_LIMIT,
    SCENE_PROMPT_BUDGET,
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

import { chatOf, ledger, mes, proposal, ruling, scanPass } from './fixtures.js';

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

    it('carries her rulings into the prompt', () => {
        // §3's feedback half. They are not state, so renderState still keeps them
        // out of the structured half; they arrive as their own section instead.
        // The assertion that used to stand here was that they stayed out of the
        // prompt entirely, which was the seam sk-b7d closed.
        const withRulings = {
            ...ledger(),
            rulings: [{ proposalId: 'p1', summary: 'stopped holding back', action: 'applied', at: 1 }],
        };
        const { user } = buildPrompt(withRulings, scene);

        assert.match(user, /What she has been ruling/);
        assert.match(user, /kept: stopped holding back/);
    });

    it('tells the model how to read her rulings', () => {
        // The section is worthless if the model is not told what it is for, so
        // this asserts the instruction, not just the render.
        const { system } = buildPrompt(ledger(), scene);

        assert.match(system, /recent rulings appear beside the scene/);
        assert.match(system, /to propose again/);
        assert.match(system, /what to stop offering/);
        assert.match(system, /how to phrase it/);
        assert.match(system, /newest ruling is the most/);
    });

    it('trims the scene oldest-first when the prompt overruns the budget', () => {
        // sk-zv2: a window of long IC posts overruns the budget on its own,
        // and an oversized prompt errors the call into a silent no-op. The
        // oldest entries go first because the recent scene is what justifies
        // a proposal.
        const many = sceneWindow([
            mes('Hailey', 'the first thing that happened'),
            mes('Alyssa', 'the second thing that happened', false),
            mes('Hailey', 'the third thing that happened'),
            mes('Alyssa', 'the fourth thing that happened', false),
        ]);
        const { user } = buildPrompt(ledger(), many, { budget: 120 });

        assert.ok(!user.includes('the first thing'), 'the oldest entry is dropped first');
        assert.match(user, /the fourth thing that happened/);
    });

    it('keeps the last scene entry even past the budget', () => {
        // The floor is one entry, not zero: an empty scene reads as '(no scene
        // yet)' and the pass is worthless without one.
        const one = sceneWindow([mes('Hailey', 'the only scene')]);
        const { user } = buildPrompt(ledger(), one, { budget: 1 });

        assert.match(user, /\[0\] Hailey: the only scene/);
    });

    it('does not trim a prompt that already fits', () => {
        const base = buildPrompt(ledger(), scene);
        const roomier = buildPrompt(ledger(), scene, { budget: 100000 });

        assert.equal(roomier.user, base.user);
        assert.ok(
            estimateTokens(base.system + base.user) <= SCENE_PROMPT_BUDGET,
            'the fixture scene must fit the default budget for this to mean anything',
        );
    });
});

describe('the rulings feedback', () => {
    const scene = sceneWindow([mes('Hailey', 'a line')]);

    it('is absent when she has ruled nothing', () => {
        // The section has to be free, or it spends prompt tokens teaching the
        // model about a log that does not exist yet.
        const bare = buildPrompt(ledger(), scene);
        const emptied = buildPrompt(ledger({ rulings: [] }), scene);

        assert.equal(emptied.user, bare.user);
        assert.ok(!bare.user.includes('What she has been ruling'));
    });

    it('is absent when there is no state at all', () => {
        const { user } = buildPrompt(null, scene);

        assert.ok(!user.includes('What she has been ruling'));
        assert.match(user, /no ledger yet/);
    });

    it('names §3\'s three calls in the verbs she would use', () => {
        const state = ledger({
            rulings: [
                ruling(1, { summary: 'wrote the spark down', action: 'applied' }),
                ruling(2, { summary: 'called it the spark', action: 'edited', edit: 'named it the ember' }),
                ruling(3, { summary: 'put the council in as a pressure', action: 'dismissed' }),
            ],
        });
        const { user } = buildPrompt(state, scene);

        assert.match(user, /kept: wrote the spark down/);
        assert.match(user, /reworded: called it the spark — she wrote: named it the ember/);
        assert.match(user, /refused: put the council in as a pressure/);
    });

    it('carries her wording beside the summary she was shown', () => {
        // §6 records both: the proposal's own frozen summary, and `edit` as the
        // string she replaced it with. Showing one without the other teaches
        // the model either half of the lesson.
        const state = ledger({
            rulings: [ruling(1, { summary: 'a power', action: 'edited', edit: 'the ember' })],
        });
        const { user } = buildPrompt(state, scene);

        assert.match(user, /reworded: a power/);
        assert.match(user, /she wrote: the ember/);
    });

    it('reads an edit that rewrote nothing as a plain ruling', () => {
        const state = ledger({
            rulings: [ruling(1, { summary: 'a power', action: 'edited', edit: '   ' })],
        });
        const { user } = buildPrompt(state, scene);

        assert.match(user, /reworded: a power/);
        assert.ok(!user.includes('she wrote'));
    });

    it('leaves `stale` out', () => {
        // A stale ruling is one whose every change was provenance-gated. She
        // decided nothing, so it has nothing to teach.
        const state = ledger({ rulings: [ruling(1, { action: 'stale' })] });
        const { user } = buildPrompt(state, scene);

        assert.ok(!user.includes('proposal 1'));
        assert.ok(!user.includes('What she has been ruling'));
    });

    it('skips an action outside §6\'s union', () => {
        // Hand-mangled record: a missing line, not a failed pass.
        const state = ledger({ rulings: [ruling(1, { action: 'deleted' })] });
        const { user } = buildPrompt(state, scene);

        assert.ok(!user.includes('proposal 1'));
    });

    it('skips a ruling that is not a ruling', () => {
        const state = ledger({ rulings: [null, ruling(1)] });
        const { user } = buildPrompt(state, scene);

        assert.match(user, /kept: proposal 1/);
        assert.equal(user.match(/kept:/g).length, 1);
    });

    it('names a ruling whose summary is missing', () => {
        const state = ledger({ rulings: [ruling(1, { summary: '' })] });
        const { user } = buildPrompt(state, scene);

        assert.match(user, /kept: \(no summary\)/);
    });

    it('shows the most recent rulings when there are more than the limit', () => {
        const rulings = Array.from({ length: RULING_FEEDBACK_LIMIT + 2 }, (_, i) => ruling(i));
        const { user } = buildPrompt(ledger({ rulings }), scene);

        assert.ok(!user.includes('kept: proposal 0'));
        assert.equal(user.match(/kept:/g).length, RULING_FEEDBACK_LIMIT);
        assert.match(user, /kept: proposal 2/);
        assert.match(user, /kept: proposal 11\b/);
    });

    it('drops the oldest rulings when the section outgrows its budget', () => {
        // The newest ruling describes the ledger as it now stands, so it is the
        // one that has to survive the cap.
        const fat = 'x'.repeat(1600);
        const state = ledger({
            rulings: [ruling(1, { summary: fat }), ruling(2, { summary: fat })],
        });
        const { user } = buildPrompt(state, scene);

        // The oldest line goes, the newest survives whole.
        assert.equal(user.match(/kept: x+/g).length, 1);
        assert.match(user, /kept: x{1600}/);
        assert.equal(estimateTokens(user) > 0, true);
    });

    it('keeps at least one ruling even when it alone busts the budget', () => {
        // An empty section would read as "she has no rulings", which is false.
        const enormous = 'y'.repeat(RULING_FEEDBACK_BUDGET * 8);
        const state = ledger({ rulings: [ruling(1, { summary: enormous })] });
        const { user } = buildPrompt(state, scene);

        assert.match(user, /kept: y+/);
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

    it('rejects an empty evidence array, which is present and cites nothing', () => {
        // present is not the whole rule: an empty array is schema-conforming
        // and the proposal it rides on traces to no message
        assert.deepEqual(validateProposals(scanPass([proposal({ evidence: [] })])), []);
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
    // rather than a render of it. Long enough for the standing proposal's
    // evidence to cite scenes the window actually holds.
    const chat = [
        mes('Dungeon Master', 'the hall is quiet', false),
        mes('Hero', 'she checks her gear'),
        ...chatOf(13).map((message, i) => ({ ...message, mes: `the scene keeps going, ${i + 2}` })),
    ];

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

    /** Captures the diagnostics a pass emits, in order. */
    function spyLog() {
        const calls = [];
        const make = (level) => (message, detail) => {
            calls.push({ level, message, detail });
        };
        return {
            calls,
            debug: make('debug'),
            info: make('info'),
            warn: make('warn'),
        };
    }


    it('generates exactly once, from the scene and the ledger', async () => {
        const state = ledger();
        const generate = stub();

        await runEvaluation(state, { chat, generate });

        assert.equal(generate.calls.length, 1);
        assert.equal(generate.calls[0].jsonSchema, PROPOSAL_SCHEMA);
        assert.match(generate.calls[0].prompt, /\[0\] Dungeon Master: the hall is quiet/);
        assert.match(generate.calls[0].prompt, /\[1\] Hero: she checks her gear/);
        // the ledger half: the scene lines above prove the chat reached the
        // call, and this proves the ledger did too
        assert.match(generate.calls[0].prompt, /Hailey Kogami Green/);
    });

    it('names what it did in the log, so a failure and a zero stop looking alike', async () => {
        // The defect this fixes: a pass whose generation threw returned [] exactly
        // like a pass that found nothing, so the console showed a broken scan and a
        // healthy one identically. The queue still counts entries; the log is where
        // the phases live.
        const state = ledger();
        const generate = stub();
        const log = spyLog();

        await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(log.calls.map((call) => call.message), [
            'scan started',
            'scan validated',
            'scan queued',
        ]);
        assert.equal(log.calls[0].detail.scene, 15);
        assert.equal(log.calls[1].detail.proposals, 1);
        assert.equal(log.calls[2].detail.count, 1);
        assert.equal(state.queue.length, 1);
    });

    it('logs a failed generation as a warning, and still returns quietly', async () => {
        const state = ledger();
        const generate = stub(() => {
            throw new Error('the backend refused');
        });
        const log = spyLog();

        const queued = await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(queued, []);
        assert.equal(state.queue.length, 0);
        const failure = log.calls.at(-1);
        assert.equal(failure.level, 'warn');
        assert.match(failure.message, /generation failed/);
        assert.match(failure.detail.error, /the backend refused/);
    });

    it('logs an out-of-window citation as a warning before voiding the pass', async () => {
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal({ evidence: [9999] })])));
        const log = spyLog();

        const queued = await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(queued, []);
        const voided = log.calls.at(-1);
        assert.equal(voided.level, 'warn');
        assert.match(voided.message, /outside the window/);
    });

    it('warns when the model answered with something that is not a proposal set', async () => {
        // SillyTavern returns '{}' for a response it could not read as JSON, which
        // is what a provider that ignores json_schema produces. That is a failed
        // pass, and it must not read as the clean zero below.
        const state = ledger();
        const generate = stub('{}');
        const log = spyLog();

        const queued = await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(queued, []);
        const refused = log.calls.at(-1);
        assert.equal(refused.level, 'warn');
        assert.match(refused.message, /refused by the proposal gate/);
        assert.deepEqual(refused.detail.received, []);
    });

    it('names the type when the reply was valid JSON but not an object', async () => {
        const state = ledger();
        const generate = stub('"just some prose"');
        const log = spyLog();

        const queued = await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(queued, []);
        assert.equal(log.calls.at(-1).level, 'warn');
        assert.equal(log.calls.at(-1).detail.received, 'string');
    });

    it('warns when one proposal is unusable, since the gate voids the whole pass', async () => {
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal({ evidence: [] })])));
        const log = spyLog();

        const queued = await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(queued, []);
        assert.equal(log.calls.at(-1).level, 'warn');
        assert.match(log.calls.at(-1).message, /refused by the proposal gate/);
    });

    it('does not warn when the model says there is nothing to propose', async () => {
        // {"proposals": []} conforms: a scan that read the scene and found nothing.
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([])));
        const log = spyLog();

        const queued = await runEvaluation(state, { chat, generate, log });

        assert.deepEqual(queued, []);
        assert.deepEqual(log.calls.map((call) => call.level), ['debug', 'debug']);
    });

    it('stays silent when no logger is injected', async () => {
        // The dependency is optional: a pass with nothing to log to behaves like a
        // pass that ran quietly under §3, rather than throwing on a missing channel.
        const state = ledger();
        const generate = stub();

        const queued = await runEvaluation(state, { chat, generate });

        assert.equal(queued.length, 1);
    });

    it('tolerates a logger that only carries some channels', async () => {
        // index.js supplies all three channels, but a partial logger must not
        // throw on the level it lacks—the log is never worth failing a pass over.
        const state = ledger();
        const generate = stub(() => {
            throw new Error('no channel for this');
        });
        const seen = [];

        const queued = await runEvaluation(state, {
            chat,
            generate,
            log: { warn: (message) => seen.push(message) },
        });

        assert.deepEqual(queued, []);
        assert.equal(seen.length, 1);
        assert.match(seen[0], /generation failed/);
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
        assert.equal(state.queue.length, 2);
    });

    it('fingerprints each citation with the date of the message it cites', async () => {
        // §6's locator: the model cites an index, and the queue stores which
        // message that was, so a later deletion or re-roll is distinguishable
        // from the same scene quietly still sitting there.
        const dated = chat.map((message, i) => ({ ...message, send_date: 1000 + i }));
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal({ evidence: [1] })])));

        const queued = await runEvaluation(state, { chat: dated, generate });

        assert.deepEqual(queued[0].evidence, [{ index: 1, send_date: 1001 }]);
    });

    it('voids the pass when a proposal cites outside the scene window', async () => {
        // A citation the model could not have seen is a hallucination, and one
        // pass is one generation: part of it inventing is all of it unreliable.
        const long = chatOf(35).map((message, i) => ({ ...message, send_date: 1000 + i }));
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal({ evidence: [1] })])));

        const queued = await runEvaluation(state, { chat: long, generate });

        assert.deepEqual(queued, []);
        assert.equal(state.queue.length, 0);
    });

    it('keeps a citation at either edge of the scene window', async () => {
        // The window is the trailing SCENE_WINDOW entries, so the oldest one
        // in it and the newest are both scenes the scan was genuinely shown.
        const long = chatOf(35).map((message, i) => ({ ...message, send_date: 1000 + i }));
        const state = ledger();
        const generate = stub(JSON.stringify(scanPass([proposal({ evidence: [5, 34] })])));

        const queued = await runEvaluation(state, { chat: long, generate });

        assert.deepEqual(queued[0].evidence, [
            { index: 5, send_date: 1005 },
            { index: 34, send_date: 1034 },
        ]);
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

    // long enough for the standing proposal's evidence to be citable
    const chat = chatOf(15);

    it('drops a trigger that arrives while a pass is running', async () => {
        // §7's overlap rule, guarding on the pass itself because a quiet
        // pass emits no end event to listen for; the next tick costs nothing
        // the ledger lacks
        const running = deferred();
        const started = startEvaluation(ledger(), { chat, generate: running.generate });

        assert.equal(startEvaluation(ledger(), { generate: deferred().generate }), null);

        running.release();
        assert.equal((await started).length, 1);
    });

    it("leaves the dropped trigger's ledger alone", async () => {
        const running = deferred();
        const started = startEvaluation(ledger(), { chat, generate: running.generate });
        const dropped = ledger();

        assert.equal(startEvaluation(dropped, { generate: deferred().generate }), null);

        running.release();
        await started;
        assert.equal(dropped.queue.length, 0);
    });

    it('starts again once the pass before it has settled', async () => {
        const running = deferred();
        const first = startEvaluation(ledger(), { chat, generate: running.generate });
        running.release();
        await first;

        const next = deferred();
        const started = startEvaluation(ledger(), { chat, generate: next.generate });
        assert.notEqual(started, null);

        next.release();
        assert.equal((await started).length, 1);
    });
});

describe('beginning a ledger (§3)', () => {
    const CARD = {
        name: 'Hailey',
        description: 'Hailey Kogami Green can throw light. She cannot aim it.',
        personality: 'guarded',
        scenario: 'the first week of having something',
    };
    const chat = chatOf(6);
    const scene = sceneWindow(chat);

    function stub(response) {
        const calls = [];
        const generate = async (args) => {
            calls.push(args);
            return response;
        };
        generate.calls = calls;
        return generate;
    }

    const cardProposal = (overrides = {}) => ({
        summary: 'the card names the Spark',
        source: 'card',
        evidence: [],
        changes: [{ path: 'powers.the-spark.name', from: '', to: 'the Spark' }],
        ...overrides,
    });

    it('reads the card and is told to begin while the ledger is empty', () => {
        const prompt = buildPrompt(createState(), scene, { card: CARD });

        assert.equal(prompt.cardShown, true);
        assert.match(prompt.user, /## The character card/);
        assert.match(prompt.user, /Description: Hailey Kogami Green can throw light/);
        assert.match(prompt.user, /Personality: guarded/);
        assert.match(prompt.system, /The ledger is empty, so this pass begins it/);
    });

    it('teaches the path grammar in every pass, empty ledger or not', () => {
        assert.match(buildPrompt(ledger(), scene).system, /powers\.<id>\.limits\.<n>/);
        assert.match(buildPrompt(createState(), scene).system, /A new power or/);
    });

    it('leaves the card and the brief out once the ledger holds anything', () => {
        const prompt = buildPrompt(ledger(), scene, { card: CARD });

        assert.equal(prompt.cardShown, false);
        assert.doesNotMatch(prompt.user, /character card/);
        assert.doesNotMatch(prompt.system, /this pass begins it/);
    });

    it('skips an empty card field, and reads a card that says nothing as no card', () => {
        const partial = buildPrompt(createState(), scene, { card: { name: 'Hailey', description: '  ', personality: null } });
        assert.match(partial.user, /Name: Hailey/);
        assert.doesNotMatch(partial.user, /Description:/);

        for (const card of [null, undefined, 'a string', {}, { description: '' }]) {
            assert.equal(buildPrompt(createState(), scene, { card }).cardShown, false);
        }
    });

    it('caps the card at its budget, so the cut lands on the scenario and not the powers', () => {
        const long = { name: 'Hailey', description: 'x'.repeat(20000), scenario: 'THE-SCENARIO' };
        const prompt = buildPrompt(createState(), scene, { card: long });

        assert.match(prompt.user, /…/);
        assert.doesNotMatch(prompt.user, /THE-SCENARIO/);
        assert.ok(prompt.user.length < 20000);
    });

    it('files a proposal that rests on the card and cites no message', async () => {
        const state = createState();
        const generate = stub(JSON.stringify(scanPass([cardProposal()])));

        const queued = await runEvaluation(state, { chat, generate, card: CARD });

        assert.equal(queued.length, 1);
        assert.equal(queued[0].source, 'card');
        assert.deepEqual(queued[0].evidence, []);
        assert.match(generate.calls[0].prompt, /## The character card/);
        assert.deepEqual(state.queue, queued);
    });

    it('refuses the reply a strict-schema provider gave with the value in from and to empty', async () => {
        // Seen from a real provider on the first live scan: every field filled, the
        // new value written into `from`, `to` left "", and "source" empty. That is not
        // a change, so it voids the pass rather than filing a hero named "".
        const swapped = {
            proposals: [{
                summary: 'Open the ledger with the hero',
                changes: [{ path: 'hero.name', from: 'Hailey Kogami Green', to: '' }],
                evidence: [],
                source: '',
            }],
        };
        const seen = [];

        const queued = await runEvaluation(createState(), {
            chat,
            generate: stub(JSON.stringify(swapped)),
            card: CARD,
            log: { warn: (message) => seen.push(message) },
        });

        assert.deepEqual(queued, []);
        assert.match(seen.at(-1), /refused by the proposal gate/);
    });

    it('reads a strict-schema reply that cites nothing as resting on the card it was shown', async () => {
        const filled = {
            proposals: [{
                summary: 'Open the ledger with the hero',
                changes: [{ path: 'hero.name', from: '', to: 'Hailey Kogami Green' }],
                evidence: [],
                source: '',
            }],
        };
        const state = createState();

        const queued = await runEvaluation(state, { chat, generate: stub(JSON.stringify(filled)), card: CARD });

        assert.equal(queued.length, 1);
        assert.equal(queued[0].source, 'card');
    });

    it('does not read a reply that cites nothing as the card when no card was shown', async () => {
        const filled = {
            proposals: [{ summary: 's', changes: [{ path: 'hero.name', from: '', to: 'x' }], evidence: [], source: '' }],
        };

        const queued = await runEvaluation(createState(), { chat, generate: stub(JSON.stringify(filled)) });

        assert.deepEqual(queued, []);
    });

    it('leaves a card-shown reply that is not a proposal set for the gate to refuse', async () => {
        for (const reply of ['"prose"', '{}', '{"proposals": [1]}', '{"proposals": "none"}']) {
            const queued = await runEvaluation(createState(), { chat, generate: stub(reply), card: CARD });
            assert.deepEqual(queued, [], reply);
        }
    });

    it('leaves the source off an entry that cites a message', () => {
        const entry = toPendingChange(proposal(), { counter: 0 });
        assert.equal('source' in entry, false);
    });

    it('voids a proposal that cites a card the pass was not shown', async () => {
        const state = ledger(); // populated: the card is not in the prompt
        const generate = stub(JSON.stringify(scanPass([cardProposal()])));
        const seen = [];

        const queued = await runEvaluation(state, {
            chat,
            generate,
            card: CARD,
            log: { warn: (message) => seen.push(message) },
        });

        assert.deepEqual(queued, []);
        assert.match(seen.at(-1), /not shown/);
    });

    it('still refuses a proposal that cites nothing at all', () => {
        const nothing = { summary: 's', evidence: [], changes: [{ path: 'hero.name', to: 'x' }] };
        assert.deepEqual(validateProposals({ proposals: [nothing] }), []);
        assert.equal(validateProposals({ proposals: [{ ...nothing, source: 'card' }] }).length, 1);
    });

    it('runs on an empty ledger with only the scene', async () => {
        const state = createState();
        const generate = stub(JSON.stringify(scanPass([
            proposal({ evidence: [1], changes: [{ path: 'hero.name', from: '', to: 'Hailey' }] }),
        ])));

        const queued = await runEvaluation(state, { chat, generate });

        assert.equal(queued.length, 1);
        assert.equal(generate.calls.length, 1);
        assert.doesNotMatch(generate.calls[0].prompt, /character card/);
    });

    it('says there is nothing to read when there is no ledger, card or chat', async () => {
        const generate = stub('{}');
        const seen = [];

        const queued = await runEvaluation(createState(), {
            chat: [],
            generate,
            log: { warn: (message) => seen.push(message) },
        });

        assert.deepEqual(queued, []);
        assert.equal(generate.calls.length, 0);
        assert.match(seen[0], /nothing to read/);
    });

    it('does nothing at all when there is no ledger object', async () => {
        const generate = stub('{}');

        assert.deepEqual(await runEvaluation(null, { chat, generate }), []);
        assert.equal(generate.calls.length, 0);
    });
});
