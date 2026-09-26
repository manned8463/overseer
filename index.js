// Overseer - SillyTavern extension boilerplate

const MODULE_NAME = 'overseer';
const MANIFEST_VERSION = '1.0.0';

const defaultSettings = Object.freeze({
    enabled: false,
    option1: 'default',
    option2: 5,
});

const getContext = () => SillyTavern.getContext();

function getSettings() {
    const { extensionSettings } = getContext();
    const settings = extensionSettings[MODULE_NAME] ?? {};

    // Ensure all default keys exist (helpful after updates)
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = defaultSettings[key];
        }
    }

    extensionSettings[MODULE_NAME] = settings;
    return settings;
}

function loadSettings() {
    const { extensionSettings } = getContext();
    // Merge with defaults to handle new keys after updates and initialize if it doesn't exist
    extensionSettings[MODULE_NAME] = SillyTavern.libs.lodash.merge(
        structuredClone(defaultSettings),
        extensionSettings[MODULE_NAME]
    );
}

async function appendSettingsPanel() {
    const { renderExtensionTemplateAsync } = getContext();
    const settings = getSettings();

    const settingsHtml = await renderExtensionTemplateAsync('third-party/overseer', 'settings', {
        title: 'Overseer',
        version: MANIFEST_VERSION,
        defaultValue: settings.option1,
    });

    $('#extensions_settings2').append(settingsHtml);

    $('#overseer_enabled').on('input', function () {
        const { saveSettingsDebounced } = getContext();
        const value = $(this).prop('checked');
        getSettings().enabled = value;
        saveSettingsDebounced();
    });

    $('#overseer_option1').on('input', function () {
        const { saveSettingsDebounced } = getContext();
        const value = $(this).val();
        getSettings().option1 = String(value);
        saveSettingsDebounced();
    });
}

// ---- Input lock ----

/** Cancel handler while the send button is taken over, or null when idle */
let cancelActivePhase = null;

/**
 * Locks or unlocks the message input textarea.
 * @param {boolean} locked Whether to lock the textarea
 */
function setTextareaLocked(locked) {
    const textarea = document.querySelector('#send_textarea');
    if (textarea instanceof HTMLTextAreaElement) {
        textarea.disabled = locked;
    }
}

/**
 * Turns the send button into a cancel button, or restores its normal state.
 * The original state is remembered in data attributes and restored on release.
 * @param {boolean} active Whether to take over the button
 * @param {string} [tooltip] Tooltip and aria-label shown while taken over
 * @param {() => void} [onCancel] Invoked when the button is clicked while taken over
 */
function setSendButtonCancel(active, tooltip = '', onCancel = null) {
    const sendButton = document.querySelector('#send_but');
    if (!(sendButton instanceof HTMLElement)) {
        return;
    }

    cancelActivePhase = null;

    if (active) {
        // Remember the original state so it can be restored (only once)
        if (sendButton.dataset.overseerManaged !== 'true') {
            sendButton.dataset.overseerManaged = 'true';
            sendButton.dataset.overseerOriginalClassName = sendButton.className;
            sendButton.dataset.overseerOriginalTitle = sendButton.getAttribute('title') ?? '';
            const ariaLabel = sendButton.getAttribute('aria-label');
            if (ariaLabel !== null) {
                sendButton.dataset.overseerOriginalAriaLabel = ariaLabel;
            }
        }

        sendButton.classList.remove('fa-paper-plane');
        sendButton.classList.add('fa-circle-stop');
        sendButton.title = tooltip;
        sendButton.setAttribute('aria-label', tooltip);
        cancelActivePhase = onCancel;
    } else if (sendButton.dataset.overseerManaged === 'true') {
        sendButton.className = sendButton.dataset.overseerOriginalClassName ?? sendButton.className;
        sendButton.title = sendButton.dataset.overseerOriginalTitle ?? '';
        const originalAriaLabel = sendButton.dataset.overseerOriginalAriaLabel;
        if (originalAriaLabel !== undefined) {
            sendButton.setAttribute('aria-label', originalAriaLabel);
        } else {
            sendButton.removeAttribute('aria-label');
        }
        delete sendButton.dataset.overseerManaged;
        delete sendButton.dataset.overseerOriginalClassName;
        delete sendButton.dataset.overseerOriginalTitle;
        delete sendButton.dataset.overseerOriginalAriaLabel;
    }
}

/**
 * Capture-phase click handler that intercepts the send button while it is
 * taken over, so clicks cancel the active phase instead of sending.
 * @param {MouseEvent} event Click event
 */
function handleSendButtonClick(event) {
    if (!cancelActivePhase) {
        return;
    }

    const target = event.target;
    if (target instanceof Element && target.closest('#send_but')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelActivePhase();
    }
}

// ---- Event handlers ----

/** TODO(test): simulated pre/post-processing task duration, in ms. Remove after testing. */
const TEST_DELAY_MS = 20_000;

/** Timer handle for the active test task, or null when idle */
let testDelayTimer = null;

/** Cancel function for the active test task, or null when idle */
let cancelTestTask = null;

/** Whether the current generation is tracked by this extension */
let overseerGeneration = false;

/** Cancels the active test task, if any. */
function clearTestDelay() {
    clearTimeout(testDelayTimer);
    testDelayTimer = null;
    cancelTestTask?.();
    cancelTestTask = null;
}

/**
 * TODO(test): stand-in for the future pre/post-processing features. Takes over
 * the send button as a cancel button and resolves when the simulated task
 * completes or the user cancels it by clicking that button. Remove after testing.
 *
 * @param {string} stopTooltip Tooltip for the cancel button
 * @returns {Promise<void>}
 */
function runTestTask(stopTooltip) {
    clearTestDelay();

    return new Promise((resolve) => {
        console.log('[Overseer] Running Test Task...');
        /** Ends the task and unblocks the awaiting caller. */
        const finish = () => {
            testDelayTimer = null;
            cancelTestTask = null;
            setSendButtonCancel(false);
            resolve();
            console.log('[Overseer] Test Task Complete...');
        };

        // Cancel hook so external cancellation (cleanup, a new generation) ends the task
        cancelTestTask = finish;

        // The taken-over send button cancels the task when clicked
        setSendButtonCancel(true, stopTooltip, finish);

        // TODO(test): simulated task duration. Remove after testing.
        testDelayTimer = setTimeout(finish, TEST_DELAY_MS);
    });
}

function handleIncomingMessage() {
    // Handle message
}

/**
 * Runs the (test) pre-processing task under a cancellable loader, then locks
 * the user input with a blocking loader while the generation is in flight.
 */
async function handleGenerationAfterCommands(type, _options, dryRun) {
    if (!getSettings().enabled) {
        return;
    }

    // Skip background dry runs and quiet prompts from other extensions
    if (dryRun || type === 'quiet') {
        return;
    }

    // Mark this as an overseer-tracked generation, so GENERATION_ENDED (which
    // carries no type/dry-run info) only reacts to generations we locked for
    overseerGeneration = true;

    // Keep the input locked across the pre task and the generation itself,
    // so the message can't be re-submitted in between
    setTextareaLocked(true);

    // TODO(test): run the pre-processing features here. Remove after testing.
    // Cancelling ends the task early; generation then proceeds.
    await runTestTask('Cancel pre-processing');

    // During the generation itself, SillyTavern shows its native stop button
    // (#mes_stop), which stops the generation and fires GENERATION_ENDED,
    // where the post-processing task takes over.
}

/**
 * Keeps the message input locked with the send button acting as a cancel
 * button while a (test) post-generation task runs after the generation
 * completes, errors out, or is stopped. Unlocks when the task finishes
 * or is cancelled.
 */
async function handleGenerationEnded() {
    // Only react to generations we locked the input for; background quiet
    // generations also emit this event and must not run post-processing
    if (!overseerGeneration) {
        return;
    }

    overseerGeneration = false;
    clearTestDelay();

    if (!getSettings().enabled) {
        // Still unlock in case the setting was flipped mid-generation
        setTextareaLocked(false);
        setSendButtonCancel(false);
        return;
    }

    // TODO(test): run the post-processing features here. Remove after testing.
    await runTestTask('Cancel post-processing');

    setTextareaLocked(false);
}

function setupEventListeners() {
    const { eventSource, event_types } = getContext();
    eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
    eventSource.on(event_types.GENERATION_AFTER_COMMANDS, handleGenerationAfterCommands);
    eventSource.on(event_types.GENERATION_ENDED, handleGenerationEnded);

    // Capture phase, so clicks on the taken-over send button can be intercepted
    // before SillyTavern's own send handler runs
    document.addEventListener('click', handleSendButtonClick, true);
}

async function cleanupEventListeners() {
    const { eventSource, event_types } = getContext();
    eventSource.removeListener(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
    eventSource.removeListener(event_types.GENERATION_AFTER_COMMANDS, handleGenerationAfterCommands);
    eventSource.removeListener(event_types.GENERATION_ENDED, handleGenerationEnded);

    document.removeEventListener('click', handleSendButtonClick, true);

    // Restore the input bar in case the extension is removed while a task is in-flight
    clearTestDelay();
    setTextareaLocked(false);
    setSendButtonCancel(false);
}

// ---- Lifecycle hooks ----

export async function onInstall() {
    console.log('[Overseer] Extension installed! Performing first-time setup...');
    loadSettings();
}

export async function onActivate() {
    console.log('[Overseer] Extension activated during page load');
    loadSettings();
    setupEventListeners();
}

export async function onUpdate() {
    console.log('[Overseer] Extension updated! Running migrations...');
}

export async function onDelete() {
    console.log('[Overseer] Extension about to be deleted. Cleaning up...');
    cleanupEventListeners();
}

export function onEnable() {
    console.log('[Overseer] Extension enabled');
}

export function onDisable() {
    console.log('[Overseer] Extension disabled');
}

export async function onClean() {
    console.log('[Overseer] Extension data cleaned');
    const { extensionSettings, saveSettingsDebounced } = getContext();
    delete extensionSettings[MODULE_NAME];
    saveSettingsDebounced();
}

// ---- Initialization ----

// Asynchronous setup that doesn't need to block SillyTavern from being ready
const { eventSource, event_types } = getContext();
eventSource.on(event_types.APP_READY, async () => {
    try {
        await appendSettingsPanel();
        console.log('[Overseer] Extension loaded');
    } catch (error) {
        console.error('[Overseer] Failed to initialize:', error);
    }
});
