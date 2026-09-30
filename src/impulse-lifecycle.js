/** Settled character completion and one coalesced background impulse pass. */
import { sceneWindow } from './evaluate.js';
import { normalizeAppetite, normalizeImpulse } from './state.js';
import { assessImpulse } from './impulse-assessment.js';

const characterTypes = new Set(['normal', 'regenerate', 'swipe', 'continue', 'appendFinal']);
const signature = (value) => JSON.stringify(value);
const appetiteOf = (state) => signature(normalizeAppetite(state?.appetite));
const impulseOf = (state) => signature(normalizeImpulse(state?.impulse));
const toolObservers = new WeakMap();

/** Observe the public tool manager without changing its arguments or result. */
function observeTools(manager, notify) {
    if (!manager || typeof manager.invokeFunctionTools !== 'function' || typeof manager.hasToolCalls !== 'function') {
        return () => {};
    }
    let entry = toolObservers.get(manager);
    if (!entry) {
        const original = manager.invokeFunctionTools;
        const listeners = new Set();
        const wrapper = function (...args) {
            try {
                const calls = manager.hasToolCalls(args[0]);
                for (const listener of listeners) {
                    listener(calls);
                }
            } catch {
                // An observer never changes the host's tool execution. A missing
                // witness fails closed at the completion gate instead.
            }
            return original.apply(this, args);
        };
        entry = { original, wrapper, listeners };
        try {
            manager.invokeFunctionTools = wrapper;
        } catch {
            return () => {};
        }
        toolObservers.set(manager, entry);
    }
    entry.listeners.add(notify);
    return () => {
        entry.listeners.delete(notify);
        if (!entry.listeners.size) {
            if (manager.invokeFunctionTools === entry.wrapper) {
                manager.invokeFunctionTools = entry.original;
            }
            toolObservers.delete(manager);
        }
    };
}

/** Full source revisions, not just timestamps: an in-place edit keeps its date. */
export function sceneRevision(chat) {
    return signature([chat?.length, sceneWindow(chat).map(({ index, message }) => [
        index, message?.name, message?.is_user, message?.is_system, message?.send_date,
        message?.swipe_id, message?.mes, message?.gen_started, message?.gen_finished,
    ])]);
}

const messageRevision = (message) => signature([
    message?.mes, message?.send_date, message?.gen_started, message?.gen_finished,
]);

// Capture the public processor itself during callbacks; the host clears its global
// pointer after completion. Its flags remain available to the deferred check.
export function streamSucceeded(processor) {
    return processor?.isFinished === true && processor.isStopped === false
        && processor.abortController?.signal?.aborted === false;
}

export function createImpulseAssessment({ getContext, getState, persist, generate, refresh = () => {}, log = {},
    defer = (fn) => setTimeout(fn, 0), cancel = clearTimeout, assessmentOptions = {} } = {}) {
    let attempt = null;
    let pending = null;
    let running = null;
    let activeReading = null;
    let tick = null;
    let epoch = 0;
    let disposed = false;

    const sameChat = (captured, current) => captured.chatMetadata === current.chatMetadata
        && captured.chatId === current.chatId && captured.characterId === current.characterId
        && captured.name2 === current.name2;

    const currentReading = (reading) => {
        const current = getContext();
        const state = getState();
        return reading.epoch === epoch && sameChat(reading.context, current)
            && reading.scene === sceneRevision(current.chat)
            && reading.appetite === appetiteOf(state) && reading.impulse === impulseOf(state);
    };

    const drain = () => {
        if (running || !pending || attempt) {
            return;
        }
        const reading = pending;
        pending = null;
        if (!currentReading(reading)) {
            return;
        }
        activeReading = reading;
        running = (async () => {
            try {
                const result = await assessImpulse(reading.state, {
                    ...assessmentOptions, chat: reading.chat, character: reading.context.name2, generate,
                });
                if (!result || !currentReading(reading)) {
                    return;
                }
                // Readers can clone. Merge into a fresh ledger so scans and other
                // manual fields written during generation are not rolled back.
                const live = getState();
                if (impulseOf(live) === signature(result)) {
                    return;
                }
                live.impulse = result;
                if (await persist(live, reading.context.chatMetadata)) {
                    refresh();
                }
            } catch (error) {
                log.warn?.('Impulse assessment failed; keeping the last valid impulse.', error);
            }
        })();
        void running.finally(() => {
            running = null;
            activeReading = null;
            drain();
        });
    };

    const flush = () => {
        tick = null;
        const completed = attempt;
        if (!completed?.ended || !completed.received) {
            return;
        }
        attempt = null;
        const current = getContext();
        const candidate = completed.received;
        if (!sameChat(completed.context, current) || completed.stopped
            || completed.signal?.aborted || current.chat?.[candidate.index] !== candidate.message
            || messageRevision(candidate.message) !== candidate.revision
            || completed.toolIntermediate
            || (!completed.processor && completed.toolsEnabled && !completed.toolWitnessed)
            || (completed.processor && (!streamSucceeded(completed.processor)
                || completed.processor.toolCalls?.length))) {
            drain();
            return;
        }
        const state = getState();
        if (!normalizeAppetite(state?.appetite).want.trim()
            || normalizeImpulse(state?.impulse).status === 'suspended') {
            drain();
            return;
        }
        const chat = new Array(current.chat.length);
        for (const { index, message } of sceneWindow(current.chat)) {
            chat[index] = { name: message?.name, mes: message?.mes, extra: { sidekick: message?.extra?.sidekick } };
        }
        pending = {
            context: { ...current }, epoch, state,
            chat, scene: sceneRevision(current.chat),
            appetite: appetiteOf(state), impulse: impulseOf(state),
        };
        drain();
    };
    const schedule = () => {
        if (tick !== null) {
            cancel(tick);
        }
        tick = defer(flush);
    };

    const started = (type = 'normal', options = {}, dryRun = false) => {
        if (disposed || dryRun || !characterTypes.has(type)) {
            return;
        }
        epoch++;
        pending = null;
        const context = getContext();
        if (!Object.hasOwn(context, 'streamingProcessor')) {
            attempt = null;
            log.warn?.('Impulse assessment needs the public streamingProcessor completion flags.');
            return;
        }
        attempt = {
            context: { ...context }, initialProcessor: context.streamingProcessor, processor: null,
            signal: options.signal, ended: false, stopped: false, received: null,
            toolsEnabled: Boolean(context.ToolManager?.canPerformToolCalls?.(type)),
            toolIntermediate: false, toolWitnessed: false,
        };
    };
    const observeProcessor = () => {
        const processor = getContext().streamingProcessor;
        if (processor && processor !== attempt.initialProcessor) {
            attempt.processor = processor;
        }
    };
    const received = (index, type) => {
        if (!attempt || !characterTypes.has(type) || !sameChat(attempt.context, getContext())) {
            return;
        }
        const message = getContext().chat?.[index];
        if (!Number.isInteger(index) || !message || message.is_user || message.is_system
            || message.extra?.sidekick || message.name !== attempt.context.name2
            || typeof message.mes !== 'string' || !message.mes.trim() || message.mes.trim() === '...'
            || !message.gen_started || !message.gen_finished) {
            return;
        }
        observeProcessor();
        attempt.received = { index, message, revision: messageRevision(message) };
        schedule();
    };
    const ended = () => {
        if (!attempt) {
            return;
        }
        observeProcessor();
        attempt.ended = true;
        schedule();
    };
    const invalidate = () => {
        // Swiping to the reply just generated can emit a notification without
        // changing the reading. Actual source changes always cancel stale work.
        const reading = pending ?? activeReading;
        if (reading && sameChat(reading.context, getContext())
            && reading.scene === sceneRevision(getContext().chat)) {
            return;
        }
        epoch++;
        pending = null;
    };
    const stopped = () => {
        epoch++;
        pending = null;
        attempt = null;
    };
    const changed = () => {
        epoch++;
        pending = null;
        attempt = null;
    };
    const releaseTools = observeTools(getContext().ToolManager, (hasCalls) => {
        if (attempt && sameChat(attempt.context, getContext())) {
            attempt.toolWitnessed = true;
            attempt.toolIntermediate ||= Boolean(hasCalls);
        }
    });
    return {
        started, received, ended, stopped, changed, invalidate,
        dispose: () => {
            disposed = true;
            changed();
            if (tick !== null) {
                cancel(tick);
                tick = null;
            }
            releaseTools();
        },
        get busy() { return running !== null; },
    };
}

/** Bind only character lifecycle events; raw/quiet generation never starts work. */
export function mountImpulseAssessment(deps) {
    const controller = createImpulseAssessment(deps);
    const { eventSource, event_types } = deps.getContext();
    const handlers = {
        GENERATION_STARTED: controller.started,
        MESSAGE_RECEIVED: controller.received,
        GENERATION_ENDED: controller.ended,
        GENERATION_STOPPED: controller.stopped,
        CHAT_CHANGED: controller.changed,
        MESSAGE_SENT: controller.invalidate,
        MESSAGE_SWIPED: controller.invalidate,
        MESSAGE_EDITED: controller.invalidate,
        MESSAGE_UPDATED: controller.invalidate,
        MESSAGE_DELETED: controller.invalidate,
        MESSAGE_SWIPE_DELETED: controller.invalidate,
        TOOL_CALLS_PERFORMED: controller.invalidate,
    };
    for (const [name, handler] of Object.entries(handlers)) {
        if (event_types[name]) {
            eventSource.on(event_types[name], handler);
        }
    }
    const dispose = controller.dispose;
    controller.dispose = () => {
        for (const [name, handler] of Object.entries(handlers)) {
            if (event_types[name]) {
                eventSource.removeListener?.(event_types[name], handler);
            }
        }
        dispose();
    };
    return controller;
}
