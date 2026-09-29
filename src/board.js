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
import { renderDigest } from './grammar.js';


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

/**
 * The tool a board turn ends with: the DM applies it with one click, and
 * nothing reaches state without that click (§3).
 */
export const BOARD_TOOL_NAME = 'record_change';


/**
 * The prompt prose lives in src/board-prompt.js, where it can be hand-edited
 * without touching this module's behaviour. §3's tool contract is carried here
 * because the parsing below depends on it.
 */
import {
    BOARD_SPEAKERS,
    BOARD_STATE_LABEL,
    BOARD_SYSTEM_PROMPT,
} from './board-prompt.js';

/**
 * Assembles one board turn's prompt.
 *
 * The digest render goes in the `user` half, not the turn history, because it is
 * the state as it stands at turn time rather than something anyone said—and it
 * must go in at all. §7's one-way valve keeps the scan from reading Sidekick's
 * own output so a scan cannot grade itself; the board is the DM thinking in
 * Sidekick's notes about her hero, so the valve's rationale does not reach it.
 *
 * @param {object} state the hero ledger
 * @param {{turns?: object[]}} board
 * @returns {{system: string, user: string}}
 */
export function buildBoardPrompt(state, board) {
    const history = boardContext(board)
        .map((turn) => `${BOARD_SPEAKERS[turn.role] ?? turn.role}: ${turn.text}`)
        .join('\n\n');

    return {
        system: BOARD_SYSTEM_PROMPT,
        user: [history, BOARD_STATE_LABEL, renderDigest(state).text]
            .filter(Boolean)
            .join('\n\n'),
    };
}

/**
 * The fence a board turn ends its tool call with.
 */
const TOOL_FENCE = /```[ \t]*sidekick-tool[ \t]*\r?\n([\s\S]*?)```/;

/**
 * Splits a board turn into what the DM reads and the tool it offered.
 *
 * The fence must open on ``` sidekick-tool and close on ```, and the payload
 * must be JSON naming the tool with an object of arguments. Anything
 * else—unclosed, unparseable, the wrong tool—returns the text verbatim with no
 * tool, so the DM reads what the board actually said, including its failure.
 *
 * @param {string} raw the board's reply as it was generated
 * @param {object} [options]
 * @param {string} [options.name] the tool name the DM can apply
 * @returns {{text: string, tool: object|null}}
 */
export function parseToolCall(raw, { name = BOARD_TOOL_NAME } = {}) {
    if (typeof raw !== 'string') {
        return { text: '', tool: null };
    }

    const match = TOOL_FENCE.exec(raw);
    if (!match) {
        return { text: raw, tool: null };
    }

    let parsed;
    try {
        parsed = JSON.parse(match[1].trim());
    } catch {
        return { text: raw, tool: null };
    }

    if (parsed === null || typeof parsed !== 'object' || parsed.name !== name) {
        return { text: raw, tool: null };
    }

    if (parsed.arguments === null || typeof parsed.arguments !== 'object') {
        return { text: raw, tool: null };
    }

    return {
        text: raw.slice(0, match.index).trimEnd(),
        tool: { name: parsed.name, arguments: parsed.arguments },
    };
}

/**
 * Runs one board turn: assemble the prompt, generate once, and file the reply.
 *
 * The generation takes no schema, for the reason the system prompt's comment
 * gives. A failure propagates to the surface, which shows it—the DM is sitting
 * at the board waiting for a reply, unlike the scan whose silence is §3 policy.
 *
 * @param {object} state the hero ledger
 * @param {{turns?: object[]}} board
 * @param {object} deps
 * @param {(call: {prompt: string, systemPrompt: string}) => Promise<string>} deps.generate
 * @param {number} [deps.at] the turn's timestamp
 * @returns {Promise<object>} the reply's turn, already in the board
 */
export async function runBoardTurn(state, board, { generate, at = Date.now() }) {
    if (typeof generate !== 'function') {
        throw new Error('Sidekick: the board needs a generation function');
    }

    const prompt = buildBoardPrompt(state, board);
    const reply = await generate({ prompt: prompt.user, systemPrompt: prompt.system });

    if (typeof reply !== 'string') {
        throw new Error('Sidekick: the board returned something that is not text');
    }

    const { text, tool } = parseToolCall(reply);
    const turn = { role: 'board', text, at };
    if (tool) {
        turn.tool = tool;
    }

    appendTurn(board, turn);
    return turn;
}
