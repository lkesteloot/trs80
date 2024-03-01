
import { FP215 } from "../dist/index.js";

async function main() {
    const canvas = document.createElement("canvas");
    canvas.width = 2980;
    canvas.height = 2160;
    document.body.append(canvas);

    const before = Date.now();
    const fp215 = new FP215(canvas);

    // const testFilename = "DISNEY27.PLX";
    const testFilename = "EDushku2.PLX";
    const response = await fetch(testFilename);
    const text = await response.text();
    fp215.processBytes(text);
    const after = Date.now();
    console.log("Rendering time", after - before, "ms");
}

await main();
