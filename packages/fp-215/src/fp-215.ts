
/**
 * Emulator for the FP-215 plotter.
 */
export class FP215 {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private currentCommand = "";
    private x = 0;
    private y = 0;
    private xOrigin = 0;
    private yOrigin = 0;
    private dashLength = 30;
    private plottingArea: 0 | 1 = 0;
    private lineType: 0 | 1 = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
        this.configureContext();
        this.updatePlottingArea();
    }

    public newPaper() {
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    public processBytes(s: string): void {
        for (const ch of s) {
            this.processByte(ch);
        }
    }

    public processByte(ch: string): void {
        if (ch === "\n" || ch === "\r") {
            this.processCommand(this.currentCommand);
            this.currentCommand = "";
        } else {
            this.currentCommand += ch;
        }
    }

    private processCommand(command: string): void {
        if (command.length === 0) {
            return;
        }

        const rest = command.substring(1);
        const args = rest.split(",");
        const numericArgs = args.map(arg => parseFloat(arg));

        switch (command[0]) {
            case "B": {
                if (numericArgs.length !== 1 || isNaN(numericArgs[0])) {
                    console.log("FP-215: Invalid dash length command: " + command);
                } else {
                    this.dashLength = numericArgs[0];
                }
                break;
            }

            case "D": {
                if (numericArgs.length < 2 ||
                    numericArgs.length % 2 !== 0 ||
                    numericArgs.some(arg => isNaN(arg))) {

                    console.log("FP-215: Invalid drawing command: " + command);
                } else {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.xToCanvas(this.x), this.yToCanvas(this.y));
                    for (let i = 0; i < numericArgs.length; i += 2) {
                        this.ctx.lineTo(this.xToCanvas(numericArgs[i]), this.yToCanvas(numericArgs[i + 1]));
                    }
                    this.ctx.stroke();
                    this.x = numericArgs[numericArgs.length - 2];
                    this.y = numericArgs[numericArgs.length - 1];
                }
                break;
            }

            case "F": {
                if (numericArgs.length !== 1 || (numericArgs[0] !== 0 && numericArgs[0] !== 1)) {
                    console.log("FP-215: Invalid plotting area command: " + command);
                } else {
                    this.plottingArea = numericArgs[0];
                    this.updatePlottingArea();
                }
                break;
            }

            case "H": {
                this.x = 0;
                this.y = 0;
                break;
            }

            case "I": {
                if (numericArgs.length === 0) {
                    this.xOrigin = this.x;
                    this.yOrigin = this.y;
                } else if (numericArgs.length !== 2 || isNaN(numericArgs[0]) || isNaN(numericArgs[1])) {
                    console.log("FP-215: Invalid set-origin command: " + command);
                } else {
                    this.xOrigin = numericArgs[0];
                    this.yOrigin = numericArgs[1];
                }
                break;
            }

            case "J": {
                if (numericArgs.length % 2 !== 0 || numericArgs.some(arg => isNaN(arg))) {
                    console.log("FP-215: Invalid drawing command: " + command);
                } else {
                    for (let i = 0; i < numericArgs.length; i += 2) {
                        this.drawBy(numericArgs[i], numericArgs[i + 1]);
                    }
                }
                break;
            }

            case "L": {
                if (numericArgs.length !== 1 || (numericArgs[0] !== 0 && numericArgs[0] !== 1)) {
                    console.log("FP-215: Invalid line type command: " + command);
                } else {
                    this.lineType = numericArgs[0];
                }
                break;
            }

            case "M": {
                if (numericArgs.length !== 2 || isNaN(numericArgs[0]) || isNaN(numericArgs[1])) {
                    console.log("FP-215: Invalid move command: " + command);
                } else {
                    this.x = numericArgs[0];
                    this.y = numericArgs[1];
                }
                break;
            }

            case "N": {
                console.log("FP-215: Drawing an icon is not supported: " + command);
                break;
            }

            case "P": {
                console.log("FP-215: Drawing text is not supported:" + command);
                break;
            }

            case "Q": {
                console.log("FP-215: Setting text orientation is not supported:" + command);
                break;
            }

            case "R": {
                if (numericArgs.length !== 2 || isNaN(numericArgs[0]) || isNaN(numericArgs[1])) {
                    console.log("FP-215: Invalid relative move command: " + command);
                } else {
                    this.x += numericArgs[0];
                    this.y += numericArgs[1];
                }
                break;
            }

            case "S": {
                console.log("FP-215: Setting size of text is not supported:" + command);
                break;
            }

            case "X": {
                console.log("FP-215: Drawing axes is not supported:" + command);
                break;
            }

            default:
                console.log("FP-215: Unknown FP-215 command: " + command);
                break;
        }
    }

    private updatePlottingArea(): void {
        const widthMm = this.plottingArea === 0 ? 270 : 298;
        const heightMm = this.plottingArea === 0 ? 186 : 216;
        this.canvas.width = widthMm*10;
        this.canvas.height = heightMm*10;
        this.configureContext();
        this.newPaper();
    }

    private configureContext(): void {
        this.ctx.strokeStyle = "rgb(0 0 0 / 50%)";
        this.ctx.globalCompositeOperation = "multiply";
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = "round";
    }

    private drawTo(x: number, y: number): void {
        this.drawLine(
            this.xOrigin + this.x, this.canvas.height - (this.xOrigin + this.y),
            this.xOrigin + x, this.canvas.height - (this.xOrigin + y));
        this.x = x;
        this.y = y;
    }

    private drawBy(dx: number, dy: number): void {
        const xNew = this.x + dx;
        const yNew = this.y + dy;

        this.drawTo(xNew, yNew);

        this.x = xNew;
        this.y = yNew;
    }

    /**
     * Coordinates are in canvas space.
     */
    private drawLine(x1: number, y1: number, x2: number, y2: number): void {
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }

    private xToCanvas(x: number): number {
        return this.xOrigin + x;
    }

    private yToCanvas(y: number): number {
        return this.canvas.height - (this.xOrigin + y);
    }
}
