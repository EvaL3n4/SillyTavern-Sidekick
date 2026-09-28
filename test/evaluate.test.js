import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isDigestMessage } from '../src/inject.js';
import { SCENE_WINDOW, sceneWindow } from '../src/evaluate.js';

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
        assert.equal(scene.at(-1).mes, 'line 59');
        assert.equal(scene[0].mes, `line ${60 - SCENE_WINDOW}`);
    });

    it('reads a short chat whole', () => {
        const chat = [mes('Hailey', 'one'), mes('Maxine', 'two', false)];
        assert.deepEqual(sceneWindow(chat), chat);
    });

    it('honours an explicit limit', () => {
        assert.equal(sceneWindow(chatOf(10), { limit: 3 }).length, 3);
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

        assert.equal(scene.length, 2);
        assert.equal(scene.at(-1).mes, 'two');
        assert.ok(!scene.some((message) => isDigestMessage(message)));
    });
});
