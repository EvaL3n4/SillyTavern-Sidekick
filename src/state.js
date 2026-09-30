/**
 * State load/migrate/save, provenance-gated mutations, ruling log.
 * Schema: DESIGN.md §6.
 *
 * Pure by construction—no SillyTavern imports—so this runs under `node --test`.
 * index.js binds the read/write ends to chatMetadata.
 */

/** Schema version. Bump only with a matching entry in MIGRATIONS. */
export const SCHEMA_VERSION = 2;

const APPETITE_FIELDS = ['want', 'firstTaste', 'condition', 'expression', 'residue'];
export const IMPULSE_STATUSES = ['inactive', 'active', 'suspended', 'satisfied'];

/** Read only owned prose fields; an absent first taste remains unknown. */
function proseFields(raw, fields) {
    return Object.fromEntries(fields.map((key) => [
        key,
        isPlainObject(raw) && Object.hasOwn(raw, key) && typeof raw[key] === 'string' ? raw[key] : '',
    ]));
}

export function normalizeAppetite(raw) {
    return proseFields(raw, APPETITE_FIELDS);
}

export function normalizeImpulse(raw) {
    const prose = proseFields(raw, ['text', 'context']);
    const status = isPlainObject(raw) && Object.hasOwn(raw, 'status') ? raw.status : null;
    return {
        ...prose,
        status: prose.text.trim() && IMPULSE_STATUSES.includes(status) ? status : 'inactive',
    };
}

/** Rolling window for the ruling log. Older rulings go first (§3). */
export const RULING_WINDOW = 50;

/** Maps `from-version` → `(state) => void` for forward-only migrations. */
const MIGRATIONS = new Map();

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merges `source` into `target` in place. Plain objects merge one level deep so a
 * partial override keeps its siblings; arrays and scalars are replaced wholesale,
 * because a proposal never merges into a list partially.
 */
function mergeInto(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (isPlainObject(value) && isPlainObject(target[key])) {
            mergeInto(target[key], value);
        } else {
            target[key] = value;
        }
    }
}

export function createState(overrides = {}) {
    const state = {
        version: SCHEMA_VERSION,
        cosmology: {
            sources: [],
            stageVocabulary: [],
            costVocabulary: [],
            taboos: '',
        },
        hero: { name: '', codename: '', statusQuo: '' },
        appetite: normalizeAppetite(),
        impulse: normalizeImpulse(),
        powers: [],
        arc: { phase: '', threads: [], pressures: [], linesCrossed: [] },
        queue: [],
        history: [],
        rulings: [],
        // matches DEFAULT_CADENCE in src/evaluate.js
        settings: { evaluationCadence: 15, digestBudgetTokens: 200 },
    };

    if (isPlainObject(overrides)) {
        mergeInto(state, {
            ...overrides,
            appetite: normalizeAppetite(overrides.appetite),
            impulse: normalizeImpulse(overrides.impulse),
        });
    }

    return state;
}

/** Arrays are trusted to be arrays, and nothing else. */
function arrayOf(value) {
    return Array.isArray(value) ? value : [];
}

/**
 * Fills in anything a stored state is missing, without touching what it has.
 * The 0→1 step: anything written before schema versioning existed is whole.
 */
MIGRATIONS.set(0, (state) => {
    const base = createState();
    Object.assign(state, {
        ...base,
        ...state,
        version: 0,
        cosmology: { ...base.cosmology, ...state.cosmology },
        hero: { ...base.hero, ...state.hero },
        arc: {
            ...base.arc,
            ...state.arc,
            threads: arrayOf(state.arc?.threads),
            pressures: arrayOf(state.arc?.pressures),
            linesCrossed: arrayOf(state.arc?.linesCrossed),
        },
        settings: { ...base.settings, ...state.settings },
        powers: arrayOf(state.powers),
        queue: arrayOf(state.queue),
        history: arrayOf(state.history),
        rulings: arrayOf(state.rulings),
    });
});

/** Add separate appetite and impulse records without rewriting existing entries. */
MIGRATIONS.set(1, (state) => {
    state.appetite = normalizeAppetite(state.appetite);
    state.impulse = normalizeImpulse(state.impulse);
});

/**
 * Walks a stored state forward to SCHEMA_VERSION.
 * @param {object|null|undefined} raw state as read from chatMetadata
 * @returns {object} migrated state
 */
export function migrate(raw) {
    if (!raw || typeof raw !== 'object') {
        return createState();
    }

    // clone so callers never mutate the object they just read out of storage
    const state = structuredClone(raw);
    if (!Number.isInteger(state.version)) {
        state.version = 0;
    }

    while (state.version < SCHEMA_VERSION) {
        const step = MIGRATIONS.get(state.version);
        if (!step) {
            break;
        }
        step(state);
        state.version += 1;
    }

    if (state.version === SCHEMA_VERSION) {
        state.appetite = normalizeAppetite(state.appetite);
        state.impulse = normalizeImpulse(state.impulse);
    }

    return state;
}

export const loadState = migrate;

export function splitPath(path) {
    return String(path).split('.').filter(Boolean);
}

/**
 * One path segment. On an array, a non-numeric segment is an id lookup, so
 * `powers.the-spark.limits.0` reads naturally.
 */
function step(node, key) {
    if (node === null || node === undefined) {
        return undefined;
    }
    if (Array.isArray(node)) {
        const index = Number(key);
        return Number.isInteger(index) ? node[index] : node.find((item) => item?.id === key);
    }
    return node[key];
}

export function getPath(root, path) {
    return splitPath(path).reduce((node, key) => step(node, key), root);
}

/**
 * The lists whose entries a path can bring into being (§6 Paths), keyed by the
 * list's own path. `byId` lists take a slug the writer chooses; the rest append at
 * the next index. `at` is the newest message the proposal cites and `citation` is
 * that message's locator, so a thread, pressure or line is stamped with where it
 * was born rather than with a guess.
 */
const CREATABLE = {
    powers: {
        byId: true,
        make: (id) => ({ id, name: '', capability: '', limits: [], costs: [], stage: '', history: [] }),
    },
    'arc.threads': {
        byId: true,
        make: (id, { at }) => ({ id, text: '', bornAt: at, lastTouched: at }),
    },
    'arc.pressures': {
        byId: false,
        make: (_id, { at }) => ({ text: '', since: at, denialCount: 0 }),
    },
    'arc.linesCrossed': {
        byId: false,
        make: (_id, { citation }) => ({ line: '', provides: '', cost: '', msgId: citation }),
    },
};

/** A new entry for `key` in the list at `listPath`, or null when the path may not make one. */
function createEntry(list, listPath, key, context) {
    const kind = CREATABLE[listPath];
    if (!kind || !Array.isArray(list)) {
        return null;
    }
    // An id is a slug she or the scan chose; an index may only be the next one, so
    // a list never grows a hole.
    const allowed = kind.byId ? Number.isNaN(Number(key)) : Number(key) === list.length;
    if (!allowed) {
        return null;
    }
    const entry = kind.make(key, context);
    list.push(entry);
    return entry;
}

/**
 * Writes `value` at `path`, creating the one entry a proposal is allowed to create
 * on the way (§6 Paths). Any other missing segment is a dead path and throws.
 *
 * @param {object} root the state
 * @param {string} path dot path from the root
 * @param {*} value what to write
 * @param {{at?: number, citation?: object|null}} [context] where a created thread,
 *     pressure or line was born
 */
export function setPath(root, path, value, { at = 0, citation = null } = {}) {
    const keys = splitPath(path);
    if (keys[0] === 'appetite' || keys[0] === 'impulse') {
        const fields = keys[0] === 'appetite' ? APPETITE_FIELDS : ['text', 'context', 'status'];
        const validStatus = keys[1] !== 'status' || IMPULSE_STATUSES.includes(value);
        if (keys.length !== 2 || String(path) !== keys.join('.') || !fields.includes(keys[1])
            || typeof value !== 'string' || !validStatus) {
            throw new Error(`Sidekick: invalid appetite or impulse field "${path}"`);
        }
        if (keys[0] === 'impulse' && keys[1] === 'status' && value !== 'inactive'
            && !normalizeImpulse(root.impulse).text.trim()) {
            throw new Error('Sidekick: an impulse needs direction before its status can change');
        }
        const normalize = keys[0] === 'appetite' ? normalizeAppetite : normalizeImpulse;
        root[keys[0]] = normalize(root[keys[0]]);
        root[keys[0]][keys[1]] = value;
        if (keys[0] === 'impulse') {
            root.impulse = normalizeImpulse(root.impulse);
        }
        return value;
    }
    let node = root;

    for (let i = 0; i < keys.length - 1; i += 1) {
        const next = step(node, keys[i]) ?? createEntry(node, keys.slice(0, i).join('.'), keys[i], { at, citation });
        if (next === null || next === undefined) {
            throw new Error(`Sidekick: dead path segment "${keys.slice(0, i + 1).join('.')}" in "${path}"`);
        }
        node = next;
    }

    const last = keys.at(-1);
    if (Array.isArray(node) && Number.isInteger(Number(last))) {
        // Past the end is the end: a list never grows a hole.
        node[Math.min(Number(last), node.length)] = value;
    } else {
        node[last] = value;
    }

    return value;
}

/** The power a path touches, if any, so its own history can be kept in step. */
function powerAt(state, path) {
    const keys = splitPath(path);
    return keys[0] === 'powers' ? state.powers.find((power) => power.id === keys[1]) : undefined;
}

/**
 * Applies a proposal's changes and records provenance for each.
 *
 * Provenance gating: a change whose `from` no longer matches what is stored is
 * a stale proposal. It is skipped rather than clobbering whatever now lives
 * there—the DM has moved on and so has the ledger.
 *
 * @returns {object[]} the ChangeEvents that were actually applied
 */
export function applyProposal(state, proposal, meta = {}) {
    const applied = [];
    const at = meta.at ?? Date.now();

    // The newest message the proposal cites is where anything it creates was born.
    // A citation is {index, send_date}; a bare index from an older caller still counts.
    const indexOf = (citation) => (Number.isInteger(citation) ? citation : citation?.index);
    const newest = (proposal.evidence ?? [])
        .filter((citation) => Number.isInteger(indexOf(citation)))
        .reduce((best, citation) => (best === null || indexOf(citation) > indexOf(best) ? citation : best), null);
    const born = {
        at: newest === null ? 0 : indexOf(newest),
        citation: newest === null || Number.isInteger(newest) ? null : newest,
    };

    for (const change of proposal.changes ?? []) {
        const current = getPath(state, change.path);
        const expect = change.from === undefined ? undefined : change.from;
        // An empty `from` matches a field that does not exist yet: a creation is
        // not a stale proposal (§6 Paths).
        const matches = expect === undefined || expect === current || (expect === '' && current === undefined);
        if (!matches) {
            continue;
        }

        setPath(state, change.path, change.to, born);

        const event = {
            summary: proposal.summary,
            origin: proposal.origin ?? meta.origin ?? 'manual',
            evidence: proposal.evidence ?? [],
            at,
            // an insert into an empty list records '' rather than undefined, so
            // every event carries a string and a gated change never reads as free
            changes: [{ path: change.path, from: current ?? '', to: change.to }],
        };

        state.history.push(event);
        powerAt(state, change.path)?.history.push(event);
        applied.push(event);
    }

    return applied;
}

/**
 * What may be removed by hand, and how to find it: a whole entry by its id or its
 * index, or one item of a list. Anything else is not removable, so a stray path
 * cannot take a field out from under the ledger.
 */
const REMOVABLE = [
    { entry: ['powers'], byId: true },
    { entry: ['arc', 'threads'], byId: true },
    { entry: ['arc', 'pressures'], byId: false },
    { entry: ['arc', 'linesCrossed'], byId: false },
];
const REMOVABLE_LISTS = [
    ['limits'], ['costs'], // under a power
    ['cosmology', 'sources'], ['cosmology', 'stageVocabulary'], ['cosmology', 'costVocabulary'],
];

/**
 * Marks the queued proposals that a removal has left without a subject. A change
 * under a removed entry would recreate it, nameless, because an empty `from` matches
 * a field that does not exist (§6 Paths); and a change at a position at or past a
 * removed list item now names a different item than the one it was written about.
 * Either way the proposal no longer means what it said, so it is orphaned: old, in
 * §7's words, and nothing she can apply.
 *
 * @param {object} state
 * @param {{prefix: string}|{list: string, from: number}} target an entry by its path,
 *   or the list a position was removed from and the index it was removed at
 */
function orphanQueue(state, target) {
    const touches = (path) => {
        const at = String(path);
        if ('prefix' in target) {
            return at === target.prefix || at.startsWith(`${target.prefix}.`);
        }
        if (!at.startsWith(`${target.list}.`)) {
            return false;
        }
        const index = Number(at.slice(target.list.length + 1).split('.')[0]);
        return Number.isInteger(index) && index >= target.from;
    };
    for (const entry of Array.isArray(state.queue) ? state.queue : []) {
        if ((entry?.changes ?? []).some((change) => touches(change.path))) {
            entry.orphaned = true;
        }
    }
}

/** The words that name an entry once it is gone, for the history event. */
function nameOfEntry(entry) {
    return String(entry?.name || entry?.text || entry?.line || entry?.id || '');
}

/**
 * Removes one thing she chose to remove: a power, thread, pressure or crossed line,
 * or one limit, cost or cosmology word. A removal is a history event and never a
 * ruling. Items after it shift up by one, which is why the caller closes any open
 * hand ruling: a path counts positions in the stored list (§6 Paths).
 *
 * @param {object} state
 * @param {string} path the entry or the list item
 * @param {{at?: number, summary?: string}} [meta] the history event's summary, which
 *   names what was removed when the caller gives none
 * @returns {{from: string}|null} what was removed, or null when the path is not
 *   something that can be removed or is not there
 */
export function removeAt(state, path, { at = Date.now(), summary } = {}) {
    const keys = splitPath(path);
    const finish = (from, list, index) => {
        list.splice(index, 1);
        state.history.push({
            summary: summary ?? `Removed ${from || path}`,
            origin: 'manual',
            evidence: [],
            at,
            changes: [{ path, from, to: '' }],
        });
        return { from };
    };
    const indexIn = (list, key, byId) => {
        if (!Array.isArray(list)) {
            return -1;
        }
        if (byId) {
            return Number.isNaN(Number(key)) ? list.findIndex((item) => item?.id === key) : -1;
        }
        return Number.isInteger(Number(key)) && Number(key) >= 0 && Number(key) < list.length ? Number(key) : -1;
    };

    // a whole entry
    for (const { entry, byId } of REMOVABLE) {
        if (keys.length === entry.length + 1 && entry.every((key, i) => keys[i] === key)) {
            const list = getPath(state, entry.join('.'));
            const index = indexIn(list, keys.at(-1), byId);
            if (index < 0) {
                return null;
            }
            const removed = finish(nameOfEntry(list[index]), list, index);
            orphanQueue(state, byId ? { prefix: path } : { list: entry.join('.'), from: index });
            return removed;
        }
    }

    // one item of a list: what sits between the owner (the power's id, or nothing) and
    // the index has to be one of the lists named above
    const listKeys = keys[0] === 'powers' ? keys.slice(2, -1) : keys.slice(0, -1);
    if (keys.length >= 3 && REMOVABLE_LISTS.some((tail) => tail.length === listKeys.length
        && tail.every((key, i) => key === listKeys[i]))) {
        const list = getPath(state, keys.slice(0, -1).join('.'));
        const index = indexIn(list, keys.at(-1), false);
        if (index >= 0) {
            const from = String(list[index]);
            const result = finish(from, list, index);
            powerAt(state, path)?.history.push(state.history.at(-1));
            orphanQueue(state, { list: keys.slice(0, -1).join('.'), from: index });
            return result;
        }
    }
    return null;
}

/**
 * Records a DM ruling and prunes the window.
 * `summary` is denormalized on purpose: the proposal it judged may be long gone
 * from the queue, and the lesson has to outlive the paperwork (§3).
 */
export function recordRuling(state, ruling) {
    const entry = {
        proposalId: ruling.proposalId,
        summary: ruling.summary,
        action: ruling.action,
        at: ruling.at ?? Date.now(),
    };
    if (ruling.edit !== undefined) {
        entry.edit = ruling.edit;
    }
    // a `written` ruling is about one field, and names it
    if (ruling.path !== undefined) {
        entry.path = ruling.path;
    }

    state.rulings.push(entry);
    return pruneRulings(state);
}

/** @returns {object[]} the rulings that fell out of the window, oldest first */
export function pruneRulings(state) {
    const overflow = state.rulings.length - RULING_WINDOW;
    return overflow > 0 ? state.rulings.splice(0, overflow) : [];
}
