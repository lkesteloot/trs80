import {Trs80Screen} from "./Trs80Screen";
import {clearElement, SCREEN_BEGIN} from "./Utils";
import vertexShader from "./VertexShader";
import fragmentShader from "./FragmentShader";
import {fontWidth,fontHeight,fontTexture} from "./FontTexture";

const POS_ATTRIB = 0;
const VTEX_ATTRIB = 1;

// Size of the TRS-80 screen in characters.
const MEMORY_WIDTH = 64;
const MEMORY_HEIGHT = 16;

// Size of the TRS-80 screen in pixels.
const SCREEN_WIDTH = MEMORY_WIDTH*8;
const SCREEN_HEIGHT = MEMORY_HEIGHT*24;

export class WebGlScreen extends Trs80Screen {
    private readonly node: HTMLCanvasElement;
    private readonly gl: WebGLRenderingContext;
    private readonly program: WebGLProgram;
    private readonly vertexBuffer: WebGLBuffer;
    private readonly vertexComponentCount: number;
    private readonly vertexCount: number;
    private readonly textureBuffer: WebGLBuffer;
    private readonly textureComponentCount: number;
    private readonly fontTexture: WebGLTexture;
    private readonly memoryTexture: WebGLTexture;
    private readonly memoryBuffer = new Uint8Array(MEMORY_WIDTH*MEMORY_HEIGHT);


    constructor(parentNode: HTMLElement) {
        super();

        clearElement(parentNode);

        this.node = document.createElement("canvas");
        this.node.width = SCREEN_WIDTH;
        this.node.height = SCREEN_HEIGHT;
        parentNode.appendChild(this.node);

        const gl = this.node.getContext("webgl", { preserveDrawingBuffer: true });
        if (gl === null) {
            throw new Error("Cannot initialize WebGL context");
        }
        this.gl = gl;
        const tf = this.gl.getExtension("OES_texture_float");
        if (tf === null) {
            throw new Error("Cannot initialize OES_texture_float extension");
        }

        this.program = this.configureProgram();

        // Create vertices.
        const vertexArray = new Float32Array([
            -1, 1, 1, 1, 1, -1,
            -1, 1, 1, -1, -1, -1
        ]);
        const vertexBuffer = gl.createBuffer();
        if (vertexBuffer === null) {
            throw new Error("Cannot create vertex buffer");
        }
        this.vertexBuffer = vertexBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);
        this.vertexComponentCount = 2; // 2D vertices.
        this.vertexCount = vertexArray.length / this.vertexComponentCount;

        // Create texture coordinates.
        const textureArray = new Float32Array([
            // 0.0, 0.0, 1.0, 0.0, 1.0, 1.0,
            // 0.0, 0.0, 1.0, 1.0, 0.0, 1.0,
            0, 0, SCREEN_WIDTH, 0, SCREEN_WIDTH, SCREEN_HEIGHT,
            0, 0, SCREEN_WIDTH, SCREEN_HEIGHT, 0, SCREEN_HEIGHT,
        ]);
        const textureBuffer = gl.createBuffer();
        if (textureBuffer === null) {
            throw new Error("Cannot create texture coordinate buffer");
        }
        this.textureBuffer = textureBuffer;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, textureArray, gl.STATIC_DRAW);
        this.textureComponentCount = 2; // 2D vertices.

        // Create a new "texture object"
        let texture = gl.createTexture();
        if (texture === null) {
            throw new Error("Cannot create font texture");
        }
        this.fontTexture = texture;
        gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, fontWidth, fontHeight, 0,
            gl.LUMINANCE, gl.UNSIGNED_BYTE, fontTexture);

        texture = gl.createTexture();
        if (texture === null) {
            throw new Error("Cannot create memory texture");
        }
        this.memoryTexture = texture;
        gl.bindTexture(gl.TEXTURE_2D, this.memoryTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, MEMORY_WIDTH, MEMORY_HEIGHT, 0,
            gl.LUMINANCE, gl.UNSIGNED_BYTE, this.memoryBuffer);

        this.draw();
    }

    writeChar(address: number, value: number): void {
        this.memoryBuffer[address - SCREEN_BEGIN] = value;
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.memoryTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.LUMINANCE, MEMORY_WIDTH, MEMORY_HEIGHT, 0,
            this.gl.LUMINANCE, this.gl.UNSIGNED_BYTE, this.memoryBuffer);
        this.draw();
    }

    getNode(): HTMLElement {
        return this.node;
    }

    private draw(): void {
        this.gl.viewport(0, 0, this.node.width, this.node.height);
        this.gl.clearColor(0.8, 0.9, 1.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
        this.gl.useProgram(this.program);

        // Bind vertices.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(POS_ATTRIB, this.vertexComponentCount,
            this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(POS_ATTRIB);

        // Bind texture coordinates.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.textureBuffer);
        this.gl.vertexAttribPointer(VTEX_ATTRIB, this.textureComponentCount,
            this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(VTEX_ATTRIB);

        // Bind the memory texture.
        const memoryImageLocation = this.gl.getUniformLocation(this.program, "memoryImage");
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.memoryTexture);
        this.gl.uniform1i(memoryImageLocation, 0);

        // Bind the font texture.
        const fontImageLocation = this.gl.getUniformLocation(this.program, "fontImage");
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.fontTexture);
        this.gl.uniform1i(fontImageLocation, 1);

        // Draw the triangles.
        this.gl.drawArrays(this.gl.TRIANGLES, 0, this.vertexCount);
    }

    private configureProgram(): WebGLProgram {
        const shaderSet = [
            {
                type: this.gl.VERTEX_SHADER,
                code: vertexShader,
            },
            {
                type: this.gl.FRAGMENT_SHADER,
                code: fragmentShader,
            }
        ];

        return this.buildShaderProgram(shaderSet);
    }

    /**
     * Compile a shader.
     */
    private compileShader(code: string, type: number) {
        // Create the shader.
        let shader = this.gl.createShader(type);
        if (shader === null) {
            throw new Error("Cannot create shader");
        }

        // Compile it.
        this.gl.shaderSource(shader, code);
        this.gl.compileShader(shader);

        // Check for compile errors.
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.log(`Error compiling ${type === this.gl.VERTEX_SHADER ? "vertex" : "fragment"} shader:`);
            console.log(this.gl.getShaderInfoLog(shader));
        }

        return shader;
    }

    /**
     * Build an entire WebGL program from a set of shaders.
     * @param shaderInfo array of objects with "type" and "id" parameters.
     */
    private buildShaderProgram(shaderInfo: { code: string, type: number }[]) {
        const programOrNull = this.gl.createProgram();
        if (programOrNull === null) {
            throw new Error("Cannot create WebGL program");
        }
        const program = programOrNull;

        shaderInfo.forEach(desc => {
            let shader = this.compileShader(desc.code, desc.type);
            if (shader) {
                this.gl.attachShader(program, shader);
            }
        });

        this.gl.bindAttribLocation(program, POS_ATTRIB, "pos");
        this.gl.bindAttribLocation(program, VTEX_ATTRIB, "vtex");

        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.log("Error linking shader program:");
            console.log(this.gl.getProgramInfoLog(program));
        }

        return program;
    }
}

