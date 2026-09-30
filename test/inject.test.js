import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
    DIGEST_AUTHOR,
    INTERCEPTOR_NAME,
    createInterceptor,
    digestPlacement,
    isDigestMessage,
    lastUserMessageIndex,
    registerInterceptor,
} from '../src/inject.js';
import { renderDigest } from '../src/grammar.js';
import { createState } from '../src/state.js';
import { ledger, mes } from './fixtures.js';

describe('lastUserMessageIndex', () => {
    it('finds the last user turn, which is where a digest belongs', () => {
        // §5: the digest sits immediately before the final user message, so the
        // model reads it as context for the answer it is about to give
        const chat = [
            mes('Hailey', 'first'),
            mes('Alyssa', 'reply', false),
            mes('Hailey', 'second'),
            mes('Alyssa', 'reply', false),
        ];

        assert.equal(lastUserMessageIndex(chat), 2);
    });

    it('falls back to the end when the turn being answered is not a user turn', () => {
        // continue and impersonate have no trailing user message, and inserting
        // at 0 would put the digest before the whole scene
        // a continue or impersonate turn: no trailing user message anywhere
        const chat = [mes('Alyssa', 'reply', false)];

        assert.equal(lastUserMessageIndex(chat), chat.length);
    });

    it('falls back to the end for a chat with no user turn at all', () => {
        const chat = [mes('Alyssa', 'a', false), mes('Alyssa', 'b', false)];

        assert.equal(lastUserMessageIndex(chat), chat.length);
    });

    it('handles a chat with holes rather than assuming every entry is an object', () => {
        const chat = [mes('Hailey', 'first'), null, undefined];

        assert.equal(lastUserMessageIndex(chat), 0);
    });

    it('returns 0 for an empty chat rather than a negative index', () => {
        assert.equal(lastUserMessageIndex([]), 0);
    });
});

describe('createInterceptor', () => {
    const setup = () => {
        const state = ledger();
        const interceptor = createInterceptor({ getState: () => state });
        // the shape SillyTavern actually hands over: a DM reply, then the player's
        // turn, which is what generation is answering
        const chat = [mes('Alyssa', 'the driveway', false), mes('Hailey', 'a real line')];
        return { state, interceptor, chat };
    };

    it('splices the digest in immediately before the final user message', async () => {
        const { interceptor, chat } = setup();
        const original = [...chat];

        await interceptor(chat, 4000, () => {}, 'normal');

        assert.equal(chat.length, original.length + 1);
        // the digest lands immediately before the player's turn, and the scene
        // and the player's own line are untouched
        assert.equal(chat[0].mes, 'the driveway');
        assert.equal(isDigestMessage(chat[0]), false);
        assert.equal(isDigestMessage(chat[1]), true);
        assert.equal(chat[2].mes, 'a real line');
    });

    it('marks the spliced message so the scan can tell it from the scene', async () => {
        const { interceptor, chat } = setup();

        await interceptor(chat, 4000, () => {}, 'normal');

        const digest = chat[1];
        assert.equal(isDigestMessage(digest), true);
        assert.equal(digest.is_user, false);
        assert.equal(digest.name, DIGEST_AUTHOR);
        assert.equal(typeof digest.mes, 'string');
        assert.ok(digest.mes.length > 0, 'the digest has to render something');
        assert.ok(typeof digest.send_date === 'number');
    });

    it('renders the digest it splices, so the two stay in lockstep', async () => {
        // the interceptor owns the render call; if it stopped calling renderDigest
        // the spliced text would be whatever was left over
        const { state, interceptor, chat } = setup();

        await interceptor(chat, 4000, () => {}, 'normal');

        const { text } = renderDigest(state, { contextSize: 4000 });
        assert.equal(chat[1].mes, text);
    });

    it('mutates the array it was handed, which is SillyTavern\'s fresh copy', async () => {
        // coreChat is rebuilt from the real chat before interceptors run, so
        // splicing into the handed array is ephemeral and never touches the
        // persisted chat. Mutating a message object in place would leak.
        const { interceptor, chat } = setup();
        const original = chat[0];
        const before = { ...original };

        await interceptor(chat, 4000, () => {}, 'normal');

        assert.equal(chat[0], original);
        assert.deepEqual(chat[0], before);
    });

    it('does nothing for a quiet generation', async () => {
        // our own scan's pass must not inject a digest, or it would read its own
        // render back through the one-way valve
        const { interceptor, chat } = setup();

        await interceptor(chat, 4000, () => {}, 'quiet');

        assert.equal(chat.length, 2);
        assert.ok(!chat.some((message) => isDigestMessage(message)));
    });
    it('does nothing while there is no ledger yet', async () => {
        const interceptor = createInterceptor({ getState: () => null });
        const chat = [mes('Alyssa', 'the driveway', false), mes('Hailey', 'a real line')];

        await interceptor(chat, 4000, () => {}, 'normal');

        assert.equal(chat.length, 2);
        assert.ok(!chat.some((message) => isDigestMessage(message)));
    });
    it('does nothing while the ledger is unwritten', async () => {
        // an empty ledger is a real state, not a missing one--the DM has not
        // written anything yet, and hasState is false for it. Distinct from the
        // getState() === null case: that is no campaign, this is a silent one.
        const interceptor = createInterceptor({ getState: () => createState() });
        const chat = [mes('Alyssa', 'the driveway', false), mes('Hailey', 'a real line')];

        await interceptor(chat, 4000, () => {}, 'normal');

        assert.equal(chat.length, 2);
        assert.ok(!chat.some((message) => isDigestMessage(message)));
    });

    it('reads the state once, at call time rather than at construction time', async () => {
        // the chat carries the ledger, so getState must be consulted per call or a
        // chat switch would leave the interceptor rendering the previous hero
        const getState = mock.fn(() => ledger());
        const interceptor = createInterceptor({ getState });

        await interceptor([mes('Hailey', 'a')], 4000, () => {}, 'normal');

        assert.equal(getState.mock.callCount(), 1);
    });

    it('ignores the abort argument rather than calling it', async () => {
        const { interceptor, chat } = setup();
        const abort = mock.fn();

        await interceptor(chat, 4000, abort, 'normal');

        assert.equal(abort.mock.callCount(), 0);
    });
});

describe('configured impulse delivery', () => {
    const prepared = (settings = {}) => createState({
        hero: { name: 'Bench hero' },
        appetite: { want: 'Protect her family' },
        impulse: { text: 'Get home to her brother now.', context: 'The robbery blocks the exit.', status: 'active' },
        settings,
    });

    it('delivers system depth 4, user depth 1 and assistant depth 0 without touching real messages', async () => {
        for (const [depth, role] of [[4, 'system'], [1, 'user'], [0, 'assistant']]) {
            const state = prepared({ injectionDepth: depth, injectionRole: role });
            const real = Array.from({ length: 6 }, (_, i) => mes('Fixture', `Scene ${i}`, i % 2 === 1));
            const before = structuredClone(real);
            const core = real.filter(() => true);
            const inject = createInterceptor({ getState: () => state });
            await inject(core, 4000, () => {}, 'normal');
            assert.deepEqual(real, before);
            assert.equal(core.length, 7);
            const digest = core[6 - depth];
            assert.equal(isDigestMessage(digest), true);
            assert.equal(digest.is_user, role === 'user');
            assert.equal(digest.extra.type, role === 'system' ? 'narrator' : undefined);
            assert.match(digest.mes, /Get home to her brother now/);
            assert.match(digest.mes, /Protect her family/);
            assert.match(digest.mes, /Newer scene facts take precedence/);
        }
    });

    it('clamps short and empty chats and counts retained continuation messages', async () => {
        for (const size of [0, 1, 2, 6]) {
            for (const type of ['normal', 'continue', 'swipe']) {
                const core = Array.from({ length: size }, (_, i) => mes('Fixture', `Scene ${i}`, false));
                await createInterceptor({ getState: () => prepared({ injectionDepth: 4 }) })(core, 4000, null, type);
                assert.equal(isDigestMessage(core[Math.max(0, size - 4)]), true);
            }
        }
        for (const size of [0, 1, 3]) {
            const core = Array.from({ length: size }, (_, i) => mes('Fixture', `Scene ${i}`, false));
            await createInterceptor({ getState: () => prepared({ injectionDepth: 0 }) })(core, 4000, null, 'continue');
            assert.equal(isDigestMessage(core[Math.max(0, size - 1)]), true);
            if (size) {
                assert.equal(core.at(-1).mes, `Scene ${size - 1}`);
            }
        }
    });

    it('uses the latest manual or background result without any assessment dependency or await', async () => {
        let state = prepared({ injectionDepth: 1 });
        const inject = createInterceptor({ getState: () => structuredClone(state) });
        const first = [mes('DM', 'The bridge fell.')];
        await inject(first, 4000, null, 'normal');
        assert.match(first[0].mes, /Get home to her brother now/);
        assert.match(first[0].mes, /abandon obsolete actions/);
        state.impulse = { text: 'Stay beside her brother and rest.', context: 'They are safe at home.', status: 'active' };
        const second = [mes('DM', 'They settle beside the fire.')];
        await inject(second, 4000, null, 'continue');
        assert.match(second[0].mes, /Stay beside her brother and rest/);
        assert.doesNotMatch(second[0].mes, /Get home/);
        state = null;
        const other = [mes('DM', 'Another chat')];
        await inject(other, 4000, null, 'normal');
        assert.equal(other.length, 1);
    });

    it('skips raw, dry-run and quiet requests and an intact dose too large for the budget', async () => {
        for (const type of ['raw', 'dryRun', 'quiet', 'impersonate']) {
            const core = [mes('DM')];
            await createInterceptor({ getState: () => prepared() })(core, 4000, null, type);
            assert.equal(core.length, 1);
        }
        const core = [mes('DM')];
        await createInterceptor({ getState: () => prepared() })(core, 100, null, 'normal');
        assert.equal(core.length, 1);
    });

    it('falls back safely for malformed or absent persisted placement', () => {
        assert.deepEqual(digestPlacement(), { depth: null, role: 'assistant' });
        assert.deepEqual(digestPlacement(null), { depth: null, role: 'assistant' });
        for (const depth of [-1, 10001, 1.2, '4', NaN, null]) {
            assert.deepEqual(digestPlacement({ injectionDepth: depth, injectionRole: 'developer' }),
                { depth: null, role: 'assistant' });
        }
    });
});

describe('registerInterceptor', () => {
    it('publishes the interceptor under the name the manifest declares', () => {
        // manifest.json names generate_interceptor: sidekickInterceptor, and
        // extensions.js looks that name up on globalThis at generation time
        delete globalThis[INTERCEPTOR_NAME];

        const interceptor = createInterceptor({ getState: () => ledger() });
        registerInterceptor(interceptor);

        assert.equal(globalThis[INTERCEPTOR_NAME], interceptor);
        delete globalThis[INTERCEPTOR_NAME];
    });

    it('names the digest author and the global the same thing', () => {
        // the two constants describe one contract: what we call ourselves in chat
        assert.equal(DIGEST_AUTHOR, 'Sidekick');
    });
});
