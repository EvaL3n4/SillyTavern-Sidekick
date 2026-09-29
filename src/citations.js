/**
 * Citation integrity: the locators Sidekick stores about chat messages, and
 * whether they still point where they used to.
 *
 * A citation is a promise about a position in a mutable array. Every message
 * carries a `send_date`, and Swipes install each variant's own date
 * (syncSwipeToMes, public/script.js:6986), so (index, send_date) is the
 * identity ST's own fork and delete mechanics respect: deleting a span shifts
 * indices but leaves the surviving objects' dates alone, and re-rolling a
 * slot installs a different date rather than moving anything.
 *
 * Pure and DOM-free like the rest of the §6-facing modules; the chat is always
 * passed in, so `node --test` can drive every branch, including the healed
 * path that only a deletion makes reachable.
 */

/** A locator: where a message sat, and which message that was. */
const normalize = (citation) => (typeof citation === 'number' ? { index: citation } : citation ?? {});

/** The message's own date, when it has one. */
const dateOf = (message) => message?.send_date;

/**
 * True when the message is a stub in a swipe history rather than the rendered
 * variant: the DM re-rolled this slot and the cited variant only survives in
 * `swipe_info`. chat[i].swipe_info[j].send_date is where the current message
 * parks the date before a swipe takes its place (script.js:6910).
 */
function isRetiredVariant(chat, citation) {
    return chat.some((message) => Array.isArray(message?.swipe_info)
        && message.swipe_info.some((info) => info?.send_date === citation.send_date));
}

/**
 * Turns bare integer evidence into fingerprinted citations, from the chat the
 * proposals were shown. Indices the chat does not hold are skipped: a proposal
 * citing a message the scan never saw is a hallucination, and the caller gates
 * on that.
 *
 * @param {object[]} chat the chat array as SillyTavern holds it
 * @param {number[]} indices evidence as the scan cited it
 * @returns {{index: number, send_date: number}[]}
 */
export function fingerprintCitations(chat, indices) {
    if (!Array.isArray(chat) || !Array.isArray(indices)) {
        return [];
    }

    return indices
        .filter((index) => Number.isInteger(index) && index >= 0 && index < chat.length)
        .map((index) => ({ index, send_date: dateOf(chat[index]) }));
}

/**
 * Where a citation points now, and whether that is still where it pointed.
 *
 * - live: the message at that index still is the cited one.
 * - healed: the cited message moved; the returned index is its new position.
 *   The stored citation should be rewritten to it.
 * - stale, reason 'gone': no message carries that date any more, so the
 *   citation's evidence was deleted.
 * - stale, reason 'rerolled': the slot still exists but its variant was
 *   re-rolled; the cited text survives only in the swipe history.
 *
 * A citation with no date (legacy data, pre-ship) resolves conservatively:
 * live when the index is in range, stale otherwise. A date we never had buys
 * no precision, and inventing one at resolve time would cement whatever the
 * shift left in that slot.
 *
 * @param {object[]} chat the chat array as SillyTavern holds it
 * @param {number|{index: number, send_date?: number}} citation
 * @returns {{status: 'live'|'healed', index: number}
 *   |{status: 'stale', reason: 'gone'|'rerolled'}}
 */
export function resolveCitation(chat, citation) {
    const cited = normalize(citation);
    if (!Array.isArray(chat) || !Number.isInteger(cited.index) || cited.index < 0) {
        return { status: 'stale', reason: 'gone' };
    }

    const here = chat[cited.index];
    if (cited.send_date === undefined) {
        return here ? { status: 'live', index: cited.index } : { status: 'stale', reason: 'gone' };
    }
    if (here && dateOf(here) === cited.send_date) {
        return { status: 'live', index: cited.index };
    }

    // The cited message is not where it was parked. It may have moved (a
    // deletion shifted everything after it), retired into a swipe history (a
    // re-roll), or be gone outright.
    const moved = chat.findIndex((message) => dateOf(message) === cited.send_date);
    if (moved !== -1) {
        return { status: 'healed', index: moved };
    }
    if (isRetiredVariant(chat, cited)) {
        return { status: 'stale', reason: 'rerolled' };
    }
    return { status: 'stale', reason: 'gone' };
}

/** Walks every collection of citations a state holds. */
function citationCollections(state) {
    const collections = [];
    const perMessage = (entry) => {
        if (Array.isArray(entry?.evidence)) {
            collections.push(entry.evidence);
        }
    };

    for (const entry of state?.queue ?? []) {
        perMessage(entry);
    }
    for (const event of state?.history ?? []) {
        perMessage(event);
    }
    for (const power of state?.powers ?? []) {
        for (const event of power?.history ?? []) {
            perMessage(event);
        }
    }
    for (const crossing of state?.arc?.linesCrossed ?? []) {
        if (crossing && 'msgId' in crossing) {
            // msgId is the citation itself, so a healed write lands on the
            // crossing rather than on a copy of its index.
            collections.push([crossing.msgId]);
        }
    }
    return collections;
}

/**
 * Re-resolves every citation the state holds and rewrites the ones that moved.
 * Healed citations are corrected in place, so the second run is a no-op: after
 * a heal the stored index and date agree again.
 *
 * @param {object|null} state a SidekickState (§6), mutated in place
 * @param {object[]} chat the chat array as SillyTavern holds it
 * @returns {{live: number, healed: number, stale: number}}
 */
export function reanchorCitations(state, chat) {
    const counts = { live: 0, healed: 0, stale: 0 };
    if (!state) {
        return counts;
    }

    for (const citations of citationCollections(state)) {
        for (let i = 0; i < citations.length; i += 1) {
            const citation = citations[i];
            const resolution = resolveCitation(chat, citation);

            if (resolution.status === 'live') {
                counts.live += 1;
            } else if (resolution.status === 'healed') {
                counts.healed += 1;
                // Only a fingerprinted citation can move; a legacy one has no
                // date to search for. Rewrite the object in place so both the
                // array slot and any other holder of the reference agree.
                if (typeof citation === 'object' && citation !== null) {
                    citation.index = resolution.index;
                }
            } else {
                counts.stale += 1;
            }
        }
    }
    return counts;
}
