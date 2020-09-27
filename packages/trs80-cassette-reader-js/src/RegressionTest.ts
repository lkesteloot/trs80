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
import * as chalk from "chalk";

const CACHE_DIR = "cache";

/**
 * Downloads a file if not already cached. Returns the full pathname of the local file.
 */
async function downloadFile(fileUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
        if (url.parse(fileUrl).protocol === null) {
            // It's a pathname, just use it.
            resolve(fileUrl);
            return;
        }

        const filename = path.basename(fileUrl);
        const cacheFilename = fileUrl.replace(/[/:@]/g, "-");
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
        https.get(fileUrl, res => {
            if (res.statusCode !== 200) {
                reject(new Error("Got response code " + res.statusCode + ": " + fileUrl));
                return;
            }

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

            res.on("data",  chunk => {
                bar.tick(chunk.length);
                fs.writeSync(fd, chunk);
            });
            res.on("end", () => {
                fs.closeSync(fd);
                resolve(cachePathname);
            });
            res.on("error",  error => {
                console.log(error);
            })
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
async function makeJsonFile(wavPathname: string) {
    const parsed = path.parse(wavPathname);
    const baseName = parsed.name;
    const jsonPathname = path.join(parsed.dir, baseName + ".json");

    // Load the tape from the WAV file.
    const tape = await loadTape(wavPathname);

    // Generate binary files.
    const binaries: any[] = [];
    for (const program of tape.programs) {
        const binaryFilename = program.getShortLabel().replace(" ", "-") + ".bin";
        const binaryPathname = path.resolve(parsed.dir, binaryFilename);
        fs.writeFileSync(binaryPathname, program.binary);

        binaries.push({
            url: binaryFilename
        });
    }

    // Generate JSON file.
    const test = {
        url: path.basename(wavPathname),
        binaries: binaries,
    };
    const json = JSON.stringify(test, null, 4) + "\n";
    fs.writeFileSync(jsonPathname, json);

    console.log("Generated " + path.relative(".", jsonPathname));
}

async function makeJsonFiles(wavPathnames: string[]) {
    let first = true;

    for (const wavPathname of wavPathnames) {
        if (!first) {
            console.log("------------------------------------------------------------------");
        }
        await makeJsonFile(wavPathname);
        first = false;
    }
}

async function testJsonFile(jsonUrl: string) {
    console.log("Running test: " + jsonUrl);

    const jsonPathname = await downloadFile(jsonUrl);
    const json = fs.readFileSync(jsonPathname, {encoding: "utf-8"});
    const test = JSON.parse(json);

    if (test.tests) {
        // File pointing to other tests.
        for (const testUrl of test.tests) {
            await testJsonFile(url.resolve(jsonUrl, testUrl));
        }
    } else {
        // Single test.
        const tape = await loadTape(url.resolve(jsonUrl, test.url));

        let successCount = 0;
        let failureCount = 0;
        for (let i = 0; i < tape.programs.length; i++) {
            const program = tape.programs[i];
            const binaryUrl = test.binaries[i].url; // TODO tape.programs[i] and test.binaries[i] may not match up.
            const expectedBinary = fs.readFileSync(await downloadFile(url.resolve(jsonUrl, binaryUrl)));
            const actualBinary = program.binary;

            let failed = false;
            for (let i = 0; i < Math.min(actualBinary.length, expectedBinary.length) && !failed; i++) {
                if (actualBinary[i] !== expectedBinary[i]) {
                    console.log(chalk.red("%s: bytes differ at index %d (0x%s vs 0x%s)"),
                        binaryUrl, i, toHexByte(actualBinary[i]), toHexByte(expectedBinary[i]));
                    failed = true;
                    failureCount += 1;
                }
            }
            if (!failed) {
                if (actualBinary.length !== expectedBinary.length) {
                    console.log(chalk.red("%s: prefix matches, but sizes differ (%d vs %d)"),
                        binaryUrl, actualBinary.length, expectedBinary.length);
                    failureCount += 1;
                } else {
                    successCount += 1;
                    // console.log("%s: files match", binaryUrl);
                }
            }
        }
        if (failureCount === 0) {
            console.log(chalk.green("Successes: " + successCount));
        } else {
            console.log(chalk.red("Successes: " + successCount + ", failures: " + failureCount));
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
        .command("run <jsonFile...>")
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
