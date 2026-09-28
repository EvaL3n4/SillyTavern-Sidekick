import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDigestMessage } from '../src/inject.js';
import { renderDigest } from '../src/grammar.js';
import { PROPOSAL_SCHEMA, SCENE_WINDOW, buildPrompt, runGeneration, sceneWindow, validateProposals } from '../src/evaluate.js';

/** A plain chat message in the shape SillyTavern holds. */
function mes(name, text = 'a line', isUser = true) {
    return { is_user: isUser, name, mes: text };
}

function chatOf(count) {
    return Array.from({ length: count }, (_, i) => mes('Hailey', `line ${i}`));
}

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
function ledger() {
    return {
        cosmology: {
            sources: ['manifestation'],
            stageVocabulary: ['new', 'settling'],
            costVocabulary: ['strain', 'exposure'],
            taboos: 'no one outside the program may know',
        },
        hero: { name: 'Hailey Kogami Green', codename: '', statusQuo: 'assumed unmanifested' },
        powers: [{
            id: 'the-spark',
            name: 'the Spark',
            capability: 'a blue-black force that wraps what she protects',
            limits: ['no control', 'unfocused it takes everything from the waist down'],
            costs: ['cracked asphalt', 'witnesses'],
            stage: 'new',
            history: [],
        }],
        arc: {
            phase: 'the first week of having something',
            threads: [{ id: 't1', text: 'what fired the projectile', bornAt: 1, lastTouched: 9 }],
            pressures: [{ text: 'her family must not learn', since: 1, denialCount: 3, hidden: true }],
            linesCrossed: [{ line: 'public breakage', provides: 'a stranger saw', cost: 'a witness', msgId: 3 }],
        },
    };
}

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
    /** A proposal that satisfies every rule the schema and the code express. */
    function good(changes = [{ path: 'hero.status_quo', to: 'moved' }], evidence = [4]) {
        return { summary: 'record the move', changes, evidence };
    }

    /** Wraps proposals in the response shape a pass returns. */
    function pass(proposals) {
        return { proposals };
    }
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
        assert.deepEqual(validateProposals(pass([good()])), [good()]);
    });

    it('returns [] for an empty pass, which is a pass that found nothing', () => {
        // the prompt asks for {"proposals": []} when nothing qualifies, and that
        // is a legitimate answer rather than a failure
        assert.deepEqual(validateProposals(pass([])), []);
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
        assert.deepEqual(validateProposals(pass([withoutKeys(good(), 'summary')])), []);
    });

    it('rejects a proposal with no changes', () => {
        assert.deepEqual(validateProposals(pass([withoutKeys(good(), 'changes')])), []);
    });

    it('rejects a summary that is not a string', () => {
        assert.deepEqual(validateProposals(pass([{ ...good(), summary: 7 }])), []);
    });

    it('rejects a change with no path', () => {
        const change = { to: 'moved' };
        assert.deepEqual(validateProposals(pass([good([change])])), []);
    });

    it('rejects a change with no to', () => {
        const change = { path: 'hero.status_quo' };
        assert.deepEqual(validateProposals(pass([good([change])])), []);
    });

    it('rejects a change whose path or to is not a string', () => {
        assert.deepEqual(validateProposals(pass([good([{ path: 0, to: 'x' }])])), []);
        assert.deepEqual(validateProposals(pass([good([{ path: 'a', to: 1 }])])), []);
    });

    it('rejects a change whose from is not a string', () => {
        assert.deepEqual(validateProposals(pass([good([{ path: 'a', from: 2, to: 'x' }])])), []);
    });

    it('accepts a change that carries no from at all', () => {
        // §6 marks from optional: an insert into an empty array has no prior
        assert.deepEqual(validateProposals(pass([good([{ path: 'a', to: 'x' }])])),
            [good([{ path: 'a', to: 'x' }])]);
    });

    it('rejects evidence that is not an array of integers', () => {
        for (const evidence of ['4', [4.5], [{}], [null], 4, {}]) {
            assert.deepEqual(validateProposals(pass([good(undefined, evidence)])), [],
                `accepted evidence ${JSON.stringify(evidence)}`);
        }
    });

    it('rejects a summary that is blank rather than merely short', () => {
        for (const summary of ['', '   ', '\t\n']) {
            const proposal = { ...good(), summary };
            assert.deepEqual(validateProposals(pass([proposal])), [], `accepted ${JSON.stringify(summary)}`);
        }
    });

    it('rejects an empty changes array, which is schema-conforming and useless', () => {
        assert.deepEqual(validateProposals(pass([good([])])), []);
    });

    it('rejects a proposal with no evidence, because it cites no message', () => {
        assert.deepEqual(validateProposals(pass([withoutKeys(good(), 'evidence')])), []);
    });

    it('voids the whole pass when a single proposal is malformed', () => {
        // one malformed entry never reaches the per-item rules: the schema walk
        // rejects the array through .items first, so the good ones go with it
        const broken = { summary: 'no changes here' };
        assert.deepEqual(validateProposals(pass([good(), broken, good()])), []);
    });

    it('voids the whole pass when a single proposal is unusable', () => {
        // the rules the schema cannot express behave the same way: a blank
        // summary is schema-conforming, and still voids the pass
        const blank = { ...good(), summary: '   ' };
        const empty = { ...good(), changes: [] };
        const uncited = { summary: 'a move', changes: [{ path: 'a', to: 'b' }] };

        for (const proposal of [blank, empty, uncited]) {
            assert.deepEqual(validateProposals(pass([good(), proposal])), [],
                `kept a pass holding ${JSON.stringify(proposal)}`);
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
});
