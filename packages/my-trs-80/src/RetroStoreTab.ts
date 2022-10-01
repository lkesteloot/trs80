import * as RetroStoreProto from "retrostore-api";
import {clearElement} from "teamten-ts-utils";
import {makeIcon, makeIconButton} from "./Utils";
import {Context} from "./Context";
import {decodeTrs80File} from "trs80-base";
import {FileBuilder} from "./File";
import {PageTab} from "./PageTab";
import { ModelType } from "trs80-emulator";

const RETRO_STORE_API_URL = "https://retrostore.org/api/";

const APP_FETCH_COUNT = 10;

/**
 * Stores info about a RetroStore app and its media.
 */
class RetroStoreApp {
    public readonly app: RetroStoreProto.App;
    public element: HTMLElement | undefined = undefined;

    constructor(app: RetroStoreProto.App) {
        this.app = app;
    }
}

/**
 * Fetch all apps from RetroStore. If an error occurs, returns an empty list.
 */
function fetchApps(start: number, count: number): Promise<RetroStoreProto.App[]> {
    const query = "";
    const apiRequest = {
        start: start,
        num: count,
        query: query,
        trs80: {
            mediaTypes: [],
        },
    };
    const fetchOptions: RequestInit = {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify(apiRequest),
    };
    return fetch(RETRO_STORE_API_URL + "listApps", fetchOptions)
        .then(response => {
            if (response.status === 200) {
                return response.arrayBuffer();
            } else {
                throw new Error("Error code " + response.status);
            }
        })
        .then(array => {
            const apps = RetroStoreProto.decodeApiResponseApps(new Uint8Array(array));
            if (apps.success) {
                return Promise.resolve(apps.app ?? []);
            } else {
                // TODO.
                console.error("Can't get apps: " + apps.message);
                return Promise.resolve([]);
            }
        })
        .catch(error => {
            // TODO
            console.error(error);
            return Promise.resolve([]);
        });
}

/**
 * Fetch all media images for the specified app ID. If an error occurs, returns an empty list.
 */
function fetchMediaImages(appId: string): Promise<RetroStoreProto.MediaImage[]> {
    const apiRequest = {
        appId: appId,
    };
    const fetchOptions: RequestInit = {
        method: "POST",
        cache: "no-cache",
        body: JSON.stringify(apiRequest),
    };
    return fetch(RETRO_STORE_API_URL + "fetchMediaImages", fetchOptions)
        .then(response => {
            if (response.status === 200) {
                return response.arrayBuffer();
            } else {
                throw new Error("Error code " + response.status);
            }
        })
        .then(array => {
            const mediaImages = RetroStoreProto.decodeApiResponseMediaImages(new Uint8Array(array));
            if (mediaImages.success) {
                return Promise.resolve(mediaImages.mediaImage ?? []);
            } else {
                // TODO.
                console.error("Can't get media images for " + appId + ": " + mediaImages.message);
                return Promise.reject();
            }
        })
        .catch(error => {
            // TODO
            console.error(error);
            return Promise.reject();
        });
}

/**
 * The tab for showing apps from RetroStore.org.
 */
export class RetroStoreTab extends PageTab {
    private readonly context: Context;
    private readonly appsDiv: HTMLElement;
    private readonly moreDiv: HTMLElement;
    private readonly apps: RetroStoreApp[] = [];
    private complete = false;
    private fetching = false;

    constructor(context: Context) {
        super("RetroStore");

        this.context = context;

        this.element.classList.add("retro-store-tab");

        this.appsDiv = document.createElement("div");
        this.appsDiv.classList.add("retro-store-apps");
        this.appsDiv.addEventListener("scroll", () => this.fetchNextBatchIfNecessary());
        this.element.append(this.appsDiv);

        this.moreDiv = document.createElement("div");
        this.moreDiv.classList.add("retro-store-more");
        this.moreDiv.append(makeIcon("cached"));

        this.populateApps();

        // If the window is resized, it might reveal slots to load.
        window.addEventListener("resize", () => this.fetchNextBatchIfNecessary());
    }

    public onShow(): void {
        // When showing the tab, wait for layout and maybe fetch more.
        setTimeout(() => this.fetchNextBatchIfNecessary(), 0);
    }

    public onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === "d" && !e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            this.downloadByToken();
            return true;
        }
        if (e.key === "u" && !e.metaKey && !e.shiftKey && !e.ctrlKey && !e.altKey) {
            this.uploadByToken();
            return true;
        }
        return false;
    }

    /**
     * If the "More" section is visible, fetch more apps.
     */
    private fetchNextBatchIfNecessary(): void {
        const moreVisible = this.moreDiv.getBoundingClientRect().top < this.appsDiv.getBoundingClientRect().bottom;
        if (moreVisible && !this.complete && !this.fetching) {
            this.fetchNextBatch();
        }
    }

    /**
     * Get the next batch of apps if necessary.
     */
    private fetchNextBatch(): void {
        if (!this.complete) {
            this.fetching = true;
            fetchApps(this.apps.length, APP_FETCH_COUNT)
                .then(apps => {
                    this.fetching = false;
                    if (apps.length !== APP_FETCH_COUNT) {
                        // Got all apps.
                        this.complete = true;
                    }
                    this.apps.push(...apps.map(a => new RetroStoreApp(a)));
                    this.populateApps();

                    // See if we need to fetch any more.
                    this.fetchNextBatchIfNecessary();
                })
                .catch(error => {
                    // TODO.
                    console.error(error);
                    this.fetching = false;
                    this.complete = true;
                });
        }
    }

    /**
     * Populate the UI with the apps we have.
     */
    private populateApps(): void {
        clearElement(this.appsDiv);

        for (const app of this.apps) {
            if (app.element === undefined) {
                app.element = this.createAppTile(app.app);
            }
            this.appsDiv.append(app.element);
        }

        if (!this.complete) {
            this.appsDiv.append(this.moreDiv);
        }
    }

    /**
     * Create a tile for an app.
     */
    private createAppTile(app: RetroStoreProto.App): HTMLElement {
        const appDiv = document.createElement("div");
        appDiv.classList.add("retro-store-app");

        const screenshotDiv = document.createElement("img");
        screenshotDiv.classList.add("screenshot");
        if (app.screenshot_url !== undefined && app.screenshot_url.length > 0) {
            screenshotDiv.src = app.screenshot_url[0];
        }
        appDiv.append(screenshotDiv);

        const nameDiv = document.createElement("div");
        nameDiv.classList.add("name");
        const appName = app.name ?? "Unknown name";
        nameDiv.innerText = appName;
        if (app.release_year !== undefined) {
            const releaseYearSpan = document.createElement("span");
            releaseYearSpan.classList.add("release-year");
            releaseYearSpan.innerText = " (" + app.release_year + ")";
            nameDiv.append(releaseYearSpan);
        }
        appDiv.append(nameDiv);

        if (app.author !== undefined && app.author !== "") {
            const authorDiv = document.createElement("div");
            authorDiv.classList.add("author");
            authorDiv.innerText = app.author;
            appDiv.append(authorDiv);
        }

        if (app.version !== undefined && app.version !== "") {
            const versionDiv = document.createElement("div");
            versionDiv.classList.add("version");
            versionDiv.innerText = "Version " + app.version;
            appDiv.append(versionDiv);
        }

        if (app.description !== undefined && app.description !== "") {
            const descriptionDiv = document.createElement("div");
            descriptionDiv.classList.add("description");
            descriptionDiv.innerText = app.description;
            appDiv.append(descriptionDiv);
        }

        const buttonDiv = document.createElement("div");
        buttonDiv.classList.add("button-set");
        appDiv.append(buttonDiv);

        let validMediaImage: RetroStoreProto.MediaImage | undefined = undefined;
        const playButton = makeIconButton(makeIcon("play_arrow"), "Run app", () => {
            if (validMediaImage !== undefined && validMediaImage.data !== undefined) {
                const cmdProgram = decodeTrs80File(validMediaImage.data, validMediaImage.filename);
                // TODO should set context.runningFile
                this.context.trs80.runTrs80File(cmdProgram);
                this.context.panelManager.close();
            }
        });
        playButton.disabled = true;
        buttonDiv.append(playButton);
        const importButton = makeIconButton(makeIcon("get_app"), "Import app", () => {
            if (validMediaImage !== undefined && validMediaImage.data !== undefined && this.context.user !== undefined) {
                const noteParts: string[] = [];
                if (app.description !== undefined && app.description !== "") {
                    noteParts.push(app.description);
                }
                if (validMediaImage.description !== undefined && validMediaImage.description !== "") {
                    noteParts.push(validMediaImage.description);
                }
                noteParts.push("Imported from RetroStore.org.");
                const note = noteParts.join("\n\n");

                let file = new FileBuilder()
                    .withUid(this.context.user.uid)
                    .withName(appName)
                    .withNote(note)
                    .withAuthor(app.author ?? "")
                    .withReleaseYear(app.release_year === undefined ? "" : app.release_year.toString())
                    .withTags(["RetroStore"])
                    .withFilename(validMediaImage.filename ?? "UNKNOWN")
                    .withBinary(validMediaImage.data)
                    .build();

                this.context.db.addFile(file)
                    .then(docRef => {
                        file = file.builder().withId(docRef.id).build();
                        this.context.library.addFile(file);
                        this.context.openFilePanel(file);
                    })
                    .catch(error => {
                        // TODO
                        console.error("Error adding document: ", error);
                    });
            }
        });
        importButton.classList.add("import-button");
        importButton.disabled = true;
        buttonDiv.append(importButton);
        if (app.id !== undefined) {
            fetchMediaImages(app.id)
                .then(mediaImages => {
                    console.log(app.id, app.name, mediaImages);
                    for (const mediaImage of mediaImages) {
                        // Can't use the enum here because it's a "const enum", and the way we compile
                        // TS is one file at a time (probably transpile only?). So must hack it with
                        // a string that's cast.
                        if (mediaImage.type === "COMMAND" as RetroStoreProto.MediaType ||
                            mediaImage.type === "BASIC" as RetroStoreProto.MediaType ||
                            mediaImage.type === "DISK" as RetroStoreProto.MediaType) {

                            validMediaImage = mediaImage;
                            playButton.disabled = false;
                            importButton.disabled = false;
                            break;
                        }
                    }
                })
                .catch(error => {
                    // TODO. Caught already?
                    console.error(error);
                });
        }

        return appDiv;
    }

    /**
     * Run a program by downloading its state from the RetroStore.
     */
    private async downloadByToken(): Promise<void> {
        const token = prompt("What is the RetroStore token?");
        if (token === "" || token === null) {
            return;
        }

        const params = {
            token: {
                low: parseInt(token, 10),
                high: 0,
                unsigned: true,
            },
        };
        const response = await fetch("https://retrostore.org/api/downloadState", {
            method: "POST",
            body: RetroStoreProto.encodeDownloadSystemStateParams(params),
            mode: "cors",
            cache: "no-cache",
            redirect: "follow",
        });
        console.log(response);
        const arrayBuffer = await response.arrayBuffer();
        const x = RetroStoreProto.decodeApiResponseDownloadSystemState(new Uint8Array(arrayBuffer));
        console.log(x);
        if (x.success !== true || x.systemState === undefined) {
            console.log("Failed request");
            return;
        }

        const trs80 = this.context.trs80;

        for (const memoryRegion of x.systemState.memoryRegions ?? []) {
            const data = memoryRegion.data;
            if (data !== undefined) {
                const start = memoryRegion.start ?? 0;
                const length = data.length;

                for (let i = 0; i < length; i++) {
                    trs80.writeMemory(start + i, data[i]);
                }
            }
        }

        const regs = x.systemState.registers;
        if (regs !== undefined) {
            trs80.z80.regs.ix = regs.ix ?? 0;
            trs80.z80.regs.iy = regs.iy ?? 0;
            trs80.z80.regs.pc = regs.pc ?? 0;
            trs80.z80.regs.sp = regs.sp ?? 0;
            trs80.z80.regs.af = regs.af ?? 0;
            trs80.z80.regs.bc = regs.bc ?? 0;
            trs80.z80.regs.de = regs.de ?? 0;
            trs80.z80.regs.hl = regs.hl ?? 0;
            trs80.z80.regs.afPrime = regs.af_prime ?? 0;
            trs80.z80.regs.bcPrime = regs.bc_prime ?? 0;
            trs80.z80.regs.dePrime = regs.de_prime ?? 0;
            trs80.z80.regs.hlPrime = regs.hl_prime ?? 0;
            trs80.z80.regs.i = regs.i ?? 0;

            // TODO not in RetroStore state.
            trs80.z80.regs.memptr = 0;
            trs80.z80.regs.r = 0;  // Low 7 bits of R.
            trs80.z80.regs.r7 = 0; // Bit 7 of R.
            trs80.z80.regs.iff1 = 0;
            trs80.z80.regs.iff2 = 0;
            trs80.z80.regs.im = 0;
            trs80.z80.regs.halted = 0;
        }

        // TODO change model.

        this.context.panelManager.close();
    }

    /**
     * Upload current state to RetroStore.
     */
    private async uploadByToken(): Promise<void> {
        const trs80 = this.context.trs80;

        // Get memory.
        const length = 64*1024;
        const memory = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            memory[i] = trs80.readMemory(i);
        }

        // Get model type.
        let model: RetroStoreProto.Trs80Model;
        switch (trs80.getConfig().modelType) {
            case ModelType.MODEL1:
                // Can't use the enum here because it's a "const enum", and the way we compile
                // TS is one file at a time (probably transpile only?). So must hack it with
                // a string that's cast.
                model = "MODEL_I" as RetroStoreProto.Trs80Model;
                break;

            case ModelType.MODEL3:
            default:
                model = "MODEL_III" as RetroStoreProto.Trs80Model;
                break;

            case ModelType.MODEL4:
                model = "MODEL_4" as RetroStoreProto.Trs80Model;
                break;
        }

        const params: RetroStoreProto.UploadSystemStateParams = {
            state: {
                model: model,
                registers: {
                    ix: trs80.z80.regs.ix,
                    iy: trs80.z80.regs.iy,
                    pc: trs80.z80.regs.pc,
                    sp: trs80.z80.regs.sp,
                    af: trs80.z80.regs.af,
                    bc: trs80.z80.regs.bc,
                    de: trs80.z80.regs.de,
                    hl: trs80.z80.regs.hl,
                    af_prime: trs80.z80.regs.afPrime,
                    bc_prime: trs80.z80.regs.bcPrime,
                    de_prime: trs80.z80.regs.dePrime,
                    hl_prime: trs80.z80.regs.hlPrime,
                    i: trs80.z80.regs.i,
                },
                memoryRegions: [
                    {
                        start: 0,
                        length: 1024*64,
                        data: memory,
                    },
                ],
            },
        };
        console.log(params);
        const response = await fetch("https://retrostore.org/api/uploadState", {
            method: "POST",
            body: RetroStoreProto.encodeUploadSystemStateParams(params),
            mode: "cors",
            cache: "no-cache",
            redirect: "follow",
        });
        console.log(response);
        const arrayBuffer = await response.arrayBuffer();
        const x = RetroStoreProto.decodeApiResponseUploadSystemState(new Uint8Array(arrayBuffer));
        console.log(x);
        if (x.token !== undefined) {
            alert("Token is " + x.token.low);
        }
    }
}
