import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import * as https from "https";
import * as ProgressBar from "progress";
import {readWavFile} from "./WavReader";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";
import * as program from "commander";
import { toHexByte } from "z80-base";

const CACHE_DIR = "cache";

/**
 * Downloads a file if not already cached. Returns the full pathname of the local file.
 */
async function downloadFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const filename = path.basename(url);
        const cacheFilename = url.replace(/[/:@]/g, "-");
        const cachePathname = path.resolve(CACHE_DIR, cacheFilename);

        // See if it's in the cache. We assume that it doesn't ever change
        // on the server.
        if (fs.existsSync(cachePathname)) {
            resolve(cachePathname);
            return;
        }

        // Make sure the cache directory exists.
        fs.mkdirSync(path.resolve(CACHE_DIR), {
            recursive: true,
        });

        // Local file.
        const fd = fs.openSync(cachePathname, "w");

        // Stream file.
        https.get(url, res => {
            let totalSizeString = res.headers["content-length"];
            // TODO Handle unspecified length (the 0 here).
            let totalSize = totalSizeString === undefined ? 0 : parseInt(totalSizeString);

            // Show download progress bar.
            const bar = new ProgressBar("[:bar] ETA: :etas  " + filename, {
                complete: "=",
                incomplete: " ",
                width: 40,
                total: totalSize
            });

            res.on("data", function (chunk) {
                bar.tick(chunk.length);
                fs.writeSync(fd, chunk);
            });
            res.on("end", function () {
                fs.closeSync(fd);
                resolve(cachePathname);
            });
            // TODO handle network/HTTP error.
        });
    });
}

/**
 * Load the tape from the WAV file at the URL.
 */
async function loadTape(wavUrl: string) {
    const pathname = await downloadFile(wavUrl);

    const buffer = fs.readFileSync(pathname);
    const audioFile = readWavFile(buffer.buffer);
    const tape = new Tape(pathname, audioFile);
    const decoder = new Decoder(tape);
    decoder.decode();

    return tape;
}

/**
 * Generate a new JSON test file from a WAV file.
 */
async function makeJsonFile(wavUrl: string) {
    // Various names and pathnames.
    const jsonName = path.parse(wavUrl).name;
    const jsonFilename = jsonName + ".json";
    const jsonPathname = path.resolve("tests", jsonFilename);

    // Load the tape from the WAV file.
    const tape = await loadTape(wavUrl);

    // Generate binary files.
    const binaries: any[] = [];
    for (const program of tape.programs) {
        const relativeBinaryPathname = path.join(jsonName, program.getShortLabel().replace(" ", "-")) + ".bin";
        // Pathname in JSON file is relative to JSON file.
        const absoluteBinaryPathname = path.resolve(path.dirname(jsonPathname), relativeBinaryPathname);
        fs.mkdirSync(path.dirname(absoluteBinaryPathname), { recursive: true });
        fs.writeFileSync(absoluteBinaryPathname, program.binary);

        binaries.push({
            pathname: relativeBinaryPathname
        });
    }

    // Generate JSON file.
    const test = {
        url: wavUrl,
        binaries: binaries,
    };
    const json = JSON.stringify(test, null, 4) + "\n";
    fs.writeFileSync(jsonPathname, json);

    console.log("Generated " + path.relative(".", jsonPathname));
}

async function makeJsonFiles(urls: string[]) {
    let first = true;

    for (const url of urls) {
        if (!first) {
            console.log("------------------------------------------------------------------");
        }
        await makeJsonFile(url);
        first = false;
    }
}

async function testJsonFile(jsonPathname: string) {
    console.log("Running test: " + jsonPathname);

    const json = fs.readFileSync(jsonPathname, {encoding: "utf-8"});
    const test = JSON.parse(json);

    const tape = await loadTape(test.url);

    for (let i = 0; i < tape.programs.length; i++) {
        const program = tape.programs[i];
        const binaryUrl = test.binaries[i].url;
        const expectedBinary = fs.readFileSync(await downloadFile(url.resolve(test.url, binaryUrl)));
        const actualBinary = program.binary;

        let failed = false;
        for (let i = 0; i < Math.min(actualBinary.length, expectedBinary.length) && !failed; i++) {
            if (actualBinary[i] !== expectedBinary[i]) {
                console.log("%s: bytes differ at index %d (0x%s vs 0x%s)",
                    binaryUrl, i, toHexByte(actualBinary[i]), toHexByte(expectedBinary[i]));
                failed = true;
            }
        }
        if (!failed) {
            if (actualBinary.length !== expectedBinary.length) {
                console.log("%s: prefix matches, but sizes differ (%d cs %d)",
                    binaryUrl, actualBinary.length, expectedBinary.length);
            } else {
                console.log("%s: files match", binaryUrl);
            }
        }
    }
}

async function testJsonFiles(jsonPathnames: string[]) {
    let first = true;

    for (const jsonPathname of jsonPathnames) {
        if (!first) {
            console.log("------------------------------------------------------------------");
        }
        await testJsonFile(jsonPathname);
        first = false;
    }
}

function main() {
    program
        .command("make <url...>")
        .description("make test JSON file from WAV file at URL")
        .action(makeJsonFiles);
    program
        .command("test <jsonFile...>")
        .description("run the test in the JSON file")
        .action(testJsonFiles);

    program.on('command:*', function () {
        console.error('Invalid command: %s\nSee --help for a list of available commands.', program.args.join(' '));
        process.exit(1);
    });

    program.parseAsync(process.argv).then(() => {
        if (!process.argv.slice(2).length) {
            program.outputHelp();
        }
    });
}

main();
