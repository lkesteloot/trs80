// Builds stand-alone trs80-tool executables with Node's single executable
// applications (SEA): https://nodejs.org/api/single-executable-applications.html
//
// Run after esbuild has written the bundle to binaries/main.js ("npm run buildBinaries"
// does both). For each target, this downloads the official Node executable (checked
// against the release's SHA-256 sums and cached in binaries/cache), injects the bundle
// into a copy of it, and signs it if it's for macOS. Must run on macOS, because the
// macOS executables must be signed with codesign.

import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import postject from "postject";

// The Node version to embed. Bump this to pick up Node security fixes.
const NODE_VERSION = "v24.21.0";
const NODE_DIST_URL = `https://nodejs.org/dist/${NODE_VERSION}`;

const PACKAGE_DIR = path.dirname(fileURLToPath(import.meta.url));
const BINARIES_DIR = path.join(PACKAGE_DIR, "binaries");
const BUNDLE = path.join(BINARIES_DIR, "main.js");
const CACHE_DIR = path.join(BINARIES_DIR, "cache", NODE_VERSION);
const DIST_DIR = path.join(BINARIES_DIR, "trs80-tool");

// Node's name for each platform, and where its executable goes. The output
// paths are linked from site/index.html and uploaded by CI.
const TARGETS = [
    {platform: "linux-x64", output: "linux/trs80-tool"},
    {platform: "darwin-x64", output: "macos/trs80-tool"},
    {platform: "darwin-arm64", output: "macos-arm64/trs80-tool"},
    {platform: "win-x64", output: "windows/trs80-tool.exe"},
];

// String in the Node executable that tells it a SEA blob has been injected.
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

async function fetchOk(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: ${response.status} ${response.statusText}`);
    }
    return response;
}

let shaSums = undefined;

/**
 * Map from filename to expected SHA-256 for the files in the Node release.
 */
async function getShaSums() {
    if (shaSums === undefined) {
        const text = await (await fetchOk(`${NODE_DIST_URL}/SHASUMS256.txt`)).text();
        shaSums = new Map(text.trim().split("\n").map(line => {
            const [sha, filename] = line.trim().split(/\s+/);
            return [filename, sha];
        }));
    }
    return shaSums;
}

/**
 * Path to the official Node executable for the platform, downloading it if necessary.
 */
async function getNodeExecutable(platform) {
    const isWindows = platform.startsWith("win");
    const baseName = `node-${NODE_VERSION}-${platform}`;
    const archiveName = baseName + (isWindows ? ".zip" : ".tar.xz");
    const memberName = isWindows ? `${baseName}/node.exe` : `${baseName}/bin/node`;
    const executable = path.join(CACHE_DIR, memberName);
    if (fs.existsSync(executable)) {
        return executable;
    }

    console.log(`Downloading ${archiveName}`);
    const archive = Buffer.from(await (await fetchOk(`${NODE_DIST_URL}/${archiveName}`)).arrayBuffer());
    const expectedSha = (await getShaSums()).get(archiveName);
    const actualSha = crypto.createHash("sha256").update(archive).digest("hex");
    if (actualSha !== expectedSha) {
        throw new Error(`${archiveName}: SHA-256 is ${actualSha}, expected ${expectedSha}`);
    }

    // Extract only the executable.
    fs.mkdirSync(CACHE_DIR, {recursive: true});
    const archivePath = path.join(CACHE_DIR, archiveName);
    fs.writeFileSync(archivePath, archive);
    if (isWindows) {
        execFileSync("unzip", ["-q", "-o", archivePath, memberName, "-d", CACHE_DIR]);
    } else {
        execFileSync("tar", ["-xJf", archivePath, "-C", CACHE_DIR, memberName]);
    }
    fs.rmSync(archivePath);

    return executable;
}

if (process.platform !== "darwin") {
    throw new Error("Must run on macOS, to sign the macOS executables with codesign");
}
const hostPlatform = `${process.platform}-${process.arch}`;

// Generate the blob with the same Node version that we embed. Code cache and
// snapshots are platform-specific, so they must be off for one blob to work
// on every platform.
const configPath = path.join(BINARIES_DIR, "sea-config.json");
const blobPath = path.join(BINARIES_DIR, "sea-prep.blob");
fs.writeFileSync(configPath, JSON.stringify({
    main: BUNDLE,
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useCodeCache: false,
    useSnapshot: false,
}, undefined, 2));
execFileSync(await getNodeExecutable(hostPlatform), ["--experimental-sea-config", configPath], {stdio: "inherit"});
const blob = fs.readFileSync(blobPath);

for (const {platform, output} of TARGETS) {
    const isMac = platform.startsWith("darwin");
    const executable = path.join(DIST_DIR, output);
    console.log(`Building ${path.relative(PACKAGE_DIR, executable)}`);

    fs.mkdirSync(path.dirname(executable), {recursive: true});
    fs.copyFileSync(await getNodeExecutable(platform), executable);
    fs.chmodSync(executable, 0o755);

    // Injecting invalidates Node's signature. On macOS, remove it and sign again
    // afterward (Apple Silicon won't run unsigned code; an ad-hoc signature is enough).
    // On Windows we'd need signtool, which only runs on Windows, so the executable
    // is left with an invalid signature, which Windows treats like an unsigned one.
    if (isMac) {
        execFileSync("codesign", ["--remove-signature", executable]);
    }
    await postject.inject(executable, "NODE_SEA_BLOB", blob, {
        sentinelFuse: SEA_FUSE,
        ...(isMac ? {machoSegmentName: "NODE_SEA"} : {}),
    });
    if (isMac) {
        execFileSync("codesign", ["--sign", "-", executable]);
    }
}

// Smoke test the executable for this machine.
const hostTarget = TARGETS.find(target => target.platform === hostPlatform);
if (hostTarget !== undefined) {
    const executable = path.join(DIST_DIR, hostTarget.output);
    const version = execFileSync(executable, ["--version"], {encoding: "utf8"}).trim();
    console.log(`${path.relative(PACKAGE_DIR, executable)} --version: ${version}`);
}
