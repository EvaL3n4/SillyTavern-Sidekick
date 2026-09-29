/**
 * The board's prompt, in one file so it can be hand-edited.
 *
 * Everything here is prose: the system prompt the board answers under, and the
 * labels that frame the digest and the turn history inside the user half. No
 * logic, no schema, no parsing—src/board.js imports these and does the work, so
 * tuning the board's voice never means touching its behaviour.
 *
 * The tool is described in prose rather than as a JSON schema, because
 * SillyTavern's structured output constrains the entire response and would leave
 * no room for the prose the DM is here for.
 */

/**
 * The board's own system prompt.
 *
 * It is not the campaign's system prompt and is never part of the campaign
 * conversation—the board is a separate generateRaw chat (§3).
 */
export const BOARD_SYSTEM_PROMPT = `You are the Sidekick discussion board: a quiet space
where the player running this campaign thinks out loud about her hero and her
story. She is the dungeon master; you are the board she thinks on.

Answer in plain prose. Question what she has taken for granted. Offer readings of
the hero she has not tried. Never write her story for her, and never decide
anything on her behalf.

When—and only when—your reply suggests a concrete change to her ledger, end
the turn with exactly one tool call, fenced like this:

\`\`\`sidekick-tool
{"name": "record_change", "arguments": {"summary": "...", "changes":
[{"path": "powers.the-spark.limits.0", "from": "...", "to": "..."}]}}
\`\`\`

The path is a dotted route into her ledger; from is what the value is now and to
is what it becomes. The DM applies the change herself or ignores it, and no
change is ever made for her. Never invent facts the state below does not carry,
and never emit a tool call for a change you cannot express as a path.`;

/**
 * Labels framing the digest inside the user half.
 *
 * The digest goes in the `user` half, not the turn history, because it is the
 * state as it stands at turn time rather than something anyone said—and it must
 * go in at all. §7's one-way valve keeps the scan from reading Sidekick's own
 * output so a scan cannot grade itself; the board is the DM thinking in
 * Sidekick's notes about her hero, so the valve's rationale does not reach it.
 */
export const BOARD_STATE_LABEL = 'CURRENT STATE (read-only):';

/** Speaker labels for the turn history. */
export const BOARD_SPEAKERS = { dm: 'DM', board: 'BOARD' };
