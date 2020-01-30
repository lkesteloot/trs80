
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as ProgressBar from "progress";

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

async function main() {
    const pathname = await downloadFile("https://trs80-cassettes.s3.us-east-2.amazonaws.com/lk/C-1-1.wav");
    console.log(pathname);

    const buf = fs.readFileSync(pathname);

    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(buf);

    console.log("Audio is " + audioBuffer.duration + " seconds, " +
        audioBuffer.numberOfChannels + " channels, " +
        audioBuffer.sampleRate + " Hz");
}

main().then(() => console.log("All done"));
