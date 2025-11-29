// Various sizes that the screen can be.
export class ScreenSize {
    public constructor(
        public readonly text: string,
        public readonly scale: number,
        public readonly label: string) {}
}
export const SCREEN_SIZES: ScreenSize[] = [
    new ScreenSize("Small", 1.0, "small"),
    new ScreenSize("Medium", 1.25, "medium"),
    new ScreenSize("Large", 1.5, "large"),
];
export const DEFAULT_SCREEN_SIZE = SCREEN_SIZES[SCREEN_SIZES.length - 1];
export const SCREEN_SIZES_MAP = new Map(SCREEN_SIZES.map(screenSize => [screenSize.label, screenSize]));
