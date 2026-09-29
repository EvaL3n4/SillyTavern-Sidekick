/**
 * Discussion board (§3): a separate `generateRaw` chat with its own system
 * prompt, away from the campaign chat, where the DM thinks out loud and
 * outputs can be applied as changes.
 *
 * The board lives in chatMetadata under BOARD_KEY, beside the state ledger:
 * campaign data dies with the chat, travels with its export, and survives a
 * branch switch (chat_metadata rides the chat header, script.js:7403). The
 * conversation itself is read and written by index.js, which owns context()—
 * nothing here touches the DOM, so the whole module stays under node --test.
 */

export const BOARD_KEY = 'sidekick_board';

/**
 * How many turns a board keeps. A board that grew forever would bloat the
 * chat's metadata, so the oldest turns go first—never the final exchange,
 * because the turn the DM is reading is the one she asked for.
 */
export const BOARD_TURN_LIMIT = 40;

/** @returns {{turns: object[]}} an empty board */
export function createBoard() {
    return { turns: [] };
}

/**
 * Whether a value can stand as a turn.
 *
 * Deliberately liberal about extra fields: the board is the DM's own prose in
 * a metadata slot she can hand-edit, and an unrecognized field should ride
 * along rather than drop her writing. Only the fields the surface reads are
 * checked.
 */
function isTurn(value) {
    return (
        value !== null &&
        typeof value === 'object' &&
        (value.role === 'dm' || value.role === 'board') &&
        typeof value.text === 'string' &&
        typeof value.at === 'number' &&
        (value.tool === undefined || (value.tool !== null && typeof value.tool === 'object'))
    );
}

/**
 * Normalizes whatever chatMetadata holds at BOARD_KEY into a board.
 *
 * A missing key, a non-object, or a turns array that is not an array all read
 * as an empty board, and individual malformed turns are dropped. This is the
 * board's only migration, and there is no version: a shape that has never
 * shipped outside this repo's stub needs no migration ladder, and SCHEMA_VERSION
 * belongs to the hero ledger (§6).
 *
 * @param {unknown} raw the parsed chatMetadata slot
 * @returns {{turns: object[]}} a board, never thrown
 */
export function readBoard(raw) {
    const board = createBoard();

    if (raw === null || typeof raw !== 'object' || !Array.isArray(raw.turns)) {
        return board;
    }

    board.turns = raw.turns.filter(isTurn);
    return board;
}

/**
 * Appends a turn and trims the board to BOARD_TURN_LIMIT.
 *
 * Mutates and returns the board, matching applyProposal's convention. A turn
 * that fails validation is dropped rather than thrown, for the same reason
 * readBoard tolerates junk: one malformed line must not brick the pane.
 *
 * @param {{turns: object[]}} board
 * @param {object} turn
 * @returns {{turns: object[]}} the same board
 */
export function appendTurn(board, turn) {
    if (!isTurn(turn)) {
        return board;
    }

    board.turns.push(turn);

    const overflow = board.turns.length - BOARD_TURN_LIMIT;
    if (overflow > 0) {
        board.turns.splice(0, overflow);
    }

    return board;
}

/**
 * The window a generation reads.
 *
 * Kept apart from the store so what the model sees can be capped ahead of what
 * the board keeps: the DM's conversation may hold forty turns while a turn's
 * prompt only needs the tail.
 *
 * @param {{turns?: object[]}} board
 * @param {object} [options]
 * @param {number} [options.limit] falls back to BOARD_TURN_LIMIT
 * @returns {object[]} the final `limit` turns, oldest first
 */
export function boardContext(board, { limit = BOARD_TURN_LIMIT } = {}) {
    if (!Array.isArray(board?.turns)) {
        return [];
    }

    const cap = Number.isInteger(limit) && limit > 0 ? limit : BOARD_TURN_LIMIT;
    return board.turns.slice(-cap);
}

/** @throws {Error} not implemented yet */
export async function openBoard() {
    throw new Error('Sidekick: the discussion board is not implemented yet');
}
