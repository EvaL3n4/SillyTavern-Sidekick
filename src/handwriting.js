/**
 * What she writes into the Sheet with her own hand (§7, Writing by hand and Her
 * hand is a ruling). Pure: the panel draws inputs and calls in here, and every
 * decision about the ledger and the log is made, and tested, here.
 *
 * A hand write goes straight into the ledger through applyProposal with no `from`,
 * so nothing gates it—the gate keeps the scan honest and she is not the scan—and
 * lands as a ChangeEvent with origin `manual` like any other change.
 */
import { applyProposal, getPath, recordRuling } from './state.js';
import { labelChange } from './labels.js';

/** About twenty seconds of quiet closes a field's ruling (§7). Editing time, not story time. */
export const IDLE_MS = 20000;

/** The longest slug: a thread's id is made from a sentence, and should not be one. */
const SLUG_LENGTH = 32;

/**
 * An id for a new entry, made from the words she typed: "Light Throw" is
 * `light-throw`, and one that is taken gets `-2`, `-3`.
 *
 * @param {string[]} taken the ids already in the list
 * @param {string} text what she typed
 * @param {string} [fallback] the id when the text has no letters or digits to make one from
 * @returns {string}
 */
export function slugFor(taken, text, fallback = 'entry') {
    const base = String(text ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, SLUG_LENGTH)
        .replace(/-+$/g, '') || fallback;
    const used = new Set(taken.map(String));
    // an id that is only digits would read as an index (§6 Paths), so it never stands alone
    const stem = /^\d+$/.test(base) ? `${fallback}-${base}` : base;
    let slug = stem;
    for (let n = 2; used.has(slug); n += 1) {
        slug = `${stem}-${n}`;
    }
    return slug;
}

/**
 * Where the first field of a new entry is written, for the "+ power", "+ thread",
 * "+ pressure" and "+ line crossed" slots. A power or thread comes into being under
 * an id made from what she typed; a pressure or line at the next index (§6 Paths).
 *
 * @param {object} state
 * @param {'powers'|'arc.threads'|'arc.pressures'|'arc.linesCrossed'} listPath
 * @param {string} text the name or the words she gave it
 * @returns {string|null} the path of the entry's first field, or null for a list that
 *   cannot be added to
 */
export function entryPath(state, listPath, text) {
    const list = getPath(state, listPath);
    const items = Array.isArray(list) ? list : [];
    switch (listPath) {
        case 'powers':
            return `powers.${slugFor(items.map((power) => power?.id), text, 'power')}.name`;
        case 'arc.threads':
            return `arc.threads.${slugFor(items.map((thread) => thread?.id), text, 'thread')}.text`;
        case 'arc.pressures':
            return `arc.pressures.${items.length}.text`;
        case 'arc.linesCrossed':
            return `arc.linesCrossed.${items.length}.line`;
        default:
            return null;
    }
}

/**
 * Whether writing `path` brings a thread, pressure or crossed line into being, which
 * is when it should be stamped with the newest message: that is where it was born
 * (§6 Paths). Any other write, and any write into an entry that exists, is not born.
 *
 * @param {object} state
 * @param {string} path
 * @returns {boolean}
 */
export function bornWithMessage(state, path) {
    const keys = String(path).split('.');
    if (keys[0] !== 'arc' || keys.length !== 4) {
        return false;
    }
    const list = Array.isArray(state?.arc?.[keys[1]]) ? state.arc[keys[1]] : [];
    if (keys[1] === 'threads') {
        return !list.some((thread) => thread?.id === keys[2]);
    }
    if (keys[1] === 'pressures' || keys[1] === 'linesCrossed') {
        return Number(keys[2]) >= list.length;
    }
    return false;
}

/** The proposalId a `written` ruling is filed under: the field, and nothing else. */
const rulingKey = (path) => `hand:${path}`;

/**
 * The log of what she has written this session: which fields have a ruling that a
 * further edit would still amend. It lives in memory only, and that can only fail
 * safe: a ruling exists from a field's first commit, so losing this log costs an
 * amendment, never a ruling.
 *
 * Idle time is read lazily, from the time of the next commit to the same field, so
 * there is no timer to reach into a chat other than the one it started in.
 *
 * @param {{idleMs?: number, now?: () => number}} [options]
 */
export function createHandLog({ idleMs = IDLE_MS, now = Date.now } = {}) {
    /** path -> {before, at, last}: the value before the first commit, the ruling's `at`, the last commit */
    const open = new Map();

    /**
     * Writes one field and settles its ruling.
     *
     * @param {object} state the live ledger, which this mutates
     * @param {string} path
     * @param {string} value what she committed
     * @param {{citation?: object|null}} [context] the newest message, for a pressure or a
     *   line that comes into being with this write
     * @returns {'unchanged'|'written'|'amended'|'reverted'} what happened to the ledger's
     *   ruling: nothing written, a new ruling, an open one amended, or an open one dropped
     *   because the field is back where it started
     */
    function commit(state, path, value, { citation = null } = {}) {
        const current = getPath(state, path);
        const before = current === undefined || current === null ? '' : String(current);
        if (before === value) {
            return 'unchanged';
        }

        const label = labelChange(state, { path }, [{ path, to: value }]);
        const at = now();
        applyProposal(state, {
            summary: `Wrote ${label}`,
            origin: 'manual',
            evidence: citation ? [citation] : [],
            changes: [{ path, to: value }],
        }, { at });

        const summary = `${label}: ${value || '(cleared)'}`;
        const session = open.get(path);
        const index = session ? state.rulings.findIndex((ruling) => ruling.proposalId === rulingKey(path)
            && ruling.at === session.at) : -1;

        if (session && index >= 0 && at - session.last <= idleMs) {
            if (value === session.before) {
                state.rulings.splice(index, 1);
                open.delete(path);
                return 'reverted';
            }
            state.rulings[index].summary = summary;
            session.last = at;
            return 'amended';
        }

        recordRuling(state, { proposalId: rulingKey(path), summary, action: 'written', path, at });
        open.set(path, { before, at, last: at });
        return 'written';
    }

    /**
     * Closes every open ruling, so the next commit on any field is a new one. Called when
     * the panel closes, the tab changes, the chat changes, and when a removal shifts the
     * indices that paths count by.
     */
    function close() {
        open.clear();
    }

    return { commit, close, isOpen: (path) => open.has(path) };
}
