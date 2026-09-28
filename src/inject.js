/**
 * The generate_interceptor: builds the digest and slips it in before the last
 * user message (§5).
 *
 * SillyTavern hands us a filtered copy of the chat array (`coreChat =
 * chat.filter(...)` in script.js) whose message objects are shared with the
 * real chat. Splicing in a NEW message is therefore ephemeral; mutating an
 * existing one in place would persist. The digest is always its own object.
 */
import { renderDigest, shouldSkip } from './grammar.js';

/** The name the manifest's `generate_interceptor` field points at. */
export const INTERCEPTOR_NAME = 'sidekickInterceptor';

/**
 * @param {object} options
 * @param {() => object|null} options.getState current SidekickState, or null
 * @returns {Function} the interceptor SillyTavern will call
 */
export function createInterceptor({ getState }) {
    /**
     * @param {object[]} chat prompt array for this generation
     * @param {number} contextSize tokens already counted for this prompt
     * @param {Function} [_abort] abort the generation
     * @param {string} [type] what triggered it ('quiet', 'swipe', ...)
     */
    return async function sidekickInterceptor(chat, contextSize, _abort, type) {
        const state = getState();
        if (shouldSkip({ type, state })) {
            return;
        }

        const { text } = renderDigest(state, { contextSize });
        if (!text) {
            return;
        }

        chat.splice(lastUserMessageIndex(chat), 0, {
            is_user: false,
            name: 'Sidekick',
            send_date: Date.now(),
            mes: text,
        });
    };
}

/**
 * Insertion point: immediately before the final user message. Falls back to the
 * end when the turn being answered is not a user turn (continue, impersonate).
 * @param {object[]} chat
 * @returns {number}
 */
export function lastUserMessageIndex(chat) {
    for (let i = chat.length - 1; i >= 0; i -= 1) {
        if (chat[i]?.is_user) {
            return i;
        }
    }
    return chat.length;
}

export function registerInterceptor(interceptor) {
    globalThis[INTERCEPTOR_NAME] = interceptor;
}
