import {DEFAULT_SCREEN_SIZE} from "./ScreenSize";

const LOCAL_STORAGE_SETTINGS_KEY = "trs80-ide-settings";

/**
 * Editor and emulator settings that are saved to local storage.
 */
export type Settings = {
    autocompleteOnTab: boolean,
    showLineNumbers: boolean,
    showAddresses: boolean,
    showBytecode: boolean,
    showTiming: boolean,
    showStatistics: boolean,
    screenSize: string,
    z80Inspector: boolean,
    memoryInspector: boolean,
    stackInspector: boolean,
    fdcInspector: boolean,
};
const DEFAULT_SETTINGS: Settings = {
    autocompleteOnTab: true,
    showLineNumbers: true,
    showAddresses: true,
    showBytecode: true,
    showTiming: false,
    showStatistics: false,
    screenSize: DEFAULT_SCREEN_SIZE.label,
    z80Inspector: true,
    memoryInspector: false,
    stackInspector: false,
    fdcInspector: false,
};

/**
 * Load the settings object from local storage.
 */
export function loadSettings(): Settings {
    return {
        ... DEFAULT_SETTINGS,
        ... JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY) ?? "{}"),
    };
}

/**
 * Save the settings object to local storage.
 */
export function saveSettings(settings: Settings) {
    window.localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}
