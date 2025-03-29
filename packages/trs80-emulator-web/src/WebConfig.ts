
import { Config } from "trs80-emulator";

/**
 * Save the TRS-80 emulator config to local storage for the given key. The key
 * should be something like "trs80-ide-config".
 */
export function saveTrs80Config(config: Config, configKey: string): void {
    window.localStorage.setItem(configKey, config.serialize())
}

/**
 * Load a TRS-80 config from local storage, or make a default one.
 */
export function loadTrs80Config(configKey: string) {
    const serializedConfig = window.localStorage.getItem(configKey);
    if (serializedConfig !== null) {
        try {
            const newConfig = Config.deserialize(serializedConfig);
            if (newConfig.isValid()) {
                return newConfig;
            }
        } catch (e) {
            // Protect against bugs in deserialization.
            console.log("Deserialization of TRS-80 Config failed", e);
        }

        // Delete if we got an exception or the config was invalid.
        window.localStorage.removeItem(configKey);
    }

    return Config.makeDefault();
}
