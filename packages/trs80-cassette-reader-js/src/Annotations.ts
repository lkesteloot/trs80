
/**
 * Information about one particular section of a program.
 */
export class ProgramAnnotation {
    /**
     * Text to display.
     */
    public readonly text: string;
    /**
     * First byte index into the binary array of the highlight, inclusive.
     */
    public readonly firstIndex: number;
    /**
     * Last byte index into the binary array of the highlight, inclusive.
     */
    public readonly lastIndex: number;

    /**
     * Create an object representing a section to annotate.
     *
     * @param text any text to display for that section.
     * @param firstIndex the first index into the binary, inclusive.
     * @param lastIndex the last index into the binary, inclusive.
     */
    constructor(text: string, firstIndex: number, lastIndex: number) {
        this.text = text;
        this.firstIndex = firstIndex;
        this.lastIndex = lastIndex;
    }
}

export interface AnnotationContext {
    /**
     * Width of the canvas in pixels.
     */
    width: number;

    /**
     * Height of the canvas in pixels.
     */
    height: number;

    /**
     * Convert a frame number to a pixel X coordinate.
     */
    frameToX(frame: number): number;

    /**
     * Convert an audio value to a pixel Y coordinate.
     */
    valueToY(value: number): number;

    /**
     * Graphics context to draw into.
     */
    context: CanvasRenderingContext2D;

    /**
     * Color to use for highlighting something brightly.
     */
    highlightColor: string;
}

/**
 * Base class of annotations of the raw waveform.
 */
export interface WaveformAnnotation {
    /**
     * Draw the annotation.
     */
    draw(ctx: AnnotationContext): void;
}

/**
 * Annotation to draw a point.
 */
export class PointAnnotation implements WaveformAnnotation {
    public readonly frame: number;
    public readonly value: number;

    constructor(frame: number, value: number) {
        this.frame = frame;
        this.value = value;
    }

    draw(ctx: AnnotationContext): void {
        const x = ctx.frameToX(this.frame);
        const y = ctx.valueToY(this.value);

        ctx.context.fillStyle = ctx.highlightColor;
        ctx.context.beginPath();
        ctx.context.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.context.fill();

    }
}

/**
 * Annotation to draw a horizontal line.
 */
export class HorizontalLineAnnotation implements WaveformAnnotation {
    public readonly value: number;

    constructor(value: number) {
        this.value = value;
    }

    draw(ctx: AnnotationContext): void {
        const y = ctx.valueToY(this.value);

        ctx.context.strokeStyle = ctx.highlightColor;
        ctx.context.beginPath();
        ctx.context.moveTo(0, y);
        ctx.context.lineTo(ctx.width, y);
        ctx.context.stroke();

    }
}

/**
 * Annotation to draw a vertical line.
 */
export class VerticalLineAnnotation implements WaveformAnnotation {
    public readonly frame: number;

    constructor(frame: number) {
        this.frame = frame;
    }

    draw(ctx: AnnotationContext): void {
        const x = ctx.frameToX(this.frame);

        ctx.context.strokeStyle = ctx.highlightColor;
        ctx.context.beginPath();
        ctx.context.moveTo(x, 0);
        ctx.context.lineTo(x, ctx.height);
        ctx.context.stroke();

    }
}
