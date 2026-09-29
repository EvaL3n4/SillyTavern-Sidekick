/**
 * Canonical shapes, defined exactly once.
 *
 * These files each used to carry their own Spark, ledger and proposal, and they
 * had already drifted apart by the time this module was written: `capability`
 * read 'the force' in state.test.js and 'a blue-black force that wraps what she
 * protects' in the other two; `limits` held one entry in one file and two in
 * another; grammar.test.js carried a third limit that no test asserted. Three
 * definitions of one thing is three chances to be wrong, and only one of them
 * was ever checked.
 *
 * toPendingChange is the fourth consumer of these shapes. A proposal that
 * quietly stops satisfying PROPOSAL_SCHEMA should now fail every describe that
 * uses it, rather than none of them.
 *
 * Every factory returns a fresh deep copy and takes plain overrides, so no test
 * can poison another by mutating what it was handed. test/invariants.test.js
 * asserts these fixtures still satisfy each module's own acceptance, which is
 * what keeps them honest rather than merely shared.
 */

import { createState } from '../src/state.js';

/** §5's worked ledger, reduced to shape: one power, one thread, one hidden
 *  pressure, one line crossed, and an arc phase about to move. */
const THE_SPARK = {
    id: 'the-spark',
    name: 'the Spark',
    capability: 'a blue-black force that wraps what she protects',
    limits: ['no control', 'unfocused it takes everything from the waist down'],
    costs: ['cracked asphalt', 'witnesses'],
    stage: 'new',
    history: [],
};

/** A proposal that satisfies everything validateProposals and applyProposal
 *  check. `origin` is not in PROPOSAL_SCHEMA--schema-legal extras are why the
 *  schema omits `additionalProperties`--so this fixture covers both gates. */
const THE_PROPOSAL = {
    origin: 'evaluation',
    summary: 'the spark has a second limit',
    evidence: [12, 14],
    changes: [
        { path: 'powers.the-spark.limits.0', from: 'no control', to: 'unfocused it takes everything from the waist down' },
    ],
};

/**
 * @param {object} [overrides] merged over the canonical power, shallow
 * @returns {object} a fresh Spark
 */
export function theSpark(overrides = {}) {
    return { ...structuredClone(THE_SPARK), ...overrides };
}

/**
 * @param {object} [overrides] merged the way createState merges, so a partial
 *     `hero` keeps its siblings while a `powers` array replaces wholesale
 * @returns {object} a fresh, fully-defaulted reference state
 */
export function ledger(overrides = {}) {
    return createState({
        cosmology: {
            sources: ['manifestation'],
            stageVocabulary: ['new', 'settling'],
            costVocabulary: ['strain', 'exposure'],
            taboos: 'no one outside the program may know',
        },
        hero: { name: 'Hailey Kogami Green', codename: '', statusQuo: 'assumed unmanifested' },
        powers: [theSpark()],
        arc: {
            phase: 'the first week of having something',
            threads: [{ id: 't1', text: 'what fired the projectile', bornAt: 1, lastTouched: 9 }],
            // one of each: the hidden pressure drives the concealment line, the
            // open one the "What is due" line, so both render paths are reachable
            pressures: [
                { text: 'her family must not learn', since: 1, denialCount: 3, hidden: true },
                { text: 'the council wants answers', since: 2, denialCount: 0 },
            ],
            linesCrossed: [{ line: 'public breakage', provides: 'a stranger saw', cost: 'a witness', msgId: 3 }],
        },
        ...overrides,
    });
}

/**
 * @param {object} [overrides] merged over the canonical proposal, shallow
 * @returns {object} a fresh proposal
 */
export function proposal(overrides = {}) {
    return { ...structuredClone(THE_PROPOSAL), ...overrides };
}

/**
 * @param {object[]} proposals the pass's proposals
 * @returns {object} the response shape a scan returns
 */
export function scanPass(proposals) {
    return { proposals };
}

/**
 * @param {number} n which ruling this is, reused as its id, summary and time
 * @param {object} [overrides] merged over the generated ruling
 * @returns {object} a fresh ruling
 */
export function ruling(n, overrides = {}) {
    return {
        proposalId: `p${n}`,
        summary: `proposal ${n}`,
        action: 'applied',
        at: n,
        ...overrides,
    };
}

/**
 * @param {string} name who spoke
 * @param {string} [text] what they said
 * @param {boolean} [isUser] whether it is the player's turn
 * @returns {object} a plain chat message in the shape SillyTavern holds
 */
export function mes(name, text = 'a line', isUser = true) {
    return { is_user: isUser, name, mes: text };
}

/**
 * @param {number} count how many messages
 * @returns {object[]} a chat of `count` player lines, numbered so tests can
 *     recognise which one they are looking at
 */
export function chatOf(count) {
    return Array.from({ length: count }, (_, i) => mes('Hailey', `line ${i}`));
}
