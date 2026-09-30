import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    BOARD_KEY,
    BOARD_TURN_LIMIT,
    appendTurn,
    boardContext,
    buildBoardPrompt,
    createBoard,
    ledgerMap,
    parseToolCall,
    readBoard,
    runBoardTurn,
    BOARD_TOOL_NAME,
} from '../src/board.js';
import {
    BOARD_PATHS_LABEL,
    BOARD_SPEAKERS,
    BOARD_STATE_LABEL,
    BOARD_SYSTEM_PROMPT,
} from '../src/board-prompt.js';
import { ledger } from './fixtures.js';
import { createState } from '../src/state.js';

/** A reply that ends in a valid tool call. */
function withTool(summary = 'she is ready for a second limit') {
    const tool = JSON.stringify({
        name: 'record_change',
        arguments: {
            summary,
            changes: [{ path: 'powers.the-spark.limits.1', to: 'unfocused it takes everything from the waist down' }],
        },
    });
    return `The board thinks she is ready.

\`\`\`sidekick-tool
${tool}
\`\`\``;
}

/** A turn that passes isTurn, so tests can vary one field at a time. */
function turn(overrides = {}) {
    return { role: 'dm', text: 'she is thinking', at: 1000, ...overrides };
}

describe('createBoard', () => {
    it('returns an empty board', () => {
        assert.deepEqual(createBoard(), { turns: [] });
    });
});

describe('readBoard', () => {
    it('names the chatMetadata slot it reads', () => {
        assert.equal(BOARD_KEY, 'sidekick_board');
    });

    it('returns an empty board for undefined, null and a non-object', () => {
        for (const raw of [undefined, null, 4, 'board', true]) {
            assert.deepEqual(readBoard(raw), { turns: [] });
        }
    });

    it('returns an empty board when turns is not an array', () => {
        assert.deepEqual(readBoard({ turns: 'she is thinking' }), { turns: [] });
    });

    it('drops malformed turns rather than the whole board', () => {
        const board = readBoard({
            turns: [
                turn(),
                turn({ role: 'narrator' }),
                turn({ role: 'board', at: 'yesterday' }),
                turn({ text: 12 }),
                null,
                'she is thinking',
                turn({ role: 'board', text: 'the board replies', at: 2000 }),
            ],
        });

        assert.equal(board.turns.length, 2);
        assert.equal(board.turns[0].role, 'dm');
        assert.equal(board.turns[1].text, 'the board replies');
    });

    it('keeps a turn carrying a tool, and one without', () => {
        const board = readBoard({
            turns: [
                turn({ tool: { name: 'record_change', arguments: { changes: [] } } }),
                turn({ tool: undefined }),
            ],
        });

        assert.equal(board.turns.length, 2);
        assert.deepEqual(board.turns[0].tool, { name: 'record_change', arguments: { changes: [] } });
        assert.equal(board.turns[1].tool, undefined);
    });

    it('drops a turn whose tool is not an object', () => {
        const board = readBoard({ turns: [turn({ tool: 'record_change' }), turn({ tool: null })] });

        assert.equal(board.turns.length, 0);
    });

    it('keeps fields it does not know, because the DM may have written them', () => {
        const board = readBoard({ turns: [turn({ pinned: true })] });

        assert.equal(board.turns[0].pinned, true);
    });

    it('returns a fresh board every time', () => {
        const first = readBoard({ turns: [turn()] });
        const second = readBoard({ turns: [turn()] });

        assert.notEqual(first.turns[0], second.turns[0]);
    });
});

describe('appendTurn', () => {
    it('mutates and returns the board it was given', () => {
        const board = createBoard();
        const returned = appendTurn(board, turn());

        assert.equal(returned, board);
        assert.equal(board.turns.length, 1);
    });

    it('keeps a board turn and a dm turn in the order they arrived', () => {
        const board = createBoard();
        appendTurn(board, turn());
        appendTurn(board, turn({ role: 'board', text: 'and the board answers', at: 2000 }));

        assert.deepEqual(
            board.turns.map((entry) => entry.role),
            ['dm', 'board'],
        );
    });

    it('drops a turn that fails validation, leaving the board untouched', () => {
        const board = createBoard();
        appendTurn(board, turn());

        for (const bad of [turn({ role: 'narrator' }), turn({ text: 12 }), turn({ at: null }), null, 'x']) {
            appendTurn(board, bad);
        }

        assert.equal(board.turns.length, 1);
    });

    it('trims oldest-first once the board outgrows its limit', () => {
        const board = createBoard();
        for (let i = 0; i < BOARD_TURN_LIMIT + 6; i++) {
            appendTurn(board, turn({ text: `turn ${i}` }));
        }

        assert.equal(board.turns.length, BOARD_TURN_LIMIT);
        assert.equal(board.turns[0].text, 'turn 6');
        assert.equal(board.turns[board.turns.length - 1].text, `turn ${BOARD_TURN_LIMIT + 5}`);
    });

    it('never trims the exchange the DM is reading', () => {
        const board = createBoard();
        for (let i = 0; i < BOARD_TURN_LIMIT; i++) {
            appendTurn(board, turn({ text: `turn ${i}` }));
        }
        appendTurn(board, turn({ role: 'board', text: 'the reply she is waiting for' }));

        assert.equal(board.turns.length, BOARD_TURN_LIMIT);
        assert.equal(board.turns[board.turns.length - 1].text, 'the reply she is waiting for');
        assert.equal(board.turns[0].text, 'turn 1');
    });
});

describe('boardContext', () => {
    it('returns every turn when the board is under the limit', () => {
        const board = createBoard();
        appendTurn(board, turn({ text: 'one' }));
        appendTurn(board, turn({ text: 'two' }));

        assert.deepEqual(
            boardContext(board).map((entry) => entry.text),
            ['one', 'two'],
        );
    });

    it('caps the window at the limit, keeping the tail', () => {
        const board = createBoard();
        for (let i = 0; i < BOARD_TURN_LIMIT + 2; i++) {
            appendTurn(board, turn({ text: `turn ${i}` }));
        }

        const seen = boardContext(board, { limit: 3 });

        assert.deepEqual(
            seen.map((entry) => entry.text),
            [`turn ${BOARD_TURN_LIMIT - 1}`, `turn ${BOARD_TURN_LIMIT}`, `turn ${BOARD_TURN_LIMIT + 1}`],
        );
    });

    it('falls back to BOARD_TURN_LIMIT for a limit that is not a positive integer', () => {
        const board = createBoard();
        for (let i = 0; i < BOARD_TURN_LIMIT + 1; i++) {
            appendTurn(board, turn({ text: `turn ${i}` }));
        }

        for (const limit of [0, -3, 2.5, '10', NaN, undefined]) {
            assert.equal(boardContext(board, { limit }).length, BOARD_TURN_LIMIT);
        }
    });

    it('returns nothing for a board with no usable turns', () => {
        for (const board of [createBoard(), {}, { turns: 'she is thinking' }, null, undefined]) {
            assert.deepEqual(boardContext(board), []);
        }
    });

    it('does not let the store and the window share one cap', () => {
        const board = createBoard();
        for (let i = 0; i < 8; i++) {
            appendTurn(board, turn({ text: `turn ${i}` }));
        }

        assert.equal(board.turns.length, 8);
        assert.equal(boardContext(board, { limit: 2 }).length, 2);
    });
});

describe('ledgerMap', () => {
    it('addresses an appetite-only ledger but excludes scene impulse writes', () => {
        const state = createState({
            appetite: { want: 'To be trusted', firstTaste: 'watched a rescuer as a child' },
            impulse: { text: 'Reach the shelter', status: 'active' },
        });
        const map = ledgerMap(state);
        assert.match(map, /^appetite\.want = "To be trusted"$/m);
        assert.match(map, /^appetite\.firstTaste = "watched a rescuer as a child"$/m);
        assert.match(map, /^appetite\.expression = ""$/m);
        assert.ok(!map.includes('impulse.'));
        assert.equal(ledgerMap(createState()), '');
        assert.equal(ledgerMap(createState({ appetite: { want: '   ' } })), '');
    });
    it('addresses a power by its id, the way a path is written', () => {
        // The digest render names what a power does and never where it lives, so
        // without this the path a tool call needs is not in the context at all.
        const map = ledgerMap(ledger());

        assert.match(map, /^powers\.the-spark\.capability = /m);
        assert.match(map, /^powers\.the-spark\.limits\.0 = "no control"$/m);
        assert.match(map, /^arc\.threads\.t1\.text = /m);
    });

    it('quotes each value so a from can be copied exactly', () => {
        const map = ledgerMap(ledger());

        assert.match(map, /^powers\.the-spark\.capability = "a blue-black force that wraps what she protects"$/m);
        // an unwritten field is still addressable, and still visibly empty
        assert.match(map, /^hero\.codename = ""$/m);
        assert.match(map, /^appetite\.firstTaste = ""$/m);
    });

    it('names the vocabulary a constrained field accepts', () => {
        // `stage` cannot be guessed, and a guessed stage is a refused change.
        const map = ledgerMap(ledger());

        assert.match(map, /^# powers\.<id>\.stage accepts: new, settling$/m);
    });

    it('lists a plain list by its number, and a crossed line by index', () => {
        const map = ledgerMap(ledger());

        assert.match(map, /^arc\.pressures\.0\.text = "her family must not learn"$/m);
        assert.match(map, /^arc\.pressures\.1\.text = "the council wants answers"$/m);
        assert.match(map, /^arc\.linesCrossed\.0\.provides = "a stranger saw"$/m);
    });

    it('says nothing at all for a state that is not written', () => {
        assert.equal(ledgerMap(null), '');
        assert.equal(ledgerMap({}), '');
    });
});
describe('buildBoardPrompt', () => {
    it('names the tool the DM can apply', () => {
        assert.equal(BOARD_TOOL_NAME, 'record_change');
    });

    it('puts the digest and the addresses in the user half, not the history', () => {
        // The digest is the state as prose; the ledger map is the same state as
        // paths. A tool call names a path, and the prose holds none, so the map is
        // not decoration—without it every path the board offers is invented.
        const board = createBoard();
        appendTurn(board, { role: 'dm', text: 'what now?', at: 1 });

        const { system, user } = buildBoardPrompt(ledger(), board);

        assert.equal(system, BOARD_SYSTEM_PROMPT);
        assert.match(user, new RegExp(`${BOARD_SPEAKERS.dm}: what now\\?`));
        assert.match(user, new RegExp(BOARD_STATE_LABEL.replace(/[()]/g, '\\$&')));
        assert.match(user, /CURRENT STATE \(read-only\):/);
        assert.match(user, /Hailey Kogami Green/);
        assert.match(user, new RegExp(BOARD_PATHS_LABEL.replace(/[()]/g, '\\$&')));
        assert.match(user, /powers\.the-spark\.limits\.0 = "no control"/);
    });

    it('points the prompt at the map it was given', () => {
        // The instruction must name the section the addresses actually arrive in,
        // or a model that reads carefully still cannot follow it.
        assert.match(BOARD_SYSTEM_PROMPT, new RegExp(BOARD_PATHS_LABEL.replace(/[()]/g, '\\$&')));
    });

    it('labels whose line is whose', () => {
        const board = createBoard();
        appendTurn(board, { role: 'board', text: 'she is holding something back.', at: 2 });

        const { user } = buildBoardPrompt(ledger(), board);

        assert.match(user, new RegExp(`${BOARD_SPEAKERS.board}: she is holding something back\\.`));
        assert.doesNotMatch(user, /DM:/);
    });
    it('carries only the digest for an empty board', () => {
        const { user } = buildBoardPrompt(ledger(), createBoard());

        assert.match(user, new RegExp(`^${BOARD_STATE_LABEL.replace(/[()]/g, '\\$&')}`));
    });

    it('describes the tool it asks for, fence and all', () => {
        // The board takes no jsonSchema, so the system prompt is the entire
        // contract. It has to name the tool, its arguments, and their meaning—
        // a prompt that only says 'end with a tool call' leaves the model guessing
        // at what the arguments are and what they do.
        assert.match(BOARD_SYSTEM_PROMPT, /```sidekick-tool/);
        assert.match(BOARD_SYSTEM_PROMPT, /record_change/);
        assert.match(BOARD_SYSTEM_PROMPT, /summary/);
        assert.match(BOARD_SYSTEM_PROMPT, /changes/);
        // the three parts of an edit, each named rather than shown only as an example
        assert.match(BOARD_SYSTEM_PROMPT, /\bpath\b/);
        assert.match(BOARD_SYSTEM_PROMPT, /\bfrom\b/);
        assert.match(BOARD_SYSTEM_PROMPT, /\bto\b/);
        // the consent it is built on
        assert.match(BOARD_SYSTEM_PROMPT, /never decide/);
        assert.match(BOARD_SYSTEM_PROMPT, /applies the change herself, in one click/);
        assert.match(BOARD_SYSTEM_PROMPT, /One tool call per turn at most/);
        // a from that does not match silently drops the change, so the prompt has
        // to say when to leave it out rather than when to fill it in
        assert.match(BOARD_SYSTEM_PROMPT, /leave from out/);
    });
});

describe('parseToolCall', () => {
    it('strips a valid block and returns the tool', () => {
        const { text, tool } = parseToolCall(withTool());

        assert.equal(text, 'The board thinks she is ready.');
        assert.equal(tool.name, 'record_change');
        assert.equal(tool.arguments.summary, 'she is ready for a second limit');
        assert.equal(tool.arguments.changes.length, 1);
    });

    it('returns the text verbatim when there is no fence', () => {
        const reply = 'the board is just thinking out loud.';
        assert.deepEqual(parseToolCall(reply), { text: reply, tool: null });
    });

    it('returns the text verbatim for an unclosed fence', () => {
        const reply = 'half a call.\n\n```sidekick-tool\n{\"name\"';
        assert.deepEqual(parseToolCall(reply), { text: reply, tool: null });
    });

    it('returns the text verbatim when the payload is not JSON', () => {
        const reply = 'a broken call.\n\n```sidekick-tool\nnot json at all\n```';
        assert.deepEqual(parseToolCall(reply), { text: reply, tool: null });
    });

    it('returns the text verbatim for a tool the DM cannot apply', () => {
        const reply = 'a call.\n\n```sidekick-tool\n{\"name\": \"teleport\", \"arguments\": {}}\n```';
        assert.deepEqual(parseToolCall(reply), { text: reply, tool: null });
    });

    it('returns the text verbatim when the arguments are not an object', () => {
        const reply = 'a call.\n\n```sidekick-tool\n{\"name\": \"record_change\", \"arguments\": 4}\n```';
        assert.deepEqual(parseToolCall(reply), { text: reply, tool: null });
    });

    it('returns the text verbatim for a JSON null payload', () => {
        const reply = 'a call.\n\n```sidekick-tool\nnull\n```';
        assert.deepEqual(parseToolCall(reply), { text: reply, tool: null });
    });

    it('accepts the tool it was told to look for', () => {
        const { tool } = parseToolCall(withTool(), { name: 'record_change' });

        assert.equal(tool.name, 'record_change');
    });

    it('keeps nothing but empty text for a non-string reply', () => {
        assert.deepEqual(parseToolCall(undefined), { text: '', tool: null });
        assert.deepEqual(parseToolCall(12), { text: '', tool: null });
    });

    it('trims only the trailing gap the fence left', () => {
        const parsed = parseToolCall('one.\n\ntwo.\n\n```sidekick-tool\n{\"name\": \"record_change\", \"arguments\": {}}\n```');

        assert.equal(parsed.text, 'one.\n\ntwo.');
    });
});

describe('runBoardTurn', () => {
    it('generates once, with the board\'s own system prompt and no schema', async () => {
        const calls = [];
        const generate = async (call) => {
            calls.push(call);
            return withTool();
        };

        await runBoardTurn(ledger(), createBoard(), { generate });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].systemPrompt, BOARD_SYSTEM_PROMPT);
        assert.match(calls[0].prompt, /Hailey Kogami Green/);
        // a schema would swallow the whole reply, tool call included
        assert.equal(Object.hasOwn(calls[0], 'jsonSchema'), false);
    });

    it('files the reply in the board and returns it', async () => {
        const board = createBoard();
        const turn = await runBoardTurn(ledger(), board, { generate: async () => withTool(), at: 5 });

        assert.equal(board.turns.length, 1);
        assert.equal(turn, board.turns[0]);
        assert.equal(turn.role, 'board');
        assert.equal(turn.text, 'The board thinks she is ready.');
        assert.equal(turn.at, 5);
        assert.equal(turn.tool.name, 'record_change');
    });

    it('files a turn with no tool key when none was offered', async () => {
        const turn = await runBoardTurn(ledger(), createBoard(), {
            generate: async () => 'the board is just thinking.',
        });

        assert.equal(Object.hasOwn(turn, 'tool'), false);
    });

    it('lets a generation failure through, so the DM sees it', async () => {
        const board = createBoard();

        await assert.rejects(
            () => runBoardTurn(ledger(), board, {
                generate: async () => {
                    throw new Error('the backend went away');
                },
            }),
            /the backend went away/,
        );

        assert.equal(board.turns.length, 0);
    });

    it('names a reply that is not text', async () => {
        await assert.rejects(
            () => runBoardTurn(ledger(), createBoard(), { generate: async () => ({ text: 'an object' }) }),
            /the board returned something that is not text/,
        );
    });

    it('refuses to run without a generator, before any call', async () => {
        await assert.rejects(() => runBoardTurn(ledger(), createBoard(), {}), /the board needs a generation function/);
    });
});
