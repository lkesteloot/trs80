import {Trs80WebScreen} from "./Trs80WebScreen.js";
import {GlyphOptions, MODEL1A_FONT, MODEL1B_FONT, MODEL3_ALT_FONT, MODEL3_FONT} from "./Fonts.js";
import {Background, CGChip, Config, ModelType, Phosphor, ScanLines} from "trs80-emulator";
import {toHexByte} from "z80-base";
import {
    TRS80_CHAR_HEIGHT,
    TRS80_CHAR_PIXEL_HEIGHT,
    TRS80_CHAR_PIXEL_WIDTH,
    TRS80_CHAR_WIDTH,
    TRS80_PIXEL_HEIGHT,
    TRS80_PIXEL_WIDTH,
    TRS80_SCREEN_BEGIN,
    TRS80_SCREEN_SIZE
} from "trs80-base";
import {SimpleEventDispatcher} from "strongly-typed-events";
import {FlipCard, FlipCardSide} from "./FlipCard.js";

const TRS80_CHAR_CRT_PIXEL_WIDTH = 8;
const TRS80_CHAR_CRT_PIXEL_HEIGHT = 24;
const TRS80_CRT_PIXEL_WIDTH = TRS80_CHAR_WIDTH*TRS80_CHAR_CRT_PIXEL_WIDTH;
const TRS80_CRT_PIXEL_HEIGHT = TRS80_CHAR_HEIGHT*TRS80_CHAR_CRT_PIXEL_HEIGHT;

export const AUTHENTIC_BACKGROUND = "#334843";
export const BLACK_BACKGROUND = "#000000";

const PADDING = 10;
const BORDER_RADIUS = 8;

const WHITE_PHOSPHOR = [230, 231, 252];
const AMBER_PHOSPHOR = [247, 190, 64];
const GREEN_PHOSPHOR = [122, 244, 96];

// Gets an RGB array (0-255) for a phosphor.
export function phosphorToRgb(phosphor: Phosphor): number[] {
    switch (phosphor) {
        case Phosphor.WHITE:
        default:
            return WHITE_PHOSPHOR;

        case Phosphor.GREEN:
            return GREEN_PHOSPHOR;

        case Phosphor.AMBER:
            return AMBER_PHOSPHOR;
    }
}

const VERTEX_SHADER_SOURCE = `#version 300 es
 
in vec4 a_position;
in vec2 a_texcoord;
out vec2 v_texcoord;
 
void main() {
    gl_Position = a_position;
    v_texcoord = a_texcoord;
}
`;

const FRAGMENT_SHADER1_SOURCE = `#version 300 es
 
precision highp float;
precision highp usampler2D;

uniform sampler2D u_fontTexture;
uniform usampler2D u_memoryTexture;
in vec2 v_texcoord;
out vec4 outColor;

const ivec2 g_charSize = ivec2(${TRS80_CHAR_WIDTH}, ${TRS80_CHAR_HEIGHT});
const ivec2 g_charCrtPixelSize = ivec2(${TRS80_CHAR_CRT_PIXEL_WIDTH}, ${TRS80_CHAR_CRT_PIXEL_HEIGHT});

void main() {
    // Integer texel coordinate.
    ivec2 t = ivec2(v_texcoord - 0.5);

    // Character position.
    ivec2 c = t/g_charCrtPixelSize;

    if (c.x >= 0 && c.x < g_charSize.x && c.y >= 0 && c.y < 16) {
        // Character sub-position.
        ivec2 s = t % g_charCrtPixelSize;

        // Address in memory.
        int addr = c.y*g_charSize.x + c.x;

        // Character to draw.
        vec2 memoryCoord = vec2(float(addr)/1024.0, 0.0);
        int ch = int(texture(u_memoryTexture, memoryCoord).r);

        // Where to look in the font texture.
        vec2 fontCoord = vec2((float(ch*g_charCrtPixelSize.x + s.x))/2048.0, (float(s.y))/float(g_charCrtPixelSize.y));
        vec4 fontPixel = texture(u_fontTexture, fontCoord);
        if (fontPixel.r > 0.5) {
            outColor = vec4(1.0, 1.0, 1.0, 1.0);
        } else {
            outColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    } else {
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
}
`;

const FRAGMENT_SHADER2_SOURCE = `#version 300 es
 
precision highp float;
precision highp usampler2D;

uniform sampler2D u_rawScreenTexture;
in vec2 v_texcoord;
out vec4 outColor;

const vec4 g_background = vec4(51.0/255.0, 72.0/255.0, 67.0/255.0, 1.0);
const vec4 g_foreground = vec4(230.0/255.0, 231.0/255.0, 252.0/255.0, 1.0);
const ivec2 g_charSize = ivec2(${TRS80_CHAR_WIDTH}, ${TRS80_CHAR_HEIGHT});
const ivec2 g_charCrtPixelSize = ivec2(${TRS80_CHAR_CRT_PIXEL_WIDTH}, ${TRS80_CHAR_CRT_PIXEL_HEIGHT});
const vec2 g_size = vec2(g_charSize*g_charCrtPixelSize);
const float g_padding = 10.0;
const float g_radius = 8.0;
const float g_scale = 3.0;
const int RADIUS = 0;
const int DIAMETER = RADIUS*2 + 1;
const int AREA = DIAMETER*DIAMETER;
const float ZOOM = 5.0;

vec4 samplePixel(vec2 pixelCoord) {
    // Unscaled.
    vec2 p = (pixelCoord - 0.5)/g_scale;

    // Text area.
    vec2 t = (p - g_padding)/ZOOM;

    // Start test.
    t = (t - g_size/2.0)/g_size;
    t = t*(1.0 + 0.0*length(t));
    t = t*g_size + g_size/2.0;
    // End test.
    
    vec4 color;
    if (t.x >= 0.0 && t.y >= 0.0 && t.x < g_size.x && t.y < g_size.y) {
        color = texture(u_rawScreenTexture, t/g_size);
    } else {
        color = vec4(0.0, 0.0, 0.0, 1.0);
    }
    return color;
}

void main() {
    vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
    for (int dy = -RADIUS; dy <= RADIUS; dy++) {
        for (int dx = -RADIUS; dx <= RADIUS; dx++) {
            vec4 pixelColor = samplePixel(v_texcoord + vec2(dx, dy));
            color += pixelColor;
        }
    }
    outColor = color / float(AREA);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (shader === null) {
        throw new Error("Can't create GLSL shader");
    }

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error("Can't create GLSL shader: " + error);
    }

    return shader;
}

function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (program === null) {
        throw new Error("Can't create GLSL program");
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
        const error = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error("Can't create GLSL program: " + error);
    }

    return program;
}

/**
 * Type of mouse event.
 */
export type ScreenMouseEventType = "mousedown" | "mouseup" | "mousemove";

/**
 * Position of the mouse on the screen.
 */
export class ScreenMousePosition {
    // TRS-80 pixels (128x48).
    public readonly pixelX: number;
    public readonly pixelY: number;
    // Character position (64x16).
    public readonly charX: number;
    public readonly charY: number;
    // Sub-pixel within the character (2x3).
    public readonly subPixelX: number;
    public readonly subPixelY: number;
    // Bit that's on within the pixel (0-5), row-major.
    public readonly bit: number;
    // Mask of the above bit (0x01, 0x02, 0x04, 0x08, 0x10, 0x20).
    public readonly mask: number;
    // Offset of the character position within the screen (0-1023).
    public readonly offset: number;
    // Address in memory (15360-16383).
    public readonly address: number;

    public constructor(pixelX: number, pixelY: number) {
        this.pixelX = pixelX;
        this.pixelY = pixelY;
        this.charX = Math.floor(pixelX / TRS80_CHAR_PIXEL_WIDTH);
        this.charY = Math.floor(pixelY / TRS80_CHAR_PIXEL_HEIGHT);
        this.subPixelX = pixelX % TRS80_CHAR_PIXEL_WIDTH;
        this.subPixelY = pixelY % TRS80_CHAR_PIXEL_HEIGHT;
        this.bit = this.subPixelY * TRS80_CHAR_PIXEL_WIDTH + this.subPixelX;
        this.mask = 1 << this.bit;
        this.offset = this.charY * TRS80_CHAR_WIDTH + this.charX;
        this.address = this.offset + TRS80_SCREEN_BEGIN;
    }
}

/**
 * An event representing a mouse action on the screen.
 */
export class ScreenMouseEvent {
    public readonly type: ScreenMouseEventType;
    public readonly position: ScreenMousePosition;
    public readonly shiftKey: boolean;

    public constructor(type: ScreenMouseEventType, position: ScreenMousePosition, shiftKey: boolean) {
        this.type = type;
        this.position = position;
        this.shiftKey = shiftKey;
    }
}

/**
 * Simple representation of a pixel selection.
 */
export class Selection {
    public readonly x1: number;
    public readonly y1: number;
    public readonly width: number;
    public readonly height: number;

    constructor(x: number, y: number, width: number, height: number) {
        this.x1 = x;
        this.y1 = y;
        this.width = width;
        this.height = height;
    }

    // Exclusive.
    public get x2(): number {
        return this.x1 + this.width;
    }

    // Exclusive.
    public get y2(): number {
        return this.y1 + this.height;
    }

    public contains(x: number, y: number): boolean {
        return x >= this.x1 && y >= this.y1 && x < this.x2 && y < this.y2;
    }

    public isEmpty(): boolean {
        return this.width <= 0 || this.height <= 0;
    }

    public equals(other: Selection): boolean {
        return this.x1 === other.x1 &&
            this.y1 === other.y1 &&
            this.width === other.width &&
            this.height === other.height;
    }
}

export const FULL_SCREEN_SELECTION = new Selection(0, 0, TRS80_PIXEL_WIDTH, TRS80_PIXEL_HEIGHT);
export const EMPTY_SELECTION = new Selection(0, 0, 0, 0);

/**
 * Options for the overlay.
 */
export interface OverlayOptions {
    // Whether to show the pixel (fine) grid.
    showPixelGrid?: boolean;
    // Whether to show the character (coarse) grid.
    showCharGrid?: boolean;
    // Whether to highlight an entire pixel column or row.
    showHighlight?: boolean;
    highlightPixelColumn?: number;
    highlightPixelRow?: number;

    // Whether to show a character cursor, and where.
    showCursor?: boolean;
    cursorPosition?: number; // 0 to 1023.

    // Rectangular selection area.
    showSelection?: boolean;
    selection?: Selection;
    selectionAntsOffset?: number;
}

type FullOverlayOptions = Required<OverlayOptions>;

const DEFAULT_OVERLAY_OPTIONS: FullOverlayOptions = {
    showPixelGrid: false,
    showCharGrid: false,
    showHighlight: false,
    highlightPixelColumn: 0,
    highlightPixelRow: 0,
    showCursor: false,
    cursorPosition: 0,
    showSelection: false,
    selection: EMPTY_SELECTION,
    selectionAntsOffset: 0,
};

function overlayOptionsEqual(a: FullOverlayOptions, b: FullOverlayOptions): boolean {
    return a.showPixelGrid === b.showPixelGrid &&
        a.showCharGrid === b.showCharGrid &&
        a.showHighlight === b.showHighlight &&
        a.highlightPixelColumn === b.highlightPixelColumn &&
        a.highlightPixelRow === b.highlightPixelRow &&
        a.showCursor === b.showCursor &&
        a.cursorPosition === b.cursorPosition &&
        a.showSelection === b.showSelection &&
        a.selection.equals(b.selection) &&
        a.selectionAntsOffset === b.selectionAntsOffset;
}

const GRID_COLOR = "rgba(160, 160, 255, 0.5)";
const GRID_HIGHLIGHT_COLOR = "rgba(255, 255, 160, 0.5)";

/**
 * TRS-80 screen based on an HTML canvas element.
 */
export class CanvasScreen extends Trs80WebScreen implements FlipCardSide {
    public readonly scale: number = 1;
    public readonly padding: number;
    private readonly node: HTMLElement;
    private readonly width: number;
    private readonly height: number;
    private readonly canvas: HTMLCanvasElement;
    private readonly context: WebGL2RenderingContext;
    private readonly program1: WebGLProgram;
    private readonly program2: WebGLProgram;
    private readonly vao1: WebGLVertexArrayObject;
    private readonly vao2: WebGLVertexArrayObject;
    private readonly fontTexture: WebGLTexture;
    private readonly memoryTexture: WebGLTexture;
    private readonly rawScreenTexture: WebGLTexture;
    private readonly fb: WebGLFramebuffer;
    private readonly memory: Uint8Array = new Uint8Array(TRS80_SCREEN_SIZE);
    private readonly glyphs: HTMLCanvasElement[] = [];
    public readonly mouseActivity = new SimpleEventDispatcher<ScreenMouseEvent>();
    private flipCard: FlipCard | undefined = undefined;
    private lastMouseEvent: MouseEvent | undefined = undefined;
    private needRedraw = true;
    private config: Config = Config.makeDefault();
    private glyphWidth = 0;
    private overlayCanvas: HTMLCanvasElement | undefined = undefined;
    private overlayOptions: FullOverlayOptions = DEFAULT_OVERLAY_OPTIONS;

    /**
     * Create a canvas screen.
     *
     * @param scale size multiplier. If greater than 1, use multiples of 0.5.
     */
    constructor(scale: number = 1) {
        super();

        this.node = document.createElement("div");
        // Fit canvas horizontally so that the nested objects (panels and progress bars) are
        // displayed in the canvas.
        this.node.style.maxWidth = "max-content";

        this.scale = scale;
        this.padding = Math.round(PADDING * this.scale);

        this.canvas = document.createElement("canvas");
        // Make it block so we don't have any weird text margins on the bottom.
        this.canvas.style.display = "block";
        // In CSS pixels:
        this.width = TRS80_CRT_PIXEL_WIDTH * this.scale + 2 * this.padding;
        this.height = TRS80_CRT_PIXEL_HEIGHT * this.scale + 2 * this.padding;
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        // In device pixels:
        const devicePixelRatio = window.devicePixelRatio ?? 1;
        this.canvas.width = this.width*devicePixelRatio;
        this.canvas.height = this.height*devicePixelRatio;
        this.canvas.addEventListener("mousemove", (event) => this.onMouseEvent("mousemove", event));
        this.canvas.addEventListener("mousedown", (event) => this.onMouseEvent("mousedown", event));
        this.canvas.addEventListener("mouseup", (event) => this.onMouseEvent("mouseup", event));
        // We don't have a good way to unsubscribe from these two. We could add some kind of close() method.
        // We could also check in the callback that the canvas's ancestor is window.
        window.addEventListener("keydown", (event) => this.onKeyEvent(event), {
            capture: true,
            passive: true,
        });
        window.addEventListener("keyup", (event) => this.onKeyEvent(event), {
            capture: true,
            passive: true,
        });
        this.node.append(this.canvas);

        const gl = this.canvas.getContext("webgl2");
        if (gl === null) {
            throw new Error("WebGL2 is not supported");
        }
        this.context = gl;

        // --------------------------------------------------------------------------------------------------------
        // Set up the first render pass.

        // We'll be rendering the raw screen to a texture, so create that texture first.
        this.rawScreenTexture = gl.createTexture() as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, this.rawScreenTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, TRS80_CRT_PIXEL_WIDTH, TRS80_CRT_PIXEL_HEIGHT,
            0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Create and bind the framebuffer we'll be drawing into.
        this.fb = gl.createFramebuffer() as WebGLFramebuffer;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.rawScreenTexture, 0);

        // Create our program.
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
        const fragmentShader1 = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER1_SOURCE);
        this.program1 = createProgram(gl, vertexShader, fragmentShader1);

        // Create the vertex array for the raw screen texture.
        this.vao1 = gl.createVertexArray() as WebGLVertexArrayObject;
        gl.bindVertexArray(this.vao1);

        const vertices = [
            -1, -1, 0, 1, // Lower left
            1, -1, 0, 1,  // Lower right
            -1, 1, 0, 1,  // Upper left
            1, 1, 0, 1,   // Upper right
        ];
        const vertexBuffer1 = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer1);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        const positionAttributeLocation = gl.getAttribLocation(this.program1, "a_position");
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.vertexAttribPointer(positionAttributeLocation, 4, gl.FLOAT, false, 0, 0);

        const texCoord1 = [
            0, 0,                                           // Upper left
            TRS80_CRT_PIXEL_WIDTH, 0,                       // Upper right
            0, TRS80_CRT_PIXEL_HEIGHT,                      // Lower left
            TRS80_CRT_PIXEL_WIDTH, TRS80_CRT_PIXEL_HEIGHT,  // Lower right
        ];
        const texCoordBuffer1 = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer1);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoord1), gl.STATIC_DRAW);
        const texcoordAttributeLocation = gl.getAttribLocation(this.program1, "a_texcoord");
        gl.enableVertexAttribArray(texcoordAttributeLocation);
        gl.vertexAttribPointer(texcoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

        // Make the font texture.
        this.fontTexture = gl.createTexture() as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256 * 8, 24, 0,
            gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(MODEL3_FONT.makeFontSheet()));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Make the memory texture.
        this.memoryTexture = gl.createTexture() as WebGLTexture;
        gl.bindTexture(gl.TEXTURE_2D, this.memoryTexture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, this.memory.length, 1, 0,
            gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.memory);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // --------------------------------------------------------------------------------------------------------
        // Set up the second render pass.

        // Create our program.
        const fragmentShader2 = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER2_SOURCE);
        this.program2 = createProgram(gl, vertexShader, fragmentShader2);

        // Create the vertex array for the raw screen texture.
        this.vao2 = gl.createVertexArray() as WebGLVertexArrayObject;
        gl.bindVertexArray(this.vao2);

        const vertexBuffer2 = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.vertexAttribPointer(positionAttributeLocation, 4, gl.FLOAT, false, 0, 0);

        const texCoord2 = [
            0, this.canvas.height,                      // Lower left
            this.canvas.width, this.canvas.height,      // Lower right
            0, 0,                                       // Upper left
            this.canvas.width, 0,                       // Upper right
        ];
        const texCoordBuffer2 = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoord2), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(texcoordAttributeLocation);
        gl.vertexAttribPointer(texcoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

        this.updateFromConfig();

        this.scheduleRefresh();
    }

    didAttachToFlipCard(flipCard: FlipCard): void {
        this.flipCard = flipCard;
    }

    willDetachFromFlipCard(): void {
        this.flipCard = undefined;
    }

    /**
     * Update the overlay options.
     */
    public setOverlayOptions(userOptions: OverlayOptions): void {
        // Fill in defaults.
        const options: Required<OverlayOptions> = {
            ... DEFAULT_OVERLAY_OPTIONS,
            ... userOptions
        };
        if (overlayOptionsEqual(options, this.overlayOptions)) {
            return;
        }
        this.overlayOptions = options;

        const showSelection = options.showSelection && !options.selection.isEmpty();
        const showOverlay = options.showPixelGrid || options.showCharGrid ||
            options.showHighlight !== undefined || options.showCursor || showSelection;
        if (showOverlay) {
            const width = this.canvas.width;
            const height = this.canvas.height;
            const gridWidth = width - 2*this.padding;
            const gridHeight = height - 2*this.padding;

            // Create overlay canvas if necessary.
            let overlayCanvas = this.overlayCanvas;
            if (overlayCanvas === undefined) {
                overlayCanvas = document.createElement("canvas");
                overlayCanvas.style.position = "absolute";
                overlayCanvas.style.top = "0";
                overlayCanvas.style.left = "0";
                overlayCanvas.style.pointerEvents = "none";
                overlayCanvas.width = width;
                overlayCanvas.height = height;
                this.node.append(overlayCanvas);

                this.overlayCanvas = overlayCanvas;
            }

            // Whether to highlight a grid line.
            function isHighlighted(showHighlight: boolean, highlightValue: number, value: number): boolean {
                return showHighlight && (highlightValue === value || highlightValue + 1 === value);
            }

            // Clear the overlay.
            const ctx = overlayCanvas.getContext("2d") as CanvasRenderingContext2D;
            ctx.save();
            ctx.clearRect(0, 0, width, height);
            ctx.translate(this.padding, this.padding);

            // Draw columns.
            for (let i = 0; i <= TRS80_PIXEL_WIDTH; i++) {
                const highlighted = isHighlighted(options.showHighlight, options.highlightPixelColumn, i);
                const isCharLine = options.showCharGrid && i % TRS80_CHAR_PIXEL_WIDTH === 0;
                if (highlighted || options.showPixelGrid || isCharLine) {
                    const x = Math.round(i * 4 * this.scale);
                    ctx.lineWidth = isCharLine && !highlighted ? 2 : 1;
                    ctx.strokeStyle = highlighted ? GRID_HIGHLIGHT_COLOR : GRID_COLOR;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, gridHeight);
                    ctx.stroke();
                }
            }

            // Draw rows.
            for (let i = 0; i <= TRS80_PIXEL_HEIGHT; i++) {
                const highlighted = isHighlighted(options.showHighlight, options.highlightPixelRow, i);
                const isCharLine = options.showCharGrid && i % TRS80_CHAR_PIXEL_HEIGHT === 0;
                if (highlighted || options.showPixelGrid || isCharLine) {
                    const y = Math.round(i * 8 * this.scale);
                    ctx.lineWidth = isCharLine && !highlighted ? 2 : 1;
                    ctx.strokeStyle = highlighted ? GRID_HIGHLIGHT_COLOR : GRID_COLOR;
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(gridWidth, y);
                    ctx.stroke();
                }
            }

            // Draw cursor.
            if (options.showCursor && options.cursorPosition >= 0 && options.cursorPosition < TRS80_SCREEN_SIZE) {
                const x = options.cursorPosition % TRS80_CHAR_WIDTH;
                const y = Math.floor(options.cursorPosition / TRS80_CHAR_WIDTH);

                ctx.fillStyle = GRID_HIGHLIGHT_COLOR;
                ctx.fillRect(x * 8 * this.scale, y * 24 * this.scale,
                    8 * this.scale, 24 * this.scale);
            }

            // Draw selection.
            if (showSelection) {
                const x1 = options.selection.x1*4*this.scale;
                const y1 = options.selection.y1*8*this.scale;
                const x2 = options.selection.x2*4*this.scale;
                const y2 = options.selection.y2*8*this.scale;
                const dash = 5;
                ctx.save();
                ctx.setLineDash([dash, dash]);
                for (let pass = 0; pass < 2; pass++) {
                    ctx.lineDashOffset = options.selectionAntsOffset + pass*dash;
                    ctx.strokeStyle = pass == 0 ? "black" : "white";
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y1);
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x1, y2);
                    ctx.moveTo(x1, y2);
                    ctx.lineTo(x2, y2);
                    ctx.moveTo(x2, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
            }
            ctx.restore();
        } else {
            // Remove overlay.
            if (this.overlayCanvas !== undefined) {
                this.overlayCanvas.remove();
                this.overlayCanvas = undefined;
            }
        }
    }

    /**
     * Width of the entire screen, including margins.
     */
    public getWidth(): number {
        return this.width;
    }

    /**
     * Height of the entire screen, including margins.
     */
    public getHeight(): number {
        return this.height;
    }

    setConfig(config: Config): void {
        this.config = config;
        this.updateFromConfig();
    }

    /**
     * Send a new mouse event to listeners.
     */
    private emitMouseActivity(type: ScreenMouseEventType, event: MouseEvent, shiftKey: boolean): void {
        const x = event.offsetX - this.padding;
        const y = event.offsetY - this.padding;
        const pixelX = Math.min(TRS80_PIXEL_WIDTH - 1, Math.max(0, Math.floor(x / this.scale / 4)));
        const pixelY = Math.min(TRS80_PIXEL_HEIGHT - 1, Math.max(0, Math.floor(y / this.scale / 8)));
        const position = new ScreenMousePosition(pixelX, pixelY);
        this.mouseActivity.dispatch(new ScreenMouseEvent(type, position, shiftKey));
    }

    /**
     * Handle a new mouse event.
     */
    private onMouseEvent(type: ScreenMouseEventType, event: MouseEvent): void {
        if (type === "mousemove" &&
            this.lastMouseEvent !== undefined &&
            (this.lastMouseEvent.buttons & 1) !== 0 &&
            (event.buttons & 1) === 0) {

            // Mouse was release since the last event, probably outside the canvas or window.
            // Fake a mouse up event.
            this.emitMouseActivity("mouseup", event, event.shiftKey);
        }
        this.lastMouseEvent = event;
        this.emitMouseActivity(type, event, event.shiftKey);
    }

    /**
     * Handle a new keyboard events. Only shift keys really matter.
     */
    private onKeyEvent(event: KeyboardEvent): void {
        if (this.lastMouseEvent !== undefined) {
            this.emitMouseActivity("mousemove", this.lastMouseEvent, event.shiftKey);
        }
    }

    /**
     * Update the font and screen from the config and other state.
     */
    private updateFromConfig(): void {
        let font;
        switch (this.config.cgChip) {
            case CGChip.ORIGINAL:
                font = MODEL1A_FONT;
                break;
            case CGChip.LOWER_CASE:
            default:
                switch (this.config.modelType) {
                    case ModelType.MODEL1:
                        font = MODEL1B_FONT;
                        break;
                    case ModelType.MODEL3:
                    case ModelType.MODEL4:
                    default:
                        font = this.isAlternateCharacters() ? MODEL3_ALT_FONT : MODEL3_FONT;
                        break;
                }
                break;
        }

        const glyphOptions: GlyphOptions = {
            color: phosphorToRgb(this.config.phosphor),
            scanLines: this.config.scanLines === ScanLines.ON,
        };
        for (let i = 0; i < 256; i++) {
            this.glyphs[i] = font.makeImage(i, this.isExpandedCharacters(), glyphOptions);
        }
        this.glyphWidth = font.width;

        this.drawBackground();
        this.refresh();
    }

    writeChar(address: number, value: number): void {
        const offset = address - TRS80_SCREEN_BEGIN;
        this.memory[offset] = value;
        this.drawChar(offset, value);
        this.needRedraw = true;
    }

    public getForegroundColor(): string {
        const color = phosphorToRgb(this.config.phosphor);
        return "#" + toHexByte(color[0]) + toHexByte(color[1]) + toHexByte(color[2]);
    }

    /**
     * Get the background color as a CSS color based on the current config.
     */
    public getBackgroundColor(): string {
        switch (this.config.background) {
            case Background.BLACK:
                return BLACK_BACKGROUND;

            case Background.AUTHENTIC:
            default:
                return AUTHENTIC_BACKGROUND;
        }
    }

    /**
     * The border radius of the screen, in pixels ("px" units).
     */
    public getBorderRadius(): number {
        return BORDER_RADIUS*this.scale;
    }

    /**
     * Draw a single character to the canvas.
     */
    private drawChar(offset: number, value: number): void {
        const screenX = (offset % 64)*8*this.scale + this.padding;
        const screenY = Math.floor(offset / 64)*24*this.scale + this.padding;

        /*
        this.context.fillStyle = this.getBackgroundColor();

        if (this.isExpandedCharacters()) {
            if (offset % 2 === 0) {
                this.context.fillRect(screenX, screenY, 16*this.scale, 24*this.scale);
                this.context.drawImage(this.glyphs[value], 0, 0, this.glyphWidth * 2, 24,
                    screenX, screenY, 16*this.scale, 24*this.scale);
            }
        } else {
            this.context.fillRect(screenX, screenY, 8*this.scale, 24*this.scale);
            this.context.drawImage(this.glyphs[value], 0, 0, this.glyphWidth, 24,
                screenX, screenY, 8*this.scale, 24*this.scale);
        }*/
    }

    getNode(): HTMLElement {
        return this.node;
    }

    setExpandedCharacters(expanded: boolean): void {
        if (expanded !== this.isExpandedCharacters()) {
            super.setExpandedCharacters(expanded);
            this.updateFromConfig();
        }
    }

    setAlternateCharacters(alternate: boolean): void {
        if (alternate !== this.isAlternateCharacters()) {
            super.setAlternateCharacters(alternate);
            this.updateFromConfig();
        }
    }

    private configureGl(): void {
    }

    /**
     * Draw the background of the canvas.
     */
    private drawBackground(): void {
        /*
        const ctx = this.context;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const radius = this.getBorderRadius();

        ctx.fillStyle = this.getBackgroundColor();
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.arcTo(width, 0, width, radius, radius);
        ctx.arcTo(width, height, width - radius, height, radius);
        ctx.arcTo(0, height, 0, height - radius, radius);
        ctx.arcTo(0, 0, radius, 0, radius);
        ctx.fill();

         */
    }

    private scheduleRefresh(): void {
        window.requestAnimationFrame(() => {
            if (this.needRedraw) {
                this.needRedraw = false;
                this.refresh();
            }
            if (this.getNode().parentNode !== null) {
                this.scheduleRefresh();
            }
        });
    }

    /**
     * Refresh the display based on what we've kept track of.
     */
    private refresh(): void {
        const gl = this.context;

        // --------------------------------------------------------------------------------------------------------
        // First render pass.

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
        gl.viewport(0, 0, TRS80_CRT_PIXEL_WIDTH, TRS80_CRT_PIXEL_HEIGHT);
        gl.useProgram(this.program1);

        // Assign textures to texture units.
        const fontTextureLocation = gl.getUniformLocation(this.program1, "u_fontTexture") as WebGLUniformLocation;
        const memoryTextureLocation = gl.getUniformLocation(this.program1, "u_memoryTexture") as WebGLUniformLocation;
        gl.uniform1i(fontTextureLocation, 0);
        gl.uniform1i(memoryTextureLocation, 1);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.memoryTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.memory.length, 1,
            gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.memory);

        // Flat rectangle to draw on.
        gl.bindVertexArray(this.vao1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // --------------------------------------------------------------------------------------------------------
        // Second render pass.

        // Okay now we have our raw screen texture. Give it to our glitz renderer.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(this.program2);

        // Assign textures to texture units.
        const rawScreenTextureLocation = gl.getUniformLocation(this.program1, "u_rawScreenTexture") as WebGLUniformLocation;
        gl.uniform1i(rawScreenTextureLocation, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.rawScreenTexture);

        // Flat rectangle to draw on.
        gl.bindVertexArray(this.vao2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Background.
        const bg = this.getBackgroundColor();
        const red = parseInt(bg.substring(1, 3), 16)/255;
        const green = parseInt(bg.substring(3, 5), 16)/255;
        const blue = parseInt(bg.substring(5, 7), 16)/255;
    }

    /**
     * Returns the canvas as an <img> element that can be resized. This is relatively
     * expensive.
     *
     * This method is deprecated, use asImageAsync instead.
     */
    public asImage(): HTMLImageElement {
        const image = document.createElement("img");
        image.src = this.canvas.toDataURL();
        return image;
    }

    /**
     * Returns the canvas as an <img> element that can be resized. Despite the
     * "async" name, there's still some synchronous work, about 13ms.
     */
    public asImageAsync(): Promise<HTMLImageElement> {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            // According to this answer:
            //     https://stackoverflow.com/a/59025746/211234
            // the toBlob() method still has to copy the image synchronously, so this whole method still
            // takes about 13ms. It's better than toDataUrl() because it doesn't have to make an actual
            // base64 string. The Object URL is just a reference to the blob.
            this.canvas.toBlob(blob => {
                if (blob === null) {
                    reject("Cannot make image from screen");
                } else {
                    const image = document.createElement("img");
                    const url = URL.createObjectURL(blob);
                    image.addEventListener("load", () => {
                        URL.revokeObjectURL(url);
                        // Resolve when the image is fully loaded so that there's no UI glitching.
                        resolve(image);
                    });
                    image.src = url;
                }
            });
        });
    }

    /**
     * Make a canvas from the sub-rectangle section.
     */
    public makeSelectionCanvas(selection: Selection): HTMLCanvasElement {
        const canvas = document.createElement("canvas");
        canvas.width = selection.width*4*this.scale;
        canvas.height = selection.height*8*this.scale;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        ctx.drawImage(this.canvas,
            selection.x1*4*this.scale + this.padding, selection.y1*8*this.scale + this.padding,
            selection.width*4*this.scale, selection.height*8*this.scale,
            0, 0,
            selection.width*4*this.scale, selection.height*8*this.scale);

        return canvas;
    }
}
