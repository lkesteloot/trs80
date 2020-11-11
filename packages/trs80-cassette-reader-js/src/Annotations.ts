
/**
 * Information about one particular section of a program. Because this is program-based, the indices
 * are byte-oriented.
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

/**
 * Context that a WaveformAnnotation can use to draw into the waveform display.
 */
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
     * Color for foreground elements, such as text.
     */
    foregroundColor: string;

    /**
     * Color for secondary elements, like arrows and braces.
     */
    secondaryForegroundColor: string;

    /**
     * Color to use for highlighting something brightly.
     */
    highlightColor: string;
}

/**
 * Interface of annotations of the raw waveform.
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
        ctx.context.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.context.fill();

    }
}

/**
 * Annotation to draw a horizontal line.
 */
export class HorizontalLineAnnotation implements WaveformAnnotation {
    public readonly value: number;
    public readonly x1: number;
    public readonly x2: number;

    constructor(value: number, x1: number, x2: number) {
        this.value = value;
        this.x1 = x1;
        this.x2 = x2;
    }

    draw(ctx: AnnotationContext): void {
        const y = ctx.valueToY(this.value);

        ctx.context.strokeStyle = ctx.highlightColor;
        ctx.context.beginPath();
        ctx.context.moveTo(ctx.frameToX(this.x1), y);
        ctx.context.lineTo(ctx.frameToX(this.x2), y);
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

/**
 * Label with braces.
 */
export class LabelAnnotation implements WaveformAnnotation {
    public readonly label: string;
    public readonly left: number;
    public readonly right: number;
    public readonly onTop: boolean;

    constructor(label: string, left: number, right: number, onTop: boolean) {
        this.label = label;
        this.left = left;
        this.right = right;
        this.onTop = onTop;
    }

    draw(ctx: AnnotationContext): void {
        const x1 = ctx.frameToX(this.left);
        const x2 = ctx.frameToX(this.right);

        drawBraceAndLabel(ctx.context, ctx.height,
            x1, x2, ctx.secondaryForegroundColor,
            this.label, ctx.foregroundColor, this.onTop);
    }
}

/**
 * Draw a brace with specified label.
 */
export function drawBraceAndLabel(ctx: CanvasRenderingContext2D, height: number,
    left: number, right: number,
    braceColor: string, label: string,
    labelColor: string, drawOnTop: boolean): void {

    const middle = (left + right) / 2;

    const leading = 16;

    // Don't have more than two lines, there's no space for it.
    const lines = label.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Don't use a custom font here, they load asynchronously and we're not told when they
        // finish loading, so we can't redraw and the initial draw uses some default serif font.
        ctx.font = '10pt monospace';
        ctx.fillStyle = labelColor;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        const y = drawOnTop ? 38 - (lines.length - i - 1) * leading : height - 35 + i * leading;
        ctx.fillText(line, middle, y);
    }

    ctx.strokeStyle = braceColor;
    ctx.lineWidth = 1;
    drawBrace(ctx, left, middle, right, 40, height - 40, drawOnTop);
}

/**
 * Draw a horizontal brace.
 */
export function drawBrace(ctx: CanvasRenderingContext2D,
    left: number, middle: number, right: number,
    top: number, bottom: number,
    drawOnTop: boolean): void {

    const radius = Math.min(10, (right - left) / 4);
    const lineY = drawOnTop ? top + 20 : bottom - 20;
    const pointY = drawOnTop ? top : bottom;
    const otherY = drawOnTop ? bottom - 40 : top + 40;

    ctx.beginPath();
    ctx.moveTo(left, otherY);
    if (left === right) {
        ctx.lineTo(left, lineY);
    } else {
        ctx.arcTo(left, lineY, left + radius, lineY, radius);
        ctx.arcTo(middle, lineY, middle, pointY, radius);
        ctx.arcTo(middle, lineY, middle + radius, lineY, radius);
        ctx.arcTo(right, lineY, right, lineY + (drawOnTop ? radius : -radius), radius);
        ctx.lineTo(right, otherY);
    }
    ctx.stroke();
}
