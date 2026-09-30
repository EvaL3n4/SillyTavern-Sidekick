/** Background reading of approved appetite and a bounded played scene. */
import { sceneWindow, runGeneration } from './evaluate.js';
import { normalizeAppetite, normalizeImpulse, SCHEMA_VERSION } from './state.js';
import { IMPULSE_SYSTEM_PROMPT } from './impulse-prompt.js';

export const IMPULSE_SCHEMA = {
    name: 'scene_impulse',
    strict: true,
    value: {
        type: 'object',
        additionalProperties: false,
        required: ['decision', 'text', 'context', 'target', 'connection', 'evidence'],
        properties: {
            decision: { type: 'string', enum: ['retain', 'replace', 'satisfied', 'none'] },
            text: { type: 'string', description: 'A concrete direction for the tracked character in this scene.' },
            context: { type: 'string', description: 'The played circumstances that make this wish relevant now.' },
            target: { type: 'string', description: 'The person, place or present object of this wish.' },
            connection: { type: 'string', description: 'How the wish expresses the approved appetite without changing it.' },
            evidence: { type: 'array', items: { type: 'integer' } },
        },
    },
};

// Bound the whole scene by characters as well as by messages. Retain the newest
// material and its original indices, including when a single reply is enormous.
export const IMPULSE_SCENE_CHARS = 24_000;
export const IMPULSE_TIMEOUT_MS = 180_000;
const PROSE_LIMIT = 2_000;
const boundedProse = (record) => Object.fromEntries(Object.entries(record).map(([key, value]) =>
    [key, value.length > PROSE_LIMIT ? `${value.slice(0, PROSE_LIMIT)}…` : value]));

export function impulseScene(chat) {
    let room = IMPULSE_SCENE_CHARS;
    const kept = [];
    for (const { index, message } of sceneWindow(chat).reverse()) {
        const name = String(message?.name ?? 'unknown').slice(0, 120);
        const text = typeof message?.mes === 'string' ? message.mes : '';
        if (!text.trim()) {
            continue;
        }
        const prefix = `[${index}] ${name}: `;
        if (room <= prefix.length) {
            break;
        }
        const available = room - prefix.length;
        const fragment = text.length > available ? (available > 1 ? text.slice(-(available - 1)) : '') : text;
        const line = `${prefix}${text.length > available ? '…' : ''}${fragment}`;
        kept.unshift({ index, line });
        room -= line.length + 2;
    }
    return kept;
}

export function buildImpulsePrompt(state, chat, character) {
    const scene = impulseScene(chat);
    return {
        system: IMPULSE_SYSTEM_PROMPT,
        user: [
            'Tracked AI character: ' + JSON.stringify(String(character).slice(0, 120)),
            'Approved appetite: ' + JSON.stringify(boundedProse(normalizeAppetite(state?.appetite))),
            'Current impulse: ' + JSON.stringify(boundedProse(normalizeImpulse(state?.impulse))),
            'Played scene (message indices):',
            ...scene.map((entry) => entry.line),
        ].join('\n\n'),
        scene,
    };
}

/** Validate model-owned prose and citations before allowing any state mutation. */
export function readImpulseResult(raw, previous, scene) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('Sidekick: invalid impulse assessment');
    }
    const keys = ['decision', 'text', 'context', 'target', 'connection', 'evidence'];
    if (Object.keys(raw).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(raw, key))) {
        throw new Error('Sidekick: unexpected impulse assessment fields');
    }
    if (!Array.isArray(raw.evidence) || raw.evidence.some((index) => !Number.isInteger(index))) {
        throw new Error('Sidekick: invalid impulse evidence');
    }
    if (raw.decision === 'none' && raw.evidence.length === 0
        && ['text', 'context', 'target', 'connection'].every((key) => raw[key] === '')) {
        return null;
    }
    if (!['retain', 'replace', 'satisfied'].includes(raw.decision)
        || ['text', 'context', 'target', 'connection'].some((key) => typeof raw[key] !== 'string'
            || !raw[key].trim() || raw[key].length > PROSE_LIMIT)) {
        throw new Error('Sidekick: an impulse needs supported, concrete direction');
    }
    const shown = new Set(scene.map((entry) => entry.index));
    if (!raw.evidence.length || raw.evidence.some((index) => !shown.has(index))) {
        throw new Error('Sidekick: impulse evidence was not shown');
    }
    const impulse = normalizeImpulse(previous);
    if (raw.decision !== 'replace' && (impulse.status !== 'active' || raw.text !== impulse.text)) {
        throw new Error('Sidekick: retaining or satisfying needs the active direction unchanged');
    }
    return {
        text: raw.text.trim(),
        context: raw.context.trim(),
        status: raw.decision === 'satisfied' ? 'satisfied' : 'active',
    };
}

export async function assessImpulse(state, { chat, character, generate, timeoutMs = IMPULSE_TIMEOUT_MS,
    startTimer = setTimeout, stopTimer = clearTimeout }) {
    if (state?.version > SCHEMA_VERSION || typeof character !== 'string' || !character.trim()
        || !normalizeAppetite(state?.appetite).want.trim()
        || normalizeImpulse(state?.impulse).status === 'suspended') {
        return null;
    }
    const prompt = buildImpulsePrompt(state, chat, character);
    if (!prompt.scene.length) {
        return null;
    }
    let timer;
    try {
        const raw = await Promise.race([
            runGeneration(prompt, IMPULSE_SCHEMA, {
                generate: (args) => generate({ ...args, responseLength: 512 }),
            }),
            new Promise((_, reject) => {
                timer = startTimer(() => reject(new Error('Sidekick: impulse assessment timed out')), timeoutMs);
            }),
        ]);
        return readImpulseResult(raw, state.impulse, prompt.scene);
    } finally {
        stopTimer(timer);
    }
}
