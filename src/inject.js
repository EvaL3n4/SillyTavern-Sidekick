/**
 * The generate_interceptor: delivers prepared direction at the chat's chosen
 * depth and role (§5), preserving original placement until configured.
 *
 * SillyTavern hands us a filtered copy of the chat array (`coreChat =
 * chat.filter(...)` in script.js) whose message objects are shared with the
 * real chat. Splicing in a NEW message is therefore ephemeral; mutating an
 * existing one in place would persist. The digest is always its own object.
 */
import { renderDigest, shouldSkip } from './grammar.js';

/** The name the manifest's `generate_interceptor` field points at. */
export const INTERCEPTOR_NAME = 'sidekickInterceptor';

/** §5: the name the injected digest carries in the chat array. */
export const DIGEST_AUTHOR = 'Sidekick';

/** Host-supported system content marker, not the filtered is_system flag. */
const NARRATOR_TYPE = 'narrator';

/** Invalid persisted placement falls back to the original behavior. */
export function digestPlacement(settings = {}) {
    const depth = settings?.injectionDepth;
    return {
        depth: Number.isInteger(depth) && depth >= 0 && depth <= 10000 ? depth : null,
        role: ['system', 'user', 'assistant'].includes(settings?.injectionRole)
            ? settings.injectionRole : 'assistant',
    };
}

/**
 * True for a message this extension inserted.
 *
 * The check is on an `extra` flag rather than on the name alone: matching
 * `name` would silently drop a real message from any campaign whose character
 * happens to be called Sidekick, and the scan would quietly read a shorter
 * scene than the DM wrote. The name stays for readability; the flag is what
 * makes identification exact.
 *
 * @param {object} message a chat message
 * @returns {boolean}
 */
export function isDigestMessage(message) {
    return message?.extra?.sidekick === true;
}
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

        const { depth, role } = digestPlacement(state.settings);
        // Keep the retained character reply last: the host extracts it as the
        // continuation target/prefill. Its own depth-zero text injection does this too.
        const offset = type === 'continue' && depth === 0 ? 1 : depth;
        const index = depth === null ? lastUserMessageIndex(chat) : Math.max(0, chat.length - offset);
        chat.splice(index, 0, {
            is_user: role === 'user',
            name: DIGEST_AUTHOR,
            send_date: Date.now(),
            mes: text,
            // so the evaluation scan can tell our render from the DM's scene
            extra: { sidekick: true, ...(role === 'system' ? { type: NARRATOR_TYPE } : {}) },
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
