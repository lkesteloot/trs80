import * as RetroStoreProto from "retrostore-api";
import {clearElement} from "teamten-ts-utils";
import {makeIcon, makeIconButton, reportError} from "./Utils";
import {Context} from "./Context";
import {decodeTrs80File, DecodeTrs80FileOptions} from "trs80-base";
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
 * Converts a RetroStore model to our own model, defaulting to Model III.
 */
function trs80ModelToModelType(trs80Model?: RetroStoreProto.Trs80Model): ModelType {
    if (trs80Model === undefined) {
        return ModelType.MODEL3;
    }

    switch (trs80Model) {
        case RetroStoreProto.Trs80Model.MODEL_I:
            return ModelType.MODEL1;

        case RetroStoreProto.Trs80Model.UNKNOWN_MODEL:
        case RetroStoreProto.Trs80Model.MODEL_III:
            return ModelType.MODEL3;

        case RetroStoreProto.Trs80Model.MODEL_4:
        case RetroStoreProto.Trs80Model.MODEL_4P:
            return ModelType.MODEL4;
    }

    return ModelType.MODEL3;
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
                const options: DecodeTrs80FileOptions = {};
                if ("filename" in validMediaImage) {
                    options.filename = validMediaImage.filename;
                }
                const cmdProgram = decodeTrs80File(validMediaImage.data, options);
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
                    .withModelType(trs80ModelToModelType(app.ext_trs80?.model))
                    .withBinary(validMediaImage.data)
                    .build();

                this.context.db.addFile(file)
                    .then(docRef => {
                        file = file.builder().withId(docRef.id).build();
                        this.context.library.addFile(file);
                        this.context.openFilePanel(file);
                    })
                    .catch(error => {
                        reportError("Couldn't add the file to your library.", error);
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
}
