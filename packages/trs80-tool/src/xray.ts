import * as fs from "fs";
import http from "http";
import * as url from "url";
import * as ws from "ws";
import {Config, Keyboard, ModelType, RamSize, RunningState, Trs80 } from "trs80-emulator";

export function connectXray(trs80: Trs80, keyboard: Keyboard, config: Config): void {
    const host = "0.0.0.0";
    const port = 8080;

    function serveFile(res: http.ServerResponse, filename: string, mimetype: string): void {
        let contents;
        console.log("Serving " + filename);

        try {
            contents = fs.readFileSync("xray/" + filename);
        } catch (e: any) {
            console.log("Exception reading: " + e.message);
            res.writeHead(404);
            res.end("File not found");
            return;
        }

        res.setHeader("Content-Type", mimetype);
        res.writeHead(200);
        res.end(contents);
    }

    function requestListener(req: http.IncomingMessage, res: http.ServerResponse) {
        console.log(req.url);
        if (req.url === undefined) {
            console.log("Got undefined URL");
            return;
        }

        const { pathname } = url.parse(req.url);

        switch (pathname) {
            case "/":
            case "/index.html":
                serveFile(res, "index.html", "text/html");
                break;

            case "/trs_xray.js":
                serveFile(res, "trs_xray.js", "text/javascript");
                break;

            case "/trs_xray.css":
                serveFile(res, "trs_xray.css", "text/css");
                break;

            case "/channel":
                console.log("/channel was fetched");
                break;

            default:
                console.log("URL unknown: " + req.url + " from " + req.socket.remoteAddress);
                res.writeHead(404);
                res.end("File not found");
                break;
        }
    }

    function sendUpdate(ws: ws.WebSocket) {
        const regs = trs80.z80.regs;

        let modelNumber: number;
        switch (config.modelType) {
            case ModelType.MODEL1:
                modelNumber = 1;
                break;

            case ModelType.MODEL3:
                modelNumber = 3;
                break;

            case ModelType.MODEL4:
                modelNumber = 4;
                break;

            default:
                throw new Error("unknown model type " + config.modelType);
        }

        const info = {
            context: {
                system_name: "trs80-tool",
                model: modelNumber,
                running: trs80.runningState === RunningState.STARTED,
                alt_single_step_mode: false,
            },
            breakpoints: [],
            registers: {
                pc: regs.pc,
                sp: regs.sp,
                af: regs.af,
                bc: regs.bc,
                de: regs.de,
                hl: regs.hl,
                af_prime: regs.afPrime,
                bc_prime: regs.bcPrime,
                de_prime: regs.dePrime,
                hl_prime: regs.hlPrime,
                ix: regs.ix,
                iy: regs.iy,
                i: regs.i,
                r_1: regs.r,
                r_2: regs.r7 & 0x7F,
                z80_t_state_counter: trs80.tStateCount,
                z80_clockspeed: trs80.clockHz,
                z80_iff1: regs.iff1,
                z80_iff2: regs.iff2,
                z80_interrupt_mode: regs.im,
            },
        };

        ws.send(JSON.stringify(info));
    }

    function sendMemory(ws: ws.WebSocket): void {
        // TODO parse non-force version.
        const memorySize = 16*1024 + config.getRamSize();
        const memory = Buffer.alloc(memorySize + 2);
        for (let i = 0; i < memorySize; i++) {
            memory[i + 2] = trs80.readMemory(i);
        }
        // TODO first two bytes are start address in big-endian.
        ws.send(memory, {
            binary: true,
        });
    }

    const wss = new ws.WebSocketServer({ noServer: true });
    wss.on("connection", ws => {
        console.log("wss connection");

        ws.on("message", message => {
            const command = message.toString();
            const parts = command.split("/");

            if (parts[0] === "action") {
                switch (parts[1]) {
                    case "refresh":
                        sendUpdate(ws);
                        break;

                    case "step":
                        trs80.step();
                        sendUpdate(ws);
                        break;

                    case "continue":
                        trs80.setRunningState(RunningState.STARTED);
                        sendUpdate(ws);
                        break;

                    case "stop":
                        trs80.setRunningState(RunningState.STOPPED);
                        sendUpdate(ws);
                        break;

                    case "soft_reset":
                    case "hard_reset":
                        trs80.reset(); // TODO handle soft/hard distinction.
                        break;

                    case "key_event": {
                        const press = parts[2] === "1";
                        const what = parts[3] === "1";
                        const key = parts[4];
                        keyboard.keyEvent(key, press);
                        break;
                    }

                    case "get_memory":
                        sendMemory(ws);
                        break;

                    default:
                        console.log("Unknown command " + command);
                        break;
                }
            } else {
                console.log("Unknown command: " + command);
            }
        });

        setInterval(() => {
            if (trs80.runningState === RunningState.STARTED) {
                sendUpdate(ws);
                sendMemory(ws);
            }
        }, 100);
    });

    const server = http.createServer(requestListener);
    server.on("upgrade", (request, socket, head) => {
        if (request.url === undefined) {
            console.log("upgrade URL is undefined");
            return;
        }
        const { pathname } = url.parse(request.url);
        console.log("upgrade", request.url, pathname, head.toString());

        if (pathname === '/channel') {
            console.log("upgrade channel");
            wss.handleUpgrade(request, socket, head, ws => {
                console.log("upgrade handled", head);
                wss.emit("connection", ws, request);
            });
        } else {
            socket.destroy();
        }
    });

    server.listen(port, host, () => {
        console.log(`Server is running on http://${host}:${port}?connect=${host}:${port}`);
    });
}
