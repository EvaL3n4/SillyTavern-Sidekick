/**
 * How long a proposal waits (§7, Shelf life).
 *
 * A proposal ages in chat messages, never in days: she moves between chats, and no
 * time passes in the story while she does. It is old once the chat has grown by a
 * scene window's worth of messages since it was filed, which is when the scan itself
 * would no longer read the scene it rests on. A proposal that rests on the character
 * card never ages, because the card does not move with the story. One that names
 * something she has since removed is old at once, and cannot be applied at all: an
 * empty `from` would recreate the entry, nameless (§6 Paths).
 *
 * Old is a mark and never a deletion: nothing leaves the queue unless she rules on it
 * or clears the old ones herself.
 */
import { SCENE_WINDOW } from './evaluate.js';
import { recordRuling } from './state.js';

/**
 * Why a proposal is old, or null when it is not.
 *
 * @param {object} entry a PendingChange
 * @param {number} chatLength how many messages the chat holds now
 * @returns {'removed'|'aged'|null} `removed`: a change names something she took out;
 *   `aged`: the chat has moved a scene window past it
 */
export function oldReason(entry, chatLength) {
    if (entry?.orphaned === true) {
        return 'removed';
    }
    if (entry?.source === 'card') {
        return null;
    }
    // A proposal filed before `filedAt` existed has no age and is never old.
    return Number.isFinite(entry?.filedAt) && Number.isFinite(chatLength)
        && chatLength - entry.filedAt >= SCENE_WINDOW
        ? 'aged'
        : null;
}

/**
 * The queue split in two, each in the order it was filed.
 *
 * @param {object[]|undefined} queue
 * @param {number} chatLength
 * @returns {{current: object[], old: object[]}}
 */
export function partitionQueue(queue, chatLength) {
    const current = [];
    const old = [];
    for (const entry of Array.isArray(queue) ? queue : []) {
        (oldReason(entry, chatLength) === null ? current : old).push(entry);
    }
    return { current, old };
}

/**
 * How many proposals are waiting on her: the number the markers show. An old one is
 * not urgent, so it is not counted.
 *
 * @param {object|null} state
 * @param {number} chatLength
 * @returns {number}
 */
export function waitingCount(state, chatLength) {
    return partitionQueue(state?.queue, chatLength).current.length;
}

/**
 * Clears every old proposal: each is recorded as `stale`, which is a proposal she
 * decided nothing about, and so one the scan learns nothing from (§3), and taken out
 * of the queue.
 *
 * @param {object} state the live ledger, which this mutates
 * @param {number} chatLength
 * @param {{at?: number}} [options]
 * @returns {number} how many were cleared
 */
export function clearOld(state, chatLength, { at = Date.now() } = {}) {
    const { current, old } = partitionQueue(state?.queue, chatLength);
    for (const entry of old) {
        recordRuling(state, {
            proposalId: entry.id,
            summary: entry.summary || '',
            action: 'stale',
            at,
        });
    }
    if (old.length > 0) {
        state.queue = current;
    }
    return old.length;
}
