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
import {g_amber_blue, g_amber_green, g_amber_red} from "./amber.js";
import {g_p4_blue, g_p4_green, g_p4_red} from "./p4.js";
import {g_green1_blue, g_green1_green, g_green1_red} from "./green1";
import {g_green2_blue, g_green2_green, g_green2_red} from "./green2";

const TIME_RENDERING = false;
const SHOW_REFLECTION = true;

const DEMO_MODE_ENABLED = true;
enum DemoMode {
    OFF,

    CRT_CURVATURE,
    SCANLINES,
    PIXEL_BLUR,
    PHOSPHOR,
    SCANLINE_BLOOM,
    HALATION,
    BLACKPOINT,
    VIGNETTE,
    REFLECTION,

    ZOOM,
    ALL,
}

const TRS80_CHAR_CRT_PIXEL_WIDTH = 8;
const TRS80_CHAR_CRT_PIXEL_HEIGHT = 24;
const TRS80_CRT_PIXEL_WIDTH = TRS80_CHAR_WIDTH*TRS80_CHAR_CRT_PIXEL_WIDTH;
const TRS80_CRT_PIXEL_HEIGHT = TRS80_CHAR_HEIGHT*TRS80_CHAR_CRT_PIXEL_HEIGHT;

export const AUTHENTIC_BACKGROUND = "#334843";
export const BLACK_BACKGROUND = "#000000";

const PADDING = 30;
const BORDER_RADIUS = 8;

const WHITE_PHOSPHOR = [230, 231, 252];
const AMBER_PHOSPHOR = [247, 190, 64];
const GREEN_PHOSPHOR = [122, 244, 96];

const DEFAULT_CRT_CURVATURE = 0.06;
const DEFAULT_SCANLINES = 1;
const DEFAULT_SCANLINE_BLOOM = 0.55;
const DEFAULT_PHOSPHOR = 1;
const DEFAULT_HALATION = 0.4;
const DEFAULT_BLACKPOINT = 0.06;
const DEFAULT_VIGNETTE = 0.12;
const DEFAULT_REFLECTION = 0.10;
const DEFAULT_ZOOM = 1;
const ZOOM_POINTS = [
    [0.5, 0.5],
    [0.2, 0.2],
];

// Modifier keys required for demo mode.
function demoModifierKeys(event: KeyboardEvent | MouseEvent): boolean {
    return event.shiftKey && event.ctrlKey && !event.metaKey && !event.altKey;
}

// Clamp value to min and max.
function clamp(min: number, value: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

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

const DRAW_CHARS_FRAGMENT_SHADER_SOURCE = `#version 300 es
 
precision highp float;
precision highp usampler2D;

uniform sampler2D u_fontTexture;
uniform ivec2 u_fontTextureSize;
uniform usampler2D u_memoryTexture;
uniform ivec2 u_memoryTextureSize;
in vec2 v_texcoord;
out vec4 outColor;

const ivec2 g_charSize = ivec2(${TRS80_CHAR_WIDTH}, ${TRS80_CHAR_HEIGHT});
const ivec2 g_charCrtPixelSize = ivec2(${TRS80_CHAR_CRT_PIXEL_WIDTH}, ${TRS80_CHAR_CRT_PIXEL_HEIGHT});

void main() {
    // Integer texel coordinate.
    ivec2 t = ivec2(floor(v_texcoord));

    // Remove black border.
    t -= 1;

    // Character position.
    ivec2 c = ivec2(floor(vec2(t)/vec2(g_charCrtPixelSize)));

    if (c.x >= 0 && c.x < g_charSize.x && c.y >= 0 && c.y < g_charSize.y) {
        // Character sub-position.
        ivec2 s = t % g_charCrtPixelSize;

        // Character to draw.
        vec2 memoryCoord = vec2(ivec2(c.x, g_charSize.y - 1 - c.y))/vec2(u_memoryTextureSize);
        int ch = int(texture(u_memoryTexture, memoryCoord).r);

        // Where to look in the font texture.
        vec2 fontCoord = vec2(ch*g_charCrtPixelSize.x + s.x, g_charCrtPixelSize.y - 1 - s.y)/vec2(u_fontTextureSize);
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

const RENDER_SCREEN_FRAGMENT_SHADER_SOURCE = `#version 300 es
 
precision highp float;
precision highp usampler2D;

uniform sampler2D u_inputTexture;
uniform ivec2 u_inputTextureSize;
uniform float u_time; // Seconds.
uniform float u_scale;
uniform float u_crtCurvature; // 0-
uniform float u_scanlines; // 0-1
uniform float u_scanlineBloom; // 0-
in vec2 v_texcoord;
out vec4 outColor;

const ivec2 g_charSize = ivec2(${TRS80_CHAR_WIDTH}, ${TRS80_CHAR_HEIGHT});
const ivec2 g_charCrtPixelSize = ivec2(${TRS80_CHAR_CRT_PIXEL_WIDTH}, ${TRS80_CHAR_CRT_PIXEL_HEIGHT});
const vec2 g_size = vec2(g_charSize*g_charCrtPixelSize);
const float g_padding = ${PADDING}.0;
const float g_radius = ${BORDER_RADIUS}.0;
const float PI = ${Math.PI};
const float SCANLINE_WIDTH = 0.2;

void main() {
    // Modulator, for testing.
    float modulation = (-cos(u_time) + 1.0)/2.0;

    // Unscaled.
    vec2 p = v_texcoord/u_scale;

    // Text area.
    vec2 t = p - g_padding;
    
    // CRT curvature.
    vec2 middle = g_size/2.0;
    t = t - middle;
    float r2 = 4.0*dot(t, t)/dot(g_size, g_size);
    float r4 = r2*r2;
    float mult = 1.0 + u_crtCurvature*r2 + u_crtCurvature*r4;
    t = middle + t*mult;

    // Scanline.
    float scanline = pow(abs(sin(t.y*PI/2.0)), 1.0/SCANLINE_WIDTH);
    scanline = (1.0 - u_scanlines) + u_scanlines*scanline;

    float brightness = t.x >= -1.0 && t.y >= -1.0 && t.x < g_size.x + 1.0 && t.y < g_size.y + 1.0
        ? texture(u_inputTexture, (t + 1.0)/vec2(u_inputTextureSize)).r
        : 0.0;

    // Scanline bloom.
    if (u_scanlineBloom > 0.0 && brightness > 0.5) {
        scanline += u_scanlineBloom*(1.0 - scanline)*(brightness - 0.5)/0.5;
    }

    float c = brightness*scanline;
    outColor = vec4(c, c, c, 1.0);
}
`;

const BLUR_FRAGMENT_SHADER_SOURCE = `#version 300 es

precision highp float;
precision highp sampler2D;

uniform sampler2D u_inputTexture;
uniform ivec2 u_inputTextureSize;
uniform float u_sigma;
uniform float u_boost;
uniform bool u_vertical;
in vec2 v_texcoord;
out vec4 outColor;

void main() {
    if (u_sigma == 0.0) {
        vec2 uv = v_texcoord/vec2(u_inputTextureSize);
        outColor = texture(u_inputTexture, uv);
    } else {
        float radius = ceil(u_sigma*3.0);
        vec4 color = vec4(0.0, 0.0, 0.0, 0.0);
        float total = 0.0;
        vec2 delta = u_vertical ? vec2(0.0, 1.0) : vec2(1.0, 0.0);
        for (float dx = -radius; dx <= radius; dx++) {
            vec2 uv = (v_texcoord + delta*dx)/vec2(u_inputTextureSize);
            vec4 pixelColor = texture(u_inputTexture, uv);
            float coef = exp(-dx*dx/(2.0*u_sigma*u_sigma));
            color += pixelColor*coef;
            total += coef;
        }
        outColor = color / total * u_boost;
    }
}
`;

const COLOR_MAP_FRAGMENT_SHADER_SOURCE = `#version 300 es

precision highp float;
precision highp sampler2D;

uniform sampler2D u_inputTexture;
uniform ivec2 u_inputTextureSize;
uniform sampler2D u_halationTexture;
uniform sampler2D u_colorMapTexture;
uniform sampler2D u_cameraTexture;
uniform float u_zoom;
uniform vec2 u_zoomPoint;
uniform float u_halation;
uniform float u_blackpoint;
uniform float u_phosphor;
uniform float u_vignette;
uniform float u_crtCurvature;
uniform float u_reflection;
in vec2 v_texcoord;
out vec4 outColor;
const float RADIUS = 50.0;

vec2 curve(vec2 p, vec2 size, float curvature) {
    vec2 middle = size/2.0;
    p = p - middle;
    float r2 = 4.0*dot(p, p)/dot(size, size);
    float r4 = r2*r2;
    float mult = 1.0 + curvature*r2 + curvature*r4;
    return middle + p*mult;
}

float bezel(vec2 uv, vec2 size) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > size.x || uv.y > size.y) {
        return 0.0;
    }

    if (uv.x < RADIUS && uv.y < RADIUS) {
        vec2 p = vec2(RADIUS, RADIUS) - uv;
        if (dot(p, p) > RADIUS*RADIUS) {
            return 0.0;
        }
    } else if (uv.x > size.x - RADIUS && uv.y < RADIUS) {
        vec2 p = vec2(size.x - RADIUS, RADIUS) - uv;
        if (dot(p, p) > RADIUS*RADIUS) {
            return 0.0;
        }
    } else if (uv.x < RADIUS && uv.y > size.y - RADIUS) {
        vec2 p = vec2(RADIUS, size.y - RADIUS) - uv;
        if (dot(p, p) > RADIUS*RADIUS) {
            return 0.0;
        }
    } else if (uv.x > size.x - RADIUS && uv.y > size.y - RADIUS) {
        vec2 p = size - vec2(RADIUS, RADIUS) - uv;
        if (dot(p, p) > RADIUS*RADIUS) {
            return 0.0;
        }
    }
    
    return 1.0;
}

// uv = -0.5 to 0.5
float getCameraWarp(vec2 uv) {
    // Inches.
    float screenSize = 7.0;
    float R = 12.0;
    float D = 18.0;

    float dist = length(uv)*screenSize;
    float A = sqrt(R*R - dist*dist);
    float B = D + R - A;
    float alpha = atan(dist, A); 
    float beta = atan(dist, B);
    float gamma = 2.0*alpha + beta;
    return tan(gamma);
}

// uv = 0 to 1
vec2 getCameraUv(vec2 uv) {
    uv = uv - 0.5;
    float pt = getCameraWarp(uv);
    float edge = getCameraWarp(vec2(0.5, 0.5)); // TODO could do this outside, it's static.
    
    return normalize(uv)*pt/edge + 0.5;
}

float grid(vec2 uv, float count) {
    uv *= count;
    uv = mod(uv, 1.0);
    
    return uv.x < 0.1 || uv.y < 0.1 ? 1.0 : 0.0;
}

void main() {
    vec2 center = vec2(u_inputTextureSize)*u_zoomPoint;
    vec2 zoomedUv = (v_texcoord - center)/u_zoom + center;

    vec2 uv = zoomedUv/vec2(u_inputTextureSize);

    // Add halation.
    float brightness = max(texture(u_inputTexture, uv).r, texture(u_halationTexture, uv).r*u_halation);

    // Blackpoint adjustment.
    brightness += (1.0 - brightness)*u_blackpoint;

    // Map to color, including background.
    vec4 phosphorColor = texture(u_colorMapTexture, vec2(brightness, 0.5));
    if (u_phosphor == 1.0) {
        outColor = phosphorColor;
    } else {
        vec4 grayscale = vec4(brightness, brightness, brightness, 1.0);
        outColor = grayscale*(1.0 - u_phosphor) + phosphorColor*u_phosphor;
    }

    // Vignette.
    if (u_vignette > 0.0) {
        vec2 delta = uv - 0.5;
        float d = length(delta) / 0.7071;
        float c = cos(d * u_vignette * 3.14159);
        if (c < 0.0) {
            c = 0.0;
        }
        if (c > 1.0) {
            c = 1.0;
        }
        c = c*c;
        c = c*c;
        outColor.rgb *= c;
    }
    
    // Reflection.
    if (u_reflection > 0.0) {
        vec2 reflectionUv = getCameraUv(1.0 - uv);
        vec4 camera = texture(u_cameraTexture, reflectionUv);
        // camera = max(camera, grid(reflectionUv, 16.0));
        outColor.rgb = outColor.rgb*(1.0 - u_reflection) + camera.rgb*u_reflection;
    }

    // Anti-alias the bezel outline.
    vec2 size = vec2(u_inputTextureSize);
    float a = 0.0;
    for (int dx = -1; dx <= 1; dx++) {
        for (int dy = -1; dy <= 1; dy++) {
            a += bezel(curve(zoomedUv + vec2(dx, dy)/3.0, size, u_crtCurvature*1.5), size);
        }
    }
    outColor *= a/9.0;

    // To see the color map:
    // outColor = texture(u_colorMapTexture, vec2(uv.x, 0.5));
}
`;

/**
 * Create a WebGL shader from source. Throws on error.
 */
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

/**
 * Create a WebGL shader from a vertex and a fragment shader. Throws on error.
 */
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
 * Create an intermediate texture (8-bit RGBA) to use between render passes.
 */
function createIntermediateTexture(gl: WebGL2RenderingContext, width: number, height: number): SizedTexture {
    const texture = SizedTexture.create(gl, width, height);

    gl.bindTexture(gl.TEXTURE_2D, texture.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return texture;
}

/**
 * Convert three maps (256 entries -> 0..1) to a flattened RGBA (0..255) array for a color map.
 */
function makeColorMap(red: number[], green: number[], blue: number[], backgroundHex: string): Uint8Array {
    const bgFactor = 1;
    const bgRed = parseInt(backgroundHex.substring(1, 3), 16)/255*bgFactor;
    const bgGreen = parseInt(backgroundHex.substring(3, 5), 16)/255*bgFactor;
    const bgBlue = parseInt(backgroundHex.substring(5, 7), 16)/255*bgFactor;

    function blend(bg: number, fg: number): number {
        return Math.max(bg, fg);
    }

    return new Uint8Array(red.flatMap((_, i) => [
        Math.floor(blend(bgRed, red[i])*255.99),
        Math.floor(blend(bgGreen, green[i])*255.99),
        Math.floor(blend(bgBlue, blue[i])*255.99),
        255]));
}

/**
 * Make a texture that can be used as a phosphor lookup table.
 */
function makePhosphorTexture(gl: WebGL2RenderingContext, colorMap: Uint8Array): SizedTexture {
    const sizedTexture = SizedTexture.create(gl, 256, 1);

    gl.bindTexture(gl.TEXTURE_2D, sizedTexture.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sizedTexture.width, sizedTexture.height,
        0, gl.RGBA, gl.UNSIGNED_BYTE, colorMap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return sizedTexture;
}

/**
 * Gl Texture and its size.
 */
class SizedTexture {
    public constructor(public readonly width: number,
                       public readonly height: number,
                       public readonly texture: WebGLTexture) {

        // Nothing.
    }

    public static create(gl: WebGL2RenderingContext, width: number, height: number): SizedTexture {
        return new SizedTexture(width, height, gl.createTexture() as WebGLTexture);
    }
}

/**
 * Sized texture and the "in" name it has in the fragment shader.
 */
class NamedTexture {
    public constructor(public readonly name: string,
                       public texture: SizedTexture) {

        // Nothing.
    }

    public bind(gl: WebGL2RenderingContext, program: WebGLProgram, index: number): void {
        const location = gl.getUniformLocation(program, this.name);
        if (location === null) {
            throw new Error("Can't find texture variable \"" + this.name + "\"");
        }
        gl.uniform1i(location, index);
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, this.texture.texture);

        // Optional "...Size" ivec2.
        const sizeLocation = gl.getUniformLocation(program, this.name + "Size");
        if (sizeLocation !== null) {
            gl.uniform2i(sizeLocation, this.texture.width, this.texture.height);
        }
    }
}

class NamedVariable {
    public readonly values: number[];

    public constructor(public readonly name: string,
                       values: number[] | Int32Array,
                       private readonly optional = false) {

        // Make a copy so we can modify ours.
        this.values = [...values];
    }

    public bind(gl: WebGL2RenderingContext, program: WebGLProgram): void {
        const location = gl.getUniformLocation(program, this.name);
        if (location === null) {
            if (this.optional) {
                // Quietly ignore. This is for debug variables that might be optimized away if they're not used.
                return;
            } else {
                throw new Error("Can't find uniform variable \"" + this.name + "\"");
            }
        }
        if (this.values instanceof Int32Array) {
            switch (this.values.length) {
                case 1: gl.uniform1iv(location, this.values); break;
                case 2: gl.uniform2iv(location, this.values); break;
                case 3: gl.uniform3iv(location, this.values); break;
                case 4: gl.uniform4iv(location, this.values); break;
                default: throw new Error("Invalid number of values for uniform variable \"" + this.name + "\": " + this.values.length);
            }
        } else {
            switch (this.values.length) {
                case 1: gl.uniform1fv(location, this.values); break;
                case 2: gl.uniform2fv(location, this.values); break;
                case 3: gl.uniform3fv(location, this.values); break;
                case 4: gl.uniform4fv(location, this.values); break;
                default: throw new Error("Invalid number of values for uniform variable \"" + this.name + "\": " + this.values.length);
            }
        }
    }
}

class RenderPass {
    private readonly fb: WebGLFramebuffer | undefined;
    private readonly program: WebGLProgram;
    private readonly vao: WebGLVertexArrayObject;

    public constructor(private readonly gl: WebGL2RenderingContext,
                       fragmentSource: string,
                       private readonly namedTextures: NamedTexture[],
                       private readonly namedVariables: NamedVariable[],
                       private readonly output: SizedTexture | { width: number, height: number }) {

        if (this.output instanceof SizedTexture) {
            // Create and bind the framebuffer we'll be drawing into.
            this.fb = gl.createFramebuffer() as WebGLFramebuffer;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.output.texture, 0);
        } else {
            // Render to canvas.
            this.fb = undefined;
        }

        // Create our program.
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
        const fragmentShader1 = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
        this.program = createProgram(gl, vertexShader, fragmentShader1);

        // Create the vertex array for the raw screen texture.
        this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
        gl.bindVertexArray(this.vao);

        // Vertex coordinates.
        const vertices = [
            -1, -1, 0, 1, // Lower left
            1, -1, 0, 1,  // Lower right
            -1, 1, 0, 1,  // Upper left
            1, 1, 0, 1,   // Upper right
        ];
        const vertexBuffer = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        const positionAttributeLocation = gl.getAttribLocation(this.program, "a_position");
        gl.enableVertexAttribArray(positionAttributeLocation);
        gl.vertexAttribPointer(positionAttributeLocation, 4, gl.FLOAT, false, 0, 0);

        // Texture coordinates.
        const texcoord = [
            0, 0,                           // Lower left
            output.width, 0,                // Lower right
            0, output.height,               // Upper left
            output.width, output.height,    // Upper right
        ];
        const texcoordBuffer = gl.createBuffer() as WebGLBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoord), gl.STATIC_DRAW);
        const texcoordAttributeLocation = gl.getAttribLocation(this.program, "a_texcoord");
        gl.enableVertexAttribArray(texcoordAttributeLocation);
        gl.vertexAttribPointer(texcoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    }

    public render() {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb ?? null);
        gl.viewport(0, 0, this.output.width, this.output.height);
        gl.useProgram(this.program);

        // Assign textures to texture units.
        for (let i = 0; i < this.namedTextures.length; i++) {
            this.namedTextures[i].bind(gl, this.program, i);
        }

        // Assign the uniform variables.
        for (const namedVariable of this.namedVariables) {
            namedVariable.bind(gl, this.program);
        }

        // Flat rectangle to draw on.
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
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
    private readonly camera: HTMLVideoElement;
    private readonly renderPasses: RenderPass[];
    private readonly memoryTexture: SizedTexture;
    private readonly cameraTexture: SizedTexture;
    private readonly phosphors: SizedTexture[];
    private readonly colorMapNamedTexture: NamedTexture;
    private readonly time: NamedVariable;
    private readonly startTime: number;
    private readonly memory: Uint8Array = new Uint8Array(TRS80_SCREEN_SIZE);
    private readonly glyphs: HTMLCanvasElement[] = [];
    public readonly mouseActivity = new SimpleEventDispatcher<ScreenMouseEvent>();
    private readonly pixelHorizontalBlurMax: number;
    private readonly pixelVerticalBlurMax: number;
    private readonly crtCurvature: NamedVariable;
    private readonly scanlines: NamedVariable;
    private readonly scanlineBloom: NamedVariable;
    private readonly pixelHorizontalBlur: NamedVariable;
    private readonly pixelVerticalBlur: NamedVariable;
    private readonly phosphor: NamedVariable;
    private readonly halation: NamedVariable;
    private readonly blackpoint: NamedVariable;
    private readonly vignette: NamedVariable;
    private readonly reflection: NamedVariable;
    private readonly zoom: NamedVariable;
    private readonly zoomPoint: NamedVariable;
    private flipCard: FlipCard | undefined = undefined;
    private lastMouseEvent: MouseEvent | undefined = undefined;
    private needRedraw = true;
    private config: Config = Config.makeDefault();
    private glyphWidth = 0;
    private overlayCanvas: HTMLCanvasElement | undefined = undefined;
    private overlayOptions: FullOverlayOptions = DEFAULT_OVERLAY_OPTIONS;
    private demoMode = DemoMode.OFF;
    private zoomPointIndex = 0;

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
        this.canvas.width = this.width * devicePixelRatio;
        this.canvas.height = this.height * devicePixelRatio;
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

        this.camera = document.createElement("video");
        if (SHOW_REFLECTION) {
            this.camera.style.display = "none";
            this.camera.style.width = "512px";
            this.camera.style.height = "512px";
            this.camera.controls = true;
            this.camera.playsInline = true; // Examples use empty string for iOS.
            this.camera.crossOrigin = "anonymous";
            document.body.append(this.camera);

            navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
            }).then(
                stream => this.camera.srcObject = stream,
                error => console.log(error));

            // Shouldn't have to click, but browser (sometimes) requires it to allow play().
            this.node.addEventListener("click", async () => {
                await this.camera.play();
            });
        }

        const gl = this.canvas.getContext("webgl2");
        if (gl === null) {
            throw new Error("WebGL2 is not supported");
        }

        // Textures to pass between rendering passes.
        // Add a 1-pixel black border to help with antialiasing.
        const rawWidth = TRS80_CRT_PIXEL_WIDTH + 2;
        const rawHeight = TRS80_CRT_PIXEL_HEIGHT + 2;
        const rawScreenTexture = createIntermediateTexture(gl, rawWidth, rawHeight);
        const renderedTexture = createIntermediateTexture(gl, this.canvas.width, this.canvas.height);
        const horizontallyBlurredTexture = createIntermediateTexture(gl, this.canvas.width, this.canvas.height);
        const blurredTexture = createIntermediateTexture(gl, this.canvas.width, this.canvas.height);
        const halationTexture = createIntermediateTexture(gl, this.canvas.width, this.canvas.height);
        const horizontallyBlurredReflectionTexture = createIntermediateTexture(gl, 512, 512);
        const blurredReflectionTexture = createIntermediateTexture(gl, 512, 512);

        // Make the font texture.
        const fontTexture = SizedTexture.create(gl, 256 * 8, 24);
        gl.bindTexture(gl.TEXTURE_2D, fontTexture.texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, fontTexture.width, fontTexture.height, 0,
            gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(MODEL3_FONT.makeFontSheet()));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Make the memory texture.
        this.memoryTexture = SizedTexture.create(gl, TRS80_CHAR_WIDTH, TRS80_CHAR_HEIGHT);
        gl.bindTexture(gl.TEXTURE_2D, this.memoryTexture.texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, this.memoryTexture.width, this.memoryTexture.height, 0,
            gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.memory);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Make the camera texture.
        this.cameraTexture = SizedTexture.create(gl, 512, 512);
        gl.bindTexture(gl.TEXTURE_2D, this.cameraTexture.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.cameraTexture.width, this.cameraTexture.height, 0,
            gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Make the phosphor textures.
        this.phosphors = [
            makePhosphorTexture(gl, makeColorMap(g_p4_red, g_p4_green, g_p4_blue, AUTHENTIC_BACKGROUND)),
            makePhosphorTexture(gl, makeColorMap(g_amber_red, g_amber_green, g_amber_blue, BLACK_BACKGROUND)),
            makePhosphorTexture(gl, makeColorMap(g_green1_red, g_green1_green, g_green1_blue, BLACK_BACKGROUND)),
            makePhosphorTexture(gl, makeColorMap(g_green2_red, g_green2_green, g_green2_blue, BLACK_BACKGROUND)),
        ];
        this.colorMapNamedTexture = new NamedTexture("u_colorMapTexture", this.phosphors[0]);

        // In fractions of an original (CRT) pixel.
        const HORIZONTAL_BLUR = 0.72;
        const VERTICAL_BLUR = 0.20;
        const HALATION_BLUR = 1.5;
        const REFLECTION_BLUR = 3;

        this.pixelHorizontalBlurMax = HORIZONTAL_BLUR * devicePixelRatio * scale;
        this.pixelVerticalBlurMax = VERTICAL_BLUR * devicePixelRatio * scale;

        this.time = new NamedVariable("u_time", [0], true);
        this.crtCurvature = new NamedVariable("u_crtCurvature", [DEFAULT_CRT_CURVATURE]);
        this.scanlines = new NamedVariable("u_scanlines", [DEFAULT_SCANLINES]);
        this.scanlineBloom = new NamedVariable("u_scanlineBloom", [DEFAULT_SCANLINE_BLOOM]);
        this.pixelHorizontalBlur = new NamedVariable("u_sigma", [this.pixelHorizontalBlurMax]);
        this.pixelVerticalBlur = new NamedVariable("u_sigma", [this.pixelVerticalBlurMax]);
        this.phosphor = new NamedVariable("u_phosphor", [DEFAULT_PHOSPHOR]);
        this.halation = new NamedVariable("u_halation", [DEFAULT_HALATION]);
        this.blackpoint = new NamedVariable("u_blackpoint", [DEFAULT_BLACKPOINT]);
        this.vignette = new NamedVariable("u_vignette", [DEFAULT_VIGNETTE]);
        this.reflection = new NamedVariable("u_reflection", [DEFAULT_REFLECTION]);
        this.zoom = new NamedVariable("u_zoom", [DEFAULT_ZOOM]);
        this.zoomPoint = new NamedVariable("u_zoomPoint", ZOOM_POINTS[0]);
        this.startTime = Date.now() / 1000;
        this.renderPasses = [
            // Renders video memory (64x16 chars) to a simple on/off pixel grid (with one-pixel padding).
            new RenderPass(gl, DRAW_CHARS_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_fontTexture", fontTexture),
                new NamedTexture("u_memoryTexture", this.memoryTexture),
            ], [], rawScreenTexture),

            // Curvature, scanlines, and scanline bloom.
            new RenderPass(gl, RENDER_SCREEN_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", rawScreenTexture),
            ], [
                this.time,
                new NamedVariable("u_scale", [devicePixelRatio * scale]),
                this.crtCurvature,
                this.scanlines,
                this.scanlineBloom,
            ], renderedTexture),

            // Scale up and horizontally blur the rendered screen.
            new RenderPass(gl, BLUR_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", renderedTexture),
            ], [
                this.pixelHorizontalBlur,
                new NamedVariable("u_boost", [1.0 + 0.5*this.scanlines.values[0]]),
                new NamedVariable("u_vertical", new Int32Array([0])),
            ], horizontallyBlurredTexture),

            // Vertically blur the rendered screen.
            new RenderPass(gl, BLUR_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", horizontallyBlurredTexture),
            ], [
                this.pixelVerticalBlur,
                new NamedVariable("u_boost", [1.0 + 0.5*this.scanlines.values[0]]),
                new NamedVariable("u_vertical", new Int32Array([1])),
            ], blurredTexture),

            // Horizontally blur for halation.
            new RenderPass(gl, BLUR_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", blurredTexture),
            ], [
                new NamedVariable("u_sigma", [HALATION_BLUR * devicePixelRatio * scale]),
                new NamedVariable("u_boost", [1.0 + 0.5*this.scanlines.values[0]]),
                new NamedVariable("u_vertical", new Int32Array([0])),
            ], horizontallyBlurredTexture),

            // Vertically blur for halation.
            new RenderPass(gl, BLUR_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", horizontallyBlurredTexture),
            ], [
                new NamedVariable("u_sigma", [HALATION_BLUR * devicePixelRatio * scale]),
                new NamedVariable("u_boost", [1.0 + 0.5*this.scanlines.values[0]]),
                new NamedVariable("u_vertical", new Int32Array([1])),
            ], halationTexture),

            // Horizontally blur camera reflection.
            new RenderPass(gl, BLUR_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", this.cameraTexture),
            ], [
                new NamedVariable("u_sigma", [REFLECTION_BLUR]),
                new NamedVariable("u_boost", [1.0]),
                new NamedVariable("u_vertical", new Int32Array([0])),
            ], horizontallyBlurredReflectionTexture),

            // Vertically blur camera reflection.
            new RenderPass(gl, BLUR_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", horizontallyBlurredReflectionTexture),
            ], [
                new NamedVariable("u_sigma", [REFLECTION_BLUR]),
                new NamedVariable("u_boost", [1.0]),
                new NamedVariable("u_vertical", new Int32Array([1])),
            ], blurredReflectionTexture),

            // Halation, phosphor color, vignette, bezel.
            new RenderPass(gl, COLOR_MAP_FRAGMENT_SHADER_SOURCE, [
                new NamedTexture("u_inputTexture", blurredTexture),
                new NamedTexture("u_halationTexture", halationTexture),
                this.colorMapNamedTexture,
                new NamedTexture("u_cameraTexture", blurredReflectionTexture),
            ], [
                this.zoom,
                this.zoomPoint,
                this.phosphor,
                this.halation,
                this.blackpoint,
                this.vignette,
                this.reflection,
                this.crtCurvature,
            ], {width: this.canvas.width, height: this.canvas.height}),
        ];

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

        if (DEMO_MODE_ENABLED && type === "mousemove" && demoModifierKeys(event)) {
            const devicePixelRatio = window.devicePixelRatio ?? 1;
            const value = Math.max((1 - devicePixelRatio*event.offsetY/this.canvas.height)*1.5, 0);
            this.setDemoModeParameter(this.demoMode, value);
        }
    }

    /**
     * Handle a new keyboard events.
     */
    private onKeyEvent(event: KeyboardEvent): void {
        if (this.lastMouseEvent !== undefined) {
            // Only shift keys really matter.
            this.emitMouseActivity("mousemove", this.lastMouseEvent, event.shiftKey);
        }

        if (DEMO_MODE_ENABLED && event.type === "keydown" && demoModifierKeys(event)) {
            if (event.key === "A") {
                this.demoMode = DemoMode.ALL;
            } else if (event.key === "Z") {
                if (this.demoMode === DemoMode.ZOOM) {
                    this.zoomPointIndex = (this.zoomPointIndex + 1) % ZOOM_POINTS.length;
                } else {
                    this.demoMode = DemoMode.ZOOM;
                    this.zoomPointIndex = 0;
                }
                this.zoomPoint.values[0] = ZOOM_POINTS[this.zoomPointIndex][0];
                this.zoomPoint.values[1] = ZOOM_POINTS[this.zoomPointIndex][1];
                this.needRedraw = true;
            } else if (event.key === "X") {
                this.setDemoModeParameter(this.demoMode, 1.0);
            } else if (event.key === "S") {
                this.setDemoModeParameter(this.demoMode, 0.0);
            } else if (event.key === "P") {
                // Cycle through phosphors.
                const index = this.phosphors.indexOf(this.colorMapNamedTexture.texture);
                const newIndex = (index + 1) % this.phosphors.length;
                this.colorMapNamedTexture.texture = this.phosphors[newIndex];
                this.needRedraw = true;
            } else if (event.code >= "Digit0" && event.code <= "Digit9") {
                this.demoMode = parseInt(event.code.substring(5)) as DemoMode;
            }
        }
    }

    private setDemoModeParameter(demoMode: DemoMode, value: number) {
        switch (demoMode) {
            case DemoMode.OFF:
                // Do nothing.
                break;

            case DemoMode.CRT_CURVATURE:
                this.crtCurvature.values[0] = clamp(0, value*DEFAULT_CRT_CURVATURE, DEFAULT_CRT_CURVATURE*2);
                break;

            case DemoMode.SCANLINES:
                this.scanlines.values[0] = clamp(0, value*DEFAULT_SCANLINES, 1);
                break;

            case DemoMode.PIXEL_BLUR:
                this.pixelHorizontalBlur.values[0] = clamp(0, value*this.pixelHorizontalBlurMax, this.pixelHorizontalBlurMax*2);
                this.pixelVerticalBlur.values[0] = clamp(0, value*this.pixelVerticalBlurMax, this.pixelVerticalBlurMax*2);
                break;

            case DemoMode.PHOSPHOR:
                this.phosphor.values[0] = clamp(0, value*DEFAULT_PHOSPHOR, 1);
                break;

            case DemoMode.SCANLINE_BLOOM:
                this.scanlineBloom.values[0] = clamp(0, value*DEFAULT_SCANLINE_BLOOM, DEFAULT_SCANLINE_BLOOM*2);
                break;

            case DemoMode.HALATION:
                this.halation.values[0] = clamp(0, value*DEFAULT_HALATION, DEFAULT_HALATION*2);
                break;

            case DemoMode.BLACKPOINT:
                this.blackpoint.values[0] = clamp(0, value*DEFAULT_BLACKPOINT, DEFAULT_BLACKPOINT*2);
                break;

            case DemoMode.VIGNETTE:
                this.vignette.values[0] = clamp(0, value*DEFAULT_VIGNETTE, DEFAULT_VIGNETTE*2);
                break;

            case DemoMode.REFLECTION:
                this.reflection.values[0] = clamp(0, value*DEFAULT_REFLECTION, DEFAULT_REFLECTION*2);
                break;

            case DemoMode.ZOOM:
                this.zoom.values[0] = clamp(1, 1 + value*8, 1000);
                break;

            case DemoMode.ALL:
                this.setDemoModeParameter(DemoMode.CRT_CURVATURE, value);
                this.setDemoModeParameter(DemoMode.SCANLINES, value);
                this.setDemoModeParameter(DemoMode.PIXEL_BLUR, value);
                this.setDemoModeParameter(DemoMode.PHOSPHOR, value);
                this.setDemoModeParameter(DemoMode.SCANLINE_BLOOM, value);
                this.setDemoModeParameter(DemoMode.HALATION, value);
                this.setDemoModeParameter(DemoMode.BLACKPOINT, value);
                this.setDemoModeParameter(DemoMode.VIGNETTE, value);
                this.setDemoModeParameter(DemoMode.REFLECTION, value);
                // Not zoom.
                break;
        }

        this.needRedraw = true;
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

    private redrawIfNecessary(): void {
        if (this.needRedraw || SHOW_REFLECTION) {
            this.needRedraw = false;
            this.refresh();
        }
    }

    private scheduleRefresh(): void {
        window.requestAnimationFrame(() => {
            if (this.getNode().parentNode !== null) {
                this.redrawIfNecessary();
                this.scheduleRefresh();
            }
        });
    }

    /**
     * Refresh the display based on what we've kept track of.
     */
    private refresh(): void {
        const gl = this.canvas.getContext("webgl2");
        if (gl === null) {
            throw new Error("WebGL2 is not supported");
        }
        const now = Date.now();

        // Update memory texture.
        gl.bindTexture(gl.TEXTURE_2D, this.memoryTexture.texture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TRS80_CHAR_WIDTH, TRS80_CHAR_HEIGHT,
            gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.memory);

        // Update reflection image.
        if (SHOW_REFLECTION) {
            gl.bindTexture(gl.TEXTURE_2D, this.cameraTexture.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.camera);
        }

        // Update time.
        this.time.values[0] = now/1000 - this.startTime;

        // Render each pass.
        for (const renderPass of this.renderPasses) {
            renderPass.render();
        }

        if (TIME_RENDERING) {
            const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            if (fence === null) {
                throw new Error("cannot create fence");
            }
            gl.flush();
            const checkFence = () => {
                // Always returns immediately (the max timeout is zero), so we poll.
                const status = gl.clientWaitSync(fence, 0, 0);
                switch (status) {
                    case gl.TIMEOUT_EXPIRED:
                        setTimeout(checkFence);
                        break;

                    case gl.WAIT_FAILED:
                        throw new Error("clientWaitSync failed: " + gl.getError());

                    default:
                        gl.deleteSync(fence);

                        const after = Date.now();
                        console.log("render time", after - now, "ms");
                        break;
                }
            };
            setTimeout(checkFence);
        }
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
            this.redrawIfNecessary();
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
