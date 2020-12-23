// Generate this with: npx pbjs ApiProtos.proto --ts RetroStoreProto.ts
import * as RetroStoreProto from "./RetroStoreProto";
import {PageTabs} from "./PageTabs";
import {clearElement} from "teamten-ts-utils";
import {makeIcon, makeIconButton} from "./Utils";
import {Context} from "./Context";
import {decodeTrs80File} from "trs80-base";
import {FileBuilder} from "./File";

const RETRO_STORE_API_URL = "https://retrostore.org/api/";

/**
 * Fetch all apps from RetroStore. If an error occurs, returns an empty list.
 */
function fetchApps(): Promise<RetroStoreProto.App[]> {
    const start = 0;
    const num = 10;
    const query = "";
    const apiRequest = {
        start: start,
        num: num,
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
 * The tab for showing apps from RetroStore.org.
 */
export class RetroStoreTab {
    private readonly context: Context;
    private readonly appsDiv: HTMLElement;

    constructor(pageTabs: PageTabs, context: Context) {
        this.context = context;

        const tab = pageTabs.newTab("RetroStore");
        tab.element.classList.add("retro-store-tab");

        this.appsDiv = document.createElement("div");
        this.appsDiv.classList.add("retro-store-apps");
        tab.element.append(this.appsDiv);

        fetchApps()
            .then(apps => {
                this.populateApps(apps);
            })
            .catch(error => {
                // TODO. We already catch errors in fetchApps.
                console.error(error);
            });
    }

    /**
     * Populate the UI with a list of apps.
     */
    private populateApps(apps: RetroStoreProto.App[]): void {
        clearElement(this.appsDiv);

        for (const app of apps) {
            this.addApp(app);
        }
    }

    /**
     * Add a specific app to the UI.
     */
    private addApp(app: RetroStoreProto.App): void {
        const appDiv = document.createElement("div");
        appDiv.classList.add("retro-store-app");
        this.appsDiv.append(appDiv);

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
                const cmdProgram = decodeTrs80File(validMediaImage.data);
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
                        if (mediaImage.type === RetroStoreProto.MediaType.COMMAND ||
                            mediaImage.type === RetroStoreProto.MediaType.BASIC) {

                            validMediaImage = mediaImage;
                            playButton.disabled = false;
                            importButton.disabled = false;
                        }
                    }
                })
                .catch(error => {
                    // TODO. Caught already?
                    console.error(error);
                });
        }
    }
}
