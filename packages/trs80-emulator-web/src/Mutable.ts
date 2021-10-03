
/**
 * Interface for an object that can be muted.
 */
export interface Mutable {
    mute(): void;
    unmute(): void;
    isMuted(): boolean;
}
