// Overseer - SillyTavern extension boilerplate

const MODULE_NAME = 'overseer';

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
        version: manifest.version,
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

// ---- Event handlers ----

function handleIncomingMessage() {
    // Handle message
}

function setupEventListeners() {
    const { eventSource, event_types } = getContext();
    eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
}

function cleanupEventListeners() {
    const { eventSource, event_types } = getContext();
    eventSource.removeListener(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
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
    await appendSettingsPanel();
    console.log('[Overseer] Extension loaded');
});
