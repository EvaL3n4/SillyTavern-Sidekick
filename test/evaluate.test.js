import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDigestMessage } from '../src/inject.js';
import { renderDigest } from '../src/grammar.js';
import { SCENE_WINDOW, buildPrompt, sceneWindow } from '../src/evaluate.js';

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
