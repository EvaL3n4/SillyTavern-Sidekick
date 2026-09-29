/**
 * The Sheet's shape, as data (§7, The Sheet's shape and Empty fields collapse).
 *
 * Which cards there are, which fields each holds, and which of those are empty is a
 * decision about the ledger and not about pixels, so it is made here, pure and
 * tested, and src/ui.js only draws it. Every field carries the path §6 addresses it
 * by, and every empty one is still a row: a collapsed field is a real slot, which is
 * what lets her write into it later.
 *
 * The Sheet offers exactly the slots the path grammar allows, so no row here names a
 * path that state.js would call dead.
 */

/**
 * @typedef {object} Row
 * @property {'title'|'meta'|'text'|'note'} style how the row reads: a bold head, a
 *   quiet aside, plain text, or a read-only remark
 * @property {string} [path] the field's path; absent on a read-only note
 * @property {string} value what the ledger holds, '' when nothing is written
 * @property {string} noun what an empty field says it would add: "stage" -> "+ stage"
 * @property {string} [label] a caption for a field whose value is not self-evident
 *
 * @typedef {object} ListRow
 * @property {'list'} style
 * @property {string} label the micro-label over the items
 * @property {string} noun what the add line says: "limit" -> "+ limit"
 * @property {{path: string, value: string}[]} items
 * @property {string} addPath where the next item is written
 *
 * @typedef {object} Card
 * @property {string} id
 * @property {string} [caption] what kind of card, for those whose text does not say
 * @property {(Row|ListRow)[]} rows
 * @property {string} [remove] the entry's path, on a card she may remove whole
 * @property {{citation: object}} [cite] the message a crossed line was born at
 *
 * @typedef {object} Group
 * @property {string} id
 * @property {string} title
 * @property {Card[]} cards
 * @property {{noun: string, path: string}[]} [adds] the entries she may add
 */

const text = (value) => (typeof value === 'string' ? value : '');

const field = (style, path, value, noun, label) => {
    const row = { style, path, value: text(value).trim(), noun };
    return label ? { ...row, label } : row;
};

const listOf = (path, values, label, noun) => {
    const items = (Array.isArray(values) ? values : [])
        .map((value, index) => ({ path: `${path}.${index}`, value: text(value).trim() }))
        .filter((item) => item.value);
    // A hole in the list is not a slot: the next item is written at the next index
    // (§6 Paths), which is the count of what is really there.
    return { style: 'list', label, noun, items, addPath: `${path}.${(Array.isArray(values) ? values : []).length}` };
};

/**
 * The entries of a list that are really there, each with the index it holds in the
 * ledger. The index is taken before the gaps are dropped: a path counts positions in
 * the stored list, so a null at 0 must not renumber what follows it.
 */
const present = (list) => (Array.isArray(list) ? list : [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item !== null && typeof item === 'object');

const day = (at) => {
    const date = new Date(at);
    return Number.isFinite(date.getTime()) && at ? date.toLocaleDateString() : '';
};

function heroGroup(hero) {
    return {
        id: 'hero',
        title: 'The hero',
        cards: [{
            id: 'hero',
            rows: [
                field('title', 'hero.name', hero?.name, 'name'),
                field('meta', 'hero.codename', hero?.codename, 'codename'),
                field('text', 'hero.statusQuo', hero?.statusQuo, 'status quo'),
            ],
        }],
    };
}

function powerCard(power, index) {
    const id = text(power?.id) || String(index);
    const base = `powers.${id}`;
    return {
        id: `power:${id}`,
        remove: base,
        rows: [
            field('title', `${base}.name`, power?.name, 'name'),
            field('meta', `${base}.stage`, power?.stage, 'stage'),
            field('text', `${base}.capability`, power?.capability, 'capability'),
            listOf(`${base}.limits`, power?.limits, 'Limits', 'limit'),
            listOf(`${base}.costs`, power?.costs, 'Costs', 'cost'),
        ],
    };
}

function powersGroup(powers) {
    return {
        id: 'powers',
        title: 'What she can do',
        cards: present(powers).map(({ item, index }) => powerCard(item, index)),
        adds: [{ noun: 'power', path: 'powers' }],
    };
}

function arcGroup(arc) {
    const threads = present(arc?.threads);
    const pressures = present(arc?.pressures);
    const crossings = present(arc?.linesCrossed);

    const cards = [{
        id: 'phase',
        caption: 'Phase',
        rows: [field('text', 'arc.phase', arc?.phase, 'phase')],
    }];

    threads.forEach(({ item: thread, index }) => {
        const id = text(thread.id) || String(index);
        const touched = day(thread.lastTouched);
        cards.push({
            id: `thread:${id}`,
            remove: `arc.threads.${id}`,
            caption: 'Thread',
            rows: [
                field('text', `arc.threads.${id}.text`, thread.text, 'thread'),
                ...(touched ? [{ style: 'note', value: touched }] : []),
            ],
        });
    });

    pressures.forEach(({ item: pressure, index }) => {
        const denied = Number(pressure.denialCount) > 0
            ? `denied ${pressure.denialCount} ${pressure.denialCount === 1 ? 'time' : 'times'}`
            : '';
        cards.push({
            id: `pressure:${index}`,
            remove: `arc.pressures.${index}`,
            caption: 'Pressure',
            rows: [
                field('text', `arc.pressures.${index}.text`, pressure.text, 'pressure'),
                ...(denied ? [{ style: 'note', value: denied }] : []),
            ],
        });
    });

    crossings.forEach(({ item: crossing, index }) => {
        const base = `arc.linesCrossed.${index}`;
        cards.push({
            id: `line:${index}`,
            remove: `arc.linesCrossed.${index}`,
            caption: 'Line crossed',
            rows: [
                field('text', `${base}.line`, crossing.line, 'line', 'Line'),
                field('text', `${base}.provides`, crossing.provides, 'what it gave her', 'Provides'),
                field('text', `${base}.cost`, crossing.cost, 'cost', 'Cost'),
            ],
            ...(crossing.msgId ? { cite: { citation: crossing.msgId } } : {}),
        });
    });

    return {
        id: 'arc',
        title: 'Where the hero is',
        cards,
        adds: [
            { noun: 'thread', path: 'arc.threads' },
            { noun: 'pressure', path: 'arc.pressures' },
            { noun: 'line crossed', path: 'arc.linesCrossed' },
        ],
    };
}

function cosmologyGroup(cosmology) {
    return {
        id: 'cosmology',
        title: 'The setting',
        cards: [{
            id: 'cosmology',
            rows: [
                listOf('cosmology.sources', cosmology?.sources, 'Where powers come from', 'source'),
                listOf('cosmology.stageVocabulary', cosmology?.stageVocabulary, 'Stages', 'stage word'),
                listOf('cosmology.costVocabulary', cosmology?.costVocabulary, 'Costs', 'cost word'),
                field('text', 'cosmology.taboos', cosmology?.taboos, 'taboos', 'Taboos'),
            ],
        }],
    };
}

/**
 * The whole Sheet for one ledger.
 *
 * @param {object|null} state a SidekickState (§6)
 * @returns {Group[]|null} null when there is no ledger to draw at all; a ledger
 *   with nothing in it is still four groups of collapsed slots
 */
export function sheetGroups(state) {
    if (state === null || typeof state !== 'object') {
        return null;
    }
    return [
        heroGroup(state.hero),
        powersGroup(state.powers),
        arcGroup(state.arc),
        cosmologyGroup(state.cosmology),
    ];
}

/**
 * Whether a row, or a list, has nothing written in it.
 *
 * @param {Row|ListRow} row
 * @returns {boolean}
 */
export function isEmptyRow(row) {
    return row.style === 'list' ? row.items.length === 0 : row.value === '';
}
