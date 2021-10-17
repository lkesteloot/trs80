
const mfm = false;
const interval = mfm ? 80 : 160;

function main() {
    const canvas = document.getElementById("canvas");
    canvas.width = 1200;
    canvas.height = 400;

    if (false) {
        const hist = [];
        for (let i = 0; i < 1000; i++) {
            hist.push(0);
        }

        for (const bitcell of bitcells) {
            if (bitcell < 0 || bitcell >= hist.length) {
                console.log("Value " + bitcell + " is out of range");
            } else {
                hist[bitcell] += 1;
            }
        }

        for (let i = 0; i < hist.length; i++) {
            console.log(i, hist[i]);
        }
    }

    const width = canvas.width;
    const height = canvas.height;

    let zoom = 1; // Multiply by zoom to go from time to space.
    let startX = 0; // X location of first bitcell.

    function draw() {
        console.log("-------------------------------------------------------------");

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);

        if (false) {
            ctx.strokeStyle = "white";
            ctx.beginPath();
            let index = 0;
            let x = 0;
            let y = height/4;
            ctx.moveTo(x, y);
            for (const bitcell of bitcells) {
                x += bitcell/10;
                ctx.lineTo(x, y);
                y = height/2 + (index % 2 === 0 ? height/4 : -height/4);
                ctx.lineTo(x, y);

                index += 1;
                if (x > width) {
                    break;
                }
            }
            ctx.stroke();
        }

        if (true) {
            let data = 0;
            let clock = 0;
            let recent = 0;
            let nextBitIsClock = true;
            let bitCount = undefined;
            const bytesToDraw = [];

            function injectData(value) {
                data = ((data << 1) & 0xFF) | value;
            }

            function injectClock(value) {
                clock = ((clock << 1) & 0xFF) | value;
            }

            function updateClock() {
                const dataBit = data & 0x01;
                const clockBit = clock & 0x01;
                const previousDataBit = (data >> 1) & 0x01;

                if (clockBit === 0 && dataBit === 0) {
                    clock = (clock & 0xFE) | previousDataBit;
                    if (previousDataBit === 0) {
                        console.log("MISSING CLOCK BIT");
                    }
                } else if (clockBit === 0 && dataBit === 1) {
                    // Legit 1.
                    clock |= 1;
                } else if (clockBit === 1 && dataBit === 0) {
                    if (previousDataBit === 1) {
                        console.log("ERROR: 1/0 can't happen");
                    }
                } else if (clockBit === 1 && dataBit === 1) {
                    console.log("ERROR: 1/1 can't happen");
                }
            }

            function injectBit(value) {
                recent = (recent << 1) | value;
                if ((recent & 0x7FFF) === 0x4489) {
                    // This is the 0xA1 data with the 0xFB clock.
                    // About to get last data bit.
                    console.log("MATCH SYNC", nextBitIsClock);
                    clock = 0xFB;
                    data = 0xA1;
                    nextBitIsClock = true;
                } else {
                    if (nextBitIsClock) {
                        injectClock(value);
                    } else {
                        injectData(value);
                        if (mfm) {
                            updateClock();
                        }
                    }
                    nextBitIsClock = !nextBitIsClock;
                }

                if (!mfm && data === 0xFF && clock === 0x00 && nextBitIsClock) {
                    console.log("Swapping");
                    nextBitIsClock = false;
                }

                if (mfm) {
                    if (clock === 0xFB && data === 0xA1) {
                        bytesToDraw.push([x, data]);
                        bitCount = 15;
                        console.log("Got address mark: " + data.toString(16).padStart(2, "0"));
                    }
                } else {
                    if (clock === 0xC7 &&
                        (data === 0xFE || (data >= 0xF8 && data <= 0xFB))) {

                        bytesToDraw.push([x, data]);
                        bitCount = 15;
                        console.log("Got address mark: " + data.toString(16).padStart(2, "0"));
                    }
                }
                if (bitCount !== undefined) {
                    bitCount += 1;
                    if (bitCount === 16) {
                        console.log("Got byte: " + data.toString(16).padStart(2, "0"));
                        bytesToDraw.push([x, data]);
                        bitCount = 0;
                    }
                }

                if (true) {
                    const binClock = clock.toString(2).padStart(8, "0");
                    const binData = data.toString(2).padStart(8, "0");
                    console.log(
                        binClock.substring(0, 4) + "." + binClock.substring(4),
                        binData.substring(0, 4) + "." + binData.substring(4),
                        clock.toString(16).padStart(2, "0").toUpperCase(),
                        data.toString(16).padStart(2, "0").toUpperCase(),
                        bitCount, nextBitIsClock ? "is data" : "is clock", value);
                }
            }

            let x = startX;
            let y = height*3/4;
            for (const bitcell of bitcells) {
                x += bitcell*zoom;
                if (x > width) {
                    break;
                }
                const len = Math.round(bitcell/interval);

                // Ignore short pulses.
                if (len > 0) {
                    for (let i = 0; i < len - 1; i++) {
                        injectBit(0);
                    }
                    injectBit(1);
                }

                /*
                * For clock/data:
                *
                * 0/0: If previous (data) bit is 1, then legit, make clock 1. Else clock is 0.
                *       I.e., copy clock from previous bit.
                * 0/1: Legit 1, turn clock to 1.
                * 1/0: If previous (data) bit is 0, then legit, keep clock 1. Else can't happen.
                * 1/1: Can't happen.
                *
                * So:
                * 1. How to handle impossible situations.
                * 2. How to figure out which is clock.
                *   Same as FM after above.
                */

                if (x >= 0) {
                    const drawX = Math.round(x) + 0.5;

                    let color = 0x808080;
                    let colorByte = mfm ? (len - 1) : len;
                    if (colorByte >= 1 && colorByte <= 3) {
                        color |= 0xFF << ((3 - colorByte)*8);
                    }
                    ctx.strokeStyle = "#" + color.toString(16).padStart(6, "0");
                    ctx.beginPath();
                    ctx.moveTo(drawX, height*0.25);
                    ctx.lineTo(drawX, height*0.50);
                    ctx.stroke();

                    color = 0x808080 | (0xFF << ((nextBitIsClock ? 0 : 1)*8));
                    ctx.strokeStyle = "#" + color.toString(16).padStart(6, "0");
                    ctx.beginPath();
                    ctx.moveTo(drawX, height*0.50);
                    ctx.lineTo(drawX, height*0.75);
                    ctx.stroke();

                    if (bytesToDraw.length > 0) {
                        ctx.fillStyle = "white";
                        ctx.font = "16px sans-serif";
                        for (const [x, data] of bytesToDraw) {
                            const drawX = Math.round(x) + 0.5;
                            ctx.fillText(data.toString(16).padStart(2, "0").toUpperCase(), drawX, height*0.80);
                        }
                        bytesToDraw.splice(0, bytesToDraw.length);
                    }
                }
            }
        }
    }

    const body = document.querySelector("body");
    body.addEventListener("keydown", e => {
        // console.log(e.key);
        switch (e.key) {
            case "+":
            case "=": {
                const centerTime = (width/2 - startX)/zoom;
                zoom *= 2;
                startX = width/2 - centerTime*zoom;
                draw();
                break;
            }

            case "-":
            case "_":
                const centerTime = (width/2 - startX)/zoom;
                zoom /= 2;
                startX = width/2 - centerTime*zoom;
                draw();
                break;

            case "ArrowRight":
                startX -= width/4;
                draw();
                break;

            case "ArrowLeft":
                startX += width/4;
                draw();
                break;
        }
    });

    draw();
}

main();
