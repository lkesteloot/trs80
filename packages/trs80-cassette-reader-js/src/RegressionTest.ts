import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as ProgressBar from "progress";
import {AudioFile} from "./AudioUtils";
import {readWavFile} from "./WavReader";
import {Tape} from "./Tape";
import {Decoder} from "./Decoder";

const CACHE_DIR = "cache";

/**
 * Downloads a file if not already cached. Returns the full pathname of the local file.
 */
async function downloadFile(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const filename = path.basename(url);
        const cachePathname = path.resolve(CACHE_DIR, filename);

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

async function main(testPathname: string) {
    const testJson = fs.readFileSync(testPathname, {encoding: "utf-8"});
    const test = JSON.parse(testJson);

    console.log(test.url);
    const pathname = await downloadFile(test.url);
    console.log(pathname);

    const buffer = fs.readFileSync(pathname);
    const audioFile = readWavFile(buffer.buffer);
    console.log("Audio file has sample rate " + audioFile.rate);
    const tape = new Tape(pathname, audioFile);
    const decoder = new Decoder(tape);
    decoder.decode();
    for (let i = 0; i < tape.programs.length; i++) {
        const program = tape.programs[i];
        const expectedBinary = fs.readFileSync(path.resolve(path.dirname(testPathname), test.binaries[i].pathname));
        const actualBinary = program.binary;

        console.log("%s: Got %d bytes, expected %d bytes",
            program.getShortLabel(), actualBinary.length, expectedBinary.length);
    }
}

main("tests/C-1-1.json").then(() => console.log("All done"));
