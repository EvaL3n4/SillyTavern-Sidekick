/**
 * The §4 grammar: state → lean prose, where the anti-flatness dose is delivered.
 *
 * Pure and DOM-free so `node --test` asserts the dosage rules directly. The
 * sentence shaping here is the product; it gets tuned against the §5 acceptance
 * beat until the render comes back springboard.
 */
import { normalizeAppetite, normalizeImpulse } from './state.js';

/** §5: the digest runs roughly 200 tokens, budget-enforced. */
export const DEFAULT_DIGEST_BUDGET = 200;

/** Crude but monotonic: 1 token ≈ 4 characters. Good enough for a budget. */
const CHARS_PER_TOKEN = 4;

/** The digest may never eat more than this share of the context (§5). */
const CONTEXT_SHARE = 0.05;

export function estimateTokens(text) {
    return Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

/**
 * Budget actually available: the configured budget, capped by context size.
 * @param {object} [options]
 * @param {object} [options.settings] LocalSettings (§6)
 * @param {number} [options.budget] explicit override
 * @param {number} [options.contextSize] tokens the interceptor reports
 * @returns {number}
 */
export function effectiveBudget({ settings, budget, contextSize } = {}) {
    const configured = budget ?? settings?.digestBudgetTokens ?? DEFAULT_DIGEST_BUDGET;
    if (!Number.isFinite(contextSize) || contextSize <= 0) {
        return configured;
    }
    return Math.max(1, Math.min(configured, Math.floor(contextSize * CONTEXT_SHARE)));
}

/** Comma-joined list with a trailing "and". */
function list(items) {
    const values = items.filter(Boolean);
    if (values.length === 0) {
        return '';
    }
    if (values.length === 1) {
        return values[0];
    }
    return `${values.slice(0, -1).join(', ')} and ${values.at(-1)}`;
}

function lowerFirst(text) {
    return text ? `${text.charAt(0).toLowerCase()}${text.slice(1)}` : '';
}

/**
 * Sections in render order. Degradation walks this same order, which is why the
 * arc sits last: limits and costs compress first, the arc second and last, and
 * it is never dropped (§5).
 */
function sections(state) {
    const hero = state.hero?.name || 'She';
    const powers = state.powers ?? [];
    const arc = state.arc ?? {};

    return [
        {
            name: 'capability',
            levels: 1,
            render: (level) => {
                const power = powers[0];
                if (!power) {
                    return null;
                }
                const limits = level === 0 ? power.limits : power.limits?.slice(0, 1);
                const costs = level === 0 ? power.costs : power.costs?.slice(0, 1);
                const sentences = [`${hero} can one thing: ${power.capability}.`];
                // gate on what renders, not on the array: a limit whose text has been
                // cleared to '' must drop its sentence rather than leave "it: ."
                const limitsList = limits?.length ? list(limits) : '';
                const costsList = costs?.length ? list(costs) : '';
                if (limitsList) {
                    sentences.push(`She feels what it will not do while she is doing it: ${limitsList}.`);
                }
                if (costsList) {
                    sentences.push(`And it leaves a bill: ${costsList}.`);
                }
                return sentences.join(' ');
            },
        },
        {
            name: 'concealment',
            levels: 1,
            render: (level) => {
                const pressures = arc.pressures ?? [];
                if (!pressures.length) {
                    return null;
                }
                const kept = level === 0 ? pressures : [pressures.at(-1)];
                const hidden = kept.filter((pressure) => pressure.want === false || pressure.hidden);
                const open = kept.filter((pressure) => !(pressure.want === false || pressure.hidden));
                const sentences = [];
                if (hidden.length) {
                    // shame as concealment: the hiding is the action, and it costs
                    sentences.push(`She keeps ${list(hidden.map((p) => p.text))} out of the open, and the keeping costs her.`);
                }
                if (open.length) {
                    sentences.push(`What is due: ${list(open.map((p) => p.text))}.`);
                }
                return sentences.length ? sentences.join(' ') : null;
            },
        },
        {
            name: 'threads',
            levels: 1,
            render: (level) => {
                const threads = arc.threads ?? [];
                if (!threads.length) {
                    return null;
                }
                const kept = level === 0 ? threads : threads.slice(-1);
                return `Live with still: ${list(kept.map((thread) => thread.text))}.`;
            },
        },
        {
            name: 'residue',
            levels: 1,
            render: (level) => {
                const crossed = arc.linesCrossed ?? [];
                if (!crossed.length) {
                    return null;
                }
                const kept = level === 0 ? crossed : crossed.slice(-1);
                return `Already over: ${list(kept.map((entry) => `${entry.line}, which gave her ${lowerFirst(entry.provides)} and cost her ${entry.cost}`))}.`;
            },
        },
        {
            name: 'arc',
            levels: 1,
            render: (level) => {
                if (!arc.phase) {
                    return null;
                }
                // never rendered as a fact the hero acknowledges (§4 rule 1)
                return level === 0
                    ? `${hero} is in ${arc.phase}, and she would not say so.`
                    : `${arc.phase}.`;
            },
        },
    ].filter((section) => section.render(0) !== null || section.name === 'arc');
}

/**
 * Renders the digest and reports how it got there.
 * @param {object} state SidekickState (§6)
 * @param {object} [options]
 * @param {number} [options.budget]
 * @param {number} [options.contextSize]
 * @returns {{text: string, tokens: number, budget: number, degraded: string[]}}
 */
export function renderDigest(state, options = {}) {
    const budget = effectiveBudget({
        settings: state?.settings,
        budget: options.budget,
        contextSize: options.contextSize,
    });

    const appetite = normalizeAppetite(state?.appetite);
    if (appetite.want.trim()) {
        return renderAppetiteDigest(state, appetite, budget);
    }

    const built = sections(state);
    const levels = built.map(() => 0);
    const degraded = [];

    const text = () => built
        .map((section, index) => (levels[index] <= section.levels ? section.render(levels[index]) : null))
        .filter(Boolean)
        .join(' ');

    // staircase down: never past the floor, and never into the arc unless
    // everything above it has already compressed
    for (let guard = built.length * 4; guard > 0 && estimateTokens(text()) > budget; guard -= 1) {
        const next = built.findIndex((section, index) => levels[index] < section.levels);
        if (next === -1) {
            break;
        }
        levels[next] += 1;
        degraded.push(built[next].name);
    }

    const rendered = text();
    return { text: rendered, tokens: estimateTokens(rendered), budget, degraded };
}

/** Keep the immediate direction intact while secondary context gives way. */
function renderAppetiteDigest(state, appetite, budget) {
    const impulse = normalizeImpulse(state.impulse);
    const active = impulse.status === 'active';
    const core = [
        `What nourishes ${state.hero?.name || 'the tracked character'}: ${appetite.want}`,
        active ? `Current impulse: ${impulse.text}` : '',
        active && impulse.context ? `Why now: ${impulse.context}` : '',
        active
            ? 'Let this impulse drive their next actions. Newer scene facts take precedence: adapt pursuit, abandon obsolete actions, preserve the appetite. Leave outcomes and the DM’s character open.'
            : '',
    ].filter(Boolean).join('\n');
    const details = [
        appetite.firstTaste ? `First taste: ${appetite.firstTaste}` : '',
        appetite.condition ? `Appetite now: ${appetite.condition}` : '',
        appetite.expression ? `How it shows: ${appetite.expression}` : '',
        appetite.residue ? `What remains: ${appetite.residue}` : '',
    ].filter(Boolean).join('\n');
    const built = [
        { name: 'appetite details', levels: 1, render: (level) => level === 0 ? details : null },
        ...sections(state).map((section) => ({
            ...section,
            levels: section.name === 'arc' ? section.levels : section.levels + 1,
            render: (level) => level > section.levels ? null : section.render(level),
        })),
    ];
    const levels = built.map(() => 0);
    const degraded = [];
    const text = () => [
        ...built.map((section, index) => section.render(levels[index])),
        core,
    ].filter(Boolean).join('\n');

    while (estimateTokens(text()) > budget) {
        const next = built.findIndex((section, index) => levels[index] < section.levels);
        if (next === -1) {
            // An intact appetite, direction and arc are the minimum useful dose.
            return { text: '', tokens: 0, budget, degraded: [...degraded, 'budget'] };
        }
        levels[next] += 1;
        degraded.push(built[next].name);
    }
    const rendered = text();
    return { text: rendered, tokens: estimateTokens(rendered), budget, degraded };
}

/**
 * §5: quiet generations and sessions with no state never get a digest.
 * @param {object} [options]
 * @param {string} [options.type] generation type the interceptor reports
 * @param {object} [options.state]
 * @returns {boolean}
 */
export function shouldSkip({ type, state } = {}) {
    if (['quiet', 'raw', 'dryRun'].includes(String(type))) {
        return true;
    }
    if (type === 'impersonate' && normalizeAppetite(state?.appetite).want.trim()) {
        return true;
    }
    return !hasState(state);
}

export function hasState(state) {
    return Boolean(state && (
        state.hero?.name
        || normalizeAppetite(state.appetite).want.trim()
        || state.powers?.length
        || state.arc?.phase
        || state.arc?.threads?.length
        || state.arc?.pressures?.length
        || state.arc?.linesCrossed?.length
    ));
}
