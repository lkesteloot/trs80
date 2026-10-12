
/**
 * Describes the size of a screen, all in CSS units.
 */
export class ScreenSize {
    public constructor(
        // Width and height include padding.
        public readonly width: number,
        public readonly height: number,
        // Outside the text, on the left and right sides.
        public readonly paddingX: number,
        // Outside the text, on the top and bottom sides.
        public readonly paddingY: number) {
    }

    public equals(other: ScreenSize): boolean {
        return this.width === other.width
            && this.height === other.height
            && this.paddingX === other.paddingX
            && this.paddingY === other.paddingY;
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
