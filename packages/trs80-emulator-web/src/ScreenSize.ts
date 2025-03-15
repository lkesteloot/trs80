
/**
 * Describes the size of a screen, in CSS units.
 */
export class ScreenSize {
    public constructor(
        // Width and height include padding.
        public readonly width: number,
        public readonly height: number,
        // Outsize the text, on all sides.
        public readonly scaledPadding: number) {
    }

    public equals(other: ScreenSize): boolean {
        return this.width === other.width
            && this.height === other.height
            && this.scaledPadding === other.scaledPadding;
    }
}

/**
 * Interface for an entity that has a size that can be listened to.
 */
export interface ScreenSizeProvider {
    /**
     * Registers a callback for changes to the screen size. The callback is called synchronously
     * immediately with the current screen size, and subsequently whenever the size changes.
     * Returns a function that can be used to unsubscribe.
     */
    listenForScreenSize(callback: (screenSize: ScreenSize) => void): () => void;
}
