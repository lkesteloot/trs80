import Navigo from "navigo";
import {createHome} from "./Home";
import {CanvasScreen, Cassette, ControlPanel, PanelType, ProgressBar, SettingsPanel, Trs80} from "trs80-emulator";
import {CmdProgram} from "trs80-base";
import firebase from 'firebase/app';
import * as base64 from 'base64-arraybuffer';
// These imports load individual services into the firebase namespace.
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/analytics';
import QueryDocumentSnapshot = firebase.firestore.QueryDocumentSnapshot;
import DocumentData = firebase.firestore.DocumentData;

const CLOSE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
    <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
</svg>`;

// https://thenounproject.com/term/arrow/1256499
const BACK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 23 64 54" width="18" height="18">
    <path d="M81,50a4,4,0,0,0-4-4H33.13L49.39,30.84A4,4,0,1,0,43.93,25L20.24,47.07a4,4,0,0,0,0,5.85L43.93,75a4,4,0,0,0,5.46-5.85L33.13,54H77A4,4,0,0,0,81,50Z"/>
</svg>`;

// https://thenounproject.com/term/arrow/1256499
const FORWARD_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 23 64 54" width="18" height="18">
    <g transform="translate(50, 50) rotate(180) translate(-50, -50)">
        <path d="M81,50a4,4,0,0,0-4-4H33.13L49.39,30.84A4,4,0,1,0,43.93,25L20.24,47.07a4,4,0,0,0,0,5.85L43.93,75a4,4,0,0,0,5.46-5.85L33.13,54H77A4,4,0,0,0,81,50Z"/>
    </g>
</svg>`;

// https://thenounproject.com/term/play/1914265
const PLAY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 15 64 70" width="18" height="18">
    <g transform="translate(0,-952.36218)">
        <path d="m 18,1028.9228 c 0.14842,6.5177 6.82362,10.4644 12.67182,7.3615 l 47.0288,-26.6902 C 80.26202,1008.1385 82,1005.4715 82,1002.346 c 0,-3.12559 -1.73798,-5.79259 -4.29938,-7.24819 l -47.0288,-26.65233 c -5.8482,-3.1029 -12.5234,0.806 -12.67182,7.3237 z"/>
    </g>
</svg>
`;

function configureRoutes() {
    const body = document.querySelector("body") as HTMLElement;
    const router = new Navigo(null, true, "#!");
    const s = createHome(router);
    s.classList.add("screen");
    body.appendChild(s);
    router.resolve();
}

class EmptyCassette extends Cassette {
    // Nothing to do.
}

/**
 * Make a generic round button.
 */
function makeButton(svg: string, clickCallback: () => void) {
    const button = document.createElement("div");
    button.classList.add("button");
    button.innerHTML = svg;
    button.addEventListener("click", clickCallback);

    return button;
}

/**
 * Make a float-right close button for dialog boxes.
 */
function makeCloseButton(closeCallback: () => void) {
    const button = makeButton(CLOSE_SVG, closeCallback);
    button.classList.add("close-button");

    return button;
}

/**
 * Represents a file that the user owns.
 */
class File {
    public readonly id: string;
    public readonly uid: string;
    public readonly name: string;
    public readonly filename: string;
    public readonly note: string;
    public readonly shared: boolean;
    public readonly hash: string;
    public readonly binary: Uint8Array;
    public readonly dateAdded: Date;
    public readonly dateModified: Date;

    constructor(doc: QueryDocumentSnapshot<DocumentData>) {
        this.id = doc.id;

        const data = doc.data();
        this.uid = data.uid;
        this.name = data.name;
        this.filename = data.filename;
        this.note = data.note;
        this.shared = data.shared ?? false;
        this.hash = data.hash;
        this.binary = (data.binary as firebase.firestore.Blob).toUint8Array();
        this.dateAdded = (data.dateAdded as firebase.firestore.Timestamp).toDate();
        this.dateModified = (data.dateModified as firebase.firestore.Timestamp).toDate();
    }

    public static compare(a: File, b: File): number {
        if (a.name < b.name) {
            return -1;
        } else if (a.name > b.name) {
            return 1;
        }

        if (a.id < b.id) {
            return -1;
        } else if (a.id > b.id) {
            return 1;
        } else {
            // Shouldn't happen.
            return 0;
        }
    }
}

/**
 * The library of user's files.
 */
class Library {
    private readonly backgroundNode: HTMLElement;
    private readonly trs80: Trs80;
    private readonly positioningNode: HTMLElement;
    private readonly libraryNode: HTMLElement;
    private readonly escListener: (e: KeyboardEvent) => void;
    private readonly screens: HTMLElement[] = [];
    private trs80WasStarted = false;

    constructor(parent: HTMLElement, trs80: Trs80, db: firebase.firestore.Firestore) {
        this.backgroundNode = document.createElement("div");
        this.trs80 = trs80;

        // Handler for the ESC key.
        this.escListener = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                this.close();
            }
        };

        this.backgroundNode.classList.add("popup-background");
        this.backgroundNode.addEventListener("click", e => {
            if (e.target === this.backgroundNode) {
                this.close();
                e.preventDefault();
                e.stopPropagation();
            }
        });
        parent.appendChild(this.backgroundNode);

        this.positioningNode = document.createElement("div");
        this.positioningNode.classList.add("popup-positioning");
        this.backgroundNode.appendChild(this.positioningNode);

        this.libraryNode = document.createElement("div");
        this.libraryNode.classList.add("popup-content");
        this.libraryNode.classList.add("library");
        this.positioningNode.appendChild(this.libraryNode);

        const header = document.createElement("h1");
        header.innerText = "Library";
        header.appendChild(makeCloseButton(() => this.close()));
        this.libraryNode.appendChild(header);

        const programsDiv = document.createElement("div");
        programsDiv.classList.add("programs");
        this.libraryNode.appendChild(programsDiv);

        db.collection("files").get().then((querySnapshot) => {
            const files = querySnapshot.docs.map(d => new File(d));
            files.sort(File.compare);
            for (const file of files) {
                this.addFile(programsDiv, file);
            }
        });

        this.pushScreen(this.libraryNode);
    }

    private showItemInfo(file: File): void {
        const itemNode = document.createElement("div");
        itemNode.classList.add("popup-content");
        itemNode.classList.add("library");
        this.positioningNode.appendChild(itemNode);

        const header = document.createElement("h1");
        const backButton = makeButton(BACK_SVG, () => this.popScreen());
        backButton.classList.add("back-button");
        header.appendChild(backButton);
        header.appendChild(makeCloseButton(() => this.close()));
        header.appendChild(document.createTextNode(file.name));
        itemNode.appendChild(header);

        this.pushScreen(itemNode);
    }

    private pushScreen(screen: HTMLElement): void {
        this.screens.push(screen);
        this.positionScreens(this.screens, this.screens.length - 2);
        setTimeout(() => {
            this.positionScreens(this.screens, this.screens.length - 1);
        }, 0);
    }

    private popScreen(): void {
        this.positionScreens(this.screens, this.screens.length - 2);
        const screen = this.screens.pop();
        setTimeout(() => {
            if (screen !== undefined) {
                screen.remove();
            }
        }, 1000);
    }

    private positionScreens(screens: HTMLElement[], active: number): void {
        for (let i = 0; i < screens.length; i++) {
            const screen = screens[i];
            const offset = (i - active)*100;

            screen.style.left = offset + "vw";
            screen.style.right = -offset + "vw";
        }
    }

    public open(): void {
        document.addEventListener("keydown", this.escListener);
        this.trs80WasStarted = this.trs80.stop();
        this.backgroundNode.classList.add("popup-shown");
    }

    public close(): void {
        document.removeEventListener("keydown", this.escListener);
        if (this.trs80WasStarted) {
            this.trs80.start();
        }
        this.backgroundNode.classList.remove("popup-shown");
    }

    private addFile(parent: HTMLElement, file: File): void {
        const programDiv = document.createElement("div");
        programDiv.classList.add("program");
        parent.appendChild(programDiv);

        const infoButton = makeButton(FORWARD_SVG, () => {
            if (this.screens.length === 1) {
                this.showItemInfo(file);
            }
        });
        infoButton.classList.add("info-button");
        programDiv.appendChild(infoButton);

        const playButton = makeButton(PLAY_SVG, () => {
            const cmdProgram = new CmdProgram(file.binary);
            if (cmdProgram.error !== undefined) {
                // TODO
            } else {
                this.trs80.runCmdProgram(cmdProgram);
                this.close();
            }
        });
        playButton.classList.add("play-button");
        programDiv.appendChild(playButton);

        const nameDiv = document.createElement("div");
        nameDiv.classList.add("name");
        nameDiv.innerText = file.name;
        programDiv.appendChild(nameDiv);

        const filenameDiv = document.createElement("div");
        filenameDiv.classList.add("filename");
        filenameDiv.innerText = file.filename;
        programDiv.appendChild(filenameDiv);

        const noteDiv = document.createElement("div");
        noteDiv.classList.add("note");
        noteDiv.innerText = file.note;
        programDiv.appendChild(noteDiv);
    }
}

function addProgramToFirestore(db: firebase.firestore.Firestore, name: string, url: string, note: string) {
    fetch(url)
        .then(response => response.arrayBuffer())
        .then(arrayBuffer =>
            db.collection("files").add({
                uid: "",
                name: name,
                filename: url.split("/").pop(),
                note: note,
                public: false,
                hash: "",
                binary: firebase.firestore.Blob.fromUint8Array(new Uint8Array(arrayBuffer)),
                dateAdded: firebase.firestore.Timestamp.fromDate(new Date()),
                dateModified: firebase.firestore.Timestamp.fromDate(new Date()),
            }))
        .then(function (docRef) {
            console.log("Document written with ID: ", docRef.id);
        })
        .catch(function (error) {
            console.error("Error adding document: ", error);
        });
}

export function main() {
    const app = firebase.initializeApp({
        apiKey: "AIzaSyAfGZY9BaDUmy4qNtg11JHd_kLd1JmgdBI",
        authDomain: "my-trs-80.firebaseapp.com",
        projectId: "my-trs-80",
        storageBucket: "my-trs-80.appspot.com",
        messagingSenderId: "438103442091",
        appId: "1:438103442091:web:0fe42c43917ba1add52dee"
    });
    firebase.analytics();

    const db = firebase.firestore();

    if (false) {
        addProgramToFirestore(db, "Breakdown", "tmp/BREAKDWN.CMD", "Breakout-like game from pski.");
        addProgramToFirestore(db, "Memtest", "tmp/MEMTEST.CMD", "Standard MEMTEST program from TRS-DOS.");
        addProgramToFirestore(db, "Armored Patrol", "tmp/ARMOR.CMD", "Space shoot-em-up.");
        addProgramToFirestore(db, "Ghosts", "tmp/GHOSTS.CMD", "Doesn't seem to work.");
    }

    const body = document.querySelector("body") as HTMLElement;

    const screenDiv = document.createElement("div");
    screenDiv.classList.add("main-computer-screen");
    body.appendChild(screenDiv);

    const screen = new CanvasScreen(screenDiv, false);
    let cassette = new EmptyCassette();
    const trs80 = new Trs80(screen, cassette);

    const reboot = () => {
        trs80.reset();
        trs80.start();
    };

    const hardwareSettingsPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.HARDWARE);
    const viewPanel = new SettingsPanel(screen.getNode(), trs80, PanelType.VIEW);
    const controlPanel = new ControlPanel(screen.getNode());
    controlPanel.addResetButton(reboot);
    controlPanel.addTapeRewindButton(() => {
        // cassette.rewind();
    });
    /*
    if (program !== undefined) {
        controlPanel.addScreenshotButton(() => {
            const screenshot = trs80.getScreenshot();
            program.setScreenshot(screenshot);
            this.tape.saveUserData();
        });
    }*/
    controlPanel.addSettingsButton(hardwareSettingsPanel);
    controlPanel.addSettingsButton(viewPanel);
    const progressBar = new ProgressBar(screen.getNode());
    // cassette.setProgressBar(progressBar);

    const library = new Library(body, trs80, db);

    const libraryButton = document.createElement("button");
    libraryButton.innerText = "Library";
    libraryButton.addEventListener("click", () => library.open());
    body.appendChild(libraryButton);

    reboot();
}
