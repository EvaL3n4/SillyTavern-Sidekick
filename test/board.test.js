import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    BOARD_KEY,
    BOARD_TURN_LIMIT,
    appendTurn,
    boardContext,
    createBoard,
    readBoard,
} from '../src/board.js';

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
