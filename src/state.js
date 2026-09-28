/**
 * State load/migrate/save, provenance-gated mutations, ruling log.
 * Schema: DESIGN.md §6.
 *
 * Pure by construction—no SillyTavern imports—so this runs under `node --test`.
 * index.js binds the read/write ends to chatMetadata.
 */

/** Schema version. Bump only with a matching entry in MIGRATIONS. */
export const SCHEMA_VERSION = 1;

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
        powers: [],
        arc: { phase: '', threads: [], pressures: [], linesCrossed: [] },
        queue: [],
        history: [],
        rulings: [],
        // matches DEFAULT_CADENCE in src/evaluate.js
        settings: { evaluationCadence: 15, digestBudgetTokens: 200 },
    };

    if (isPlainObject(overrides)) {
        mergeInto(state, overrides);
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

export function setPath(root, path, value) {
    const keys = splitPath(path);
    let node = root;

    for (let i = 0; i < keys.length - 1; i += 1) {
        node = step(node, keys[i]);
        if (node === null || node === undefined) {
            throw new Error(`Sidekick: dead path segment "${keys.slice(0, i + 1).join('.')}" in "${path}"`);
        }
    }

    const last = keys.at(-1);
    if (Array.isArray(node) && Number.isInteger(Number(last))) {
        node[Number(last)] = value;
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

    for (const change of proposal.changes ?? []) {
        const current = getPath(state, change.path);
        const expect = change.from === undefined ? undefined : change.from;
        if (expect !== undefined && expect !== current) {
            continue;
        }

        setPath(state, change.path, change.to);

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

    state.rulings.push(entry);
    return pruneRulings(state);
}

/** @returns {object[]} the rulings that fell out of the window, oldest first */
export function pruneRulings(state) {
    const overflow = state.rulings.length - RULING_WINDOW;
    return overflow > 0 ? state.rulings.splice(0, overflow) : [];
}
