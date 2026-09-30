/**
 * A change's path, as the words the DM would use for it (§7, The Queue's words).
 *
 * A path addresses the ledger for the gate and the scan; she reads the field. So
 * `powers.the-spark.limits.0` is "The Spark · Limit 1", by the power's name and never
 * its slug, and a field the change is about to create says so: "New power: Light
 * Throw · Capability". A path that is none of the ledger's own comes back as itself,
 * because a label that hid it would be worse than the path.
 *
 * Pure: it reads the state and the sibling changes and touches neither.
 */
import { splitPath } from './state.js';

const HERO = { name: 'Name', codename: 'Codename', statusQuo: 'Status quo' };
const APPETITE = { want: 'Want', firstTaste: 'First taste', condition: 'Condition', expression: 'Expression', residue: 'Residue' };
const IMPULSE = { text: 'Direction', context: 'Why now', status: 'State' };
const POWER = { name: 'Name', capability: 'Capability', stage: 'Stage' };
const POWER_LIST = { limits: 'Limit', costs: 'Cost' };
const COSMOLOGY_LIST = { sources: 'Source', stageVocabulary: 'Stage word', costVocabulary: 'Cost word' };
const LINE = { line: 'Line', provides: 'Provides', cost: 'Cost' };

/** A table's own entry: a path segment like "constructor" is not one of the ledger's. */
const own = (table, key) => (Object.hasOwn(table, String(key)) ? table[key] : undefined);

/** How much of a thread's own text names it. */
const NAME_LENGTH = 32;

/** "light-speed-shear" as "Light Speed Shear". */
function titled(slug) {
    return slug
        .split('-')
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');
}

/** The start of `text`, cut at a word so a name never ends mid-word. */
function shortened(text) {
    if (text.length <= NAME_LENGTH) {
        return text;
    }
    const cut = text.slice(0, NAME_LENGTH + 1);
    const space = cut.lastIndexOf(' ');
    return `${(space > 0 ? cut.slice(0, space) : cut.slice(0, NAME_LENGTH)).trimEnd()}…`;
}

/** A list position as she counts it: 1, 2, 3. Null when the segment is not one. */
function position(segment) {
    return /^\d+$/.test(segment) ? Number(segment) + 1 : null;
}

/**
 * The power's name for a label: what the ledger holds, else the name this same
 * proposal is giving it, else its slug made readable.
 */
function powerName(state, id, changes) {
    const held = (state?.powers ?? []).find((power) => power?.id === id)?.name;
    if (held) {
        return held;
    }
    const named = changes.find((change) => change?.path === `powers.${id}.name`)?.to;
    return named || titled(id);
}

function powerLabel(state, [id, ...rest], changes) {
    const [key, index] = rest;
    const plain = own(POWER, key);
    const listed = own(POWER_LIST, key);
    const field = plain ?? (listed && position(index) ? `${listed} ${position(index)}` : null);
    if (!id || !field || rest.length !== (plain ? 1 : 2)) {
        return null;
    }
    const exists = (state?.powers ?? []).some((power) => power?.id === id);
    const scope = `${powerName(state, id, changes)} · ${field}`;
    return exists ? scope : `New power: ${scope}`;
}

function threadLabel(state, [id, key]) {
    if (key !== 'text' || !id) {
        return null;
    }
    const held = (state?.arc?.threads ?? []).find((thread) => thread?.id === id);
    return held ? `Thread “${shortened(held.text ?? '')}”` : 'New thread';
}

function pressureLabel(state, [index, key]) {
    const n = position(index);
    if (key !== 'text' || !n) {
        return null;
    }
    return n <= (state?.arc?.pressures ?? []).length ? `Pressure ${n}` : 'New pressure';
}

function lineLabel(state, [index, key]) {
    const n = position(index);
    const field = own(LINE, key);
    if (!field || !n) {
        return null;
    }
    return n <= (state?.arc?.linesCrossed ?? []).length
        ? `Line crossed ${n} · ${field}`
        : `New line crossed · ${field}`;
}

function cosmologyLabel([key, index]) {
    if (key === 'taboos' && index === undefined) {
        return 'Cosmology · Taboos';
    }
    const word = own(COSMOLOGY_LIST, key);
    return word && position(index) ? `Cosmology · ${word} ${position(index)}` : null;
}

/**
 * @param {object|null} state a SidekickState (§6), as it stands now
 * @param {{path: string}} change the change to name
 * @param {{path: string, to?: string}[]} [changes] the change's siblings in the same
 *   proposal, which is where a new power's name is found
 * @returns {string} the label; the path itself when it is none of the ledger's own
 */
export function labelChange(state, change, changes = [change]) {
    const path = String(change?.path ?? '');
    const [root, ...rest] = splitPath(path);
    const siblings = Array.isArray(changes) ? changes : [change];

    let label = null;
    if (root === 'hero' && own(HERO, rest[0]) && rest.length === 1) {
        label = `Hero · ${own(HERO, rest[0])}`;
    } else if (root === 'appetite' && own(APPETITE, rest[0]) && rest.length === 1) {
        label = `Appetite · ${own(APPETITE, rest[0])}`;
    } else if (root === 'impulse' && own(IMPULSE, rest[0]) && rest.length === 1) {
        label = `Impulse · ${own(IMPULSE, rest[0])}`;
    } else if (root === 'powers') {
        label = powerLabel(state, rest, siblings);
    } else if (root === 'arc' && rest[0] === 'phase' && rest.length === 1) {
        label = 'Arc · Phase';
    } else if (root === 'arc' && rest[0] === 'threads') {
        label = threadLabel(state, rest.slice(1));
    } else if (root === 'arc' && rest[0] === 'pressures') {
        label = pressureLabel(state, rest.slice(1));
    } else if (root === 'arc' && rest[0] === 'linesCrossed') {
        label = lineLabel(state, rest.slice(1));
    } else if (root === 'cosmology') {
        label = cosmologyLabel(rest);
    }

    return label ?? path;
}
