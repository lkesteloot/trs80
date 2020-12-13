import Navigo from "navigo";
import {createHome} from "./Home";
import {CanvasScreen, Cassette, ControlPanel, PanelType, ProgressBar, SettingsPanel, Trs80} from "trs80-emulator";
import firebase from 'firebase/app';
// These imports load individual services into the firebase namespace.
import 'firebase/auth';
import 'firebase/firestore';
import 'firebase/analytics';
import {makeIcon, makeIconButton} from "./Utils";
import {PanelManager} from "./PanelManager";
import {LibraryPanel} from "./LibraryPanel";
import {Context} from "./Context";
import {Library} from "./Library";
import {FileBuilder} from "./File";

function configureRoutes() {
    const body = document.querySelector("body") as HTMLElement;
    const router = new Navigo(null, true, "#!");
    const s = createHome(router);
    body.append(s);
    router.resolve();
}

class EmptyCassette extends Cassette {
    // Nothing to do.
}

function createNavbar(openLibrary: () => void): HTMLElement {
    const navbar = document.createElement("div");
    navbar.classList.add("navbar");

    const title = document.createElement("span");
    title.textContent = "My TRS-80";
    navbar.append(title);

    const libraryButton = makeIconButton(makeIcon("folder_open"), "Open library (Ctrl-L)", openLibrary);
    navbar.append(libraryButton);

    const themeButton = makeIconButton(makeIcon("brightness_medium"), "Toggle theme", () => {
        const body = document.querySelector("body") as HTMLElement;

        body.classList.toggle("light-mode");
        body.classList.toggle("dark-mode");
    });
    navbar.append(themeButton);

    return navbar;
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

    const panelManager = new PanelManager();
    const library = new Library();

    const navbar = createNavbar(() => panelManager.open());
    const screenDiv = document.createElement("div");
    screenDiv.classList.add("main-computer-screen");

    const screen = new CanvasScreen(1.5);
    screenDiv.append(screen.getNode());
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
    controlPanel.addSettingsButton(hardwareSettingsPanel);
    controlPanel.addSettingsButton(viewPanel);
    // const progressBar = new ProgressBar(screen.getNode());
    // cassette.setProgressBar(progressBar);

    const body = document.querySelector("body") as HTMLElement;
    body.append(navbar);
    body.append(screenDiv);

    let wasTrs80Started = false;
    panelManager.onOpenClose.subscribe(isOpen => {
        if (isOpen) {
            wasTrs80Started = trs80.stop();
        } else {
            if (wasTrs80Started) {
                trs80.start();
            }
        }
    });

    document.addEventListener("keydown", event => {
        if (event.ctrlKey && event.key === "l") {
            panelManager.toggle();
        }
    });

    reboot();

    const context = new Context(library, trs80, db, panelManager);

    // TODO make this button appear and disappear as we have/not have a program.
    controlPanel.addScreenshotButton(() => {
        if (context.runningFile !== undefined) {
            let file = context.runningFile;
            const screenshot = trs80.getScreenshot();
            const screenshots = [...file.screenshots, screenshot];
            file = file.builder().withScreenshots(screenshots).withDateModified(new Date()).build();
            context.db.collection("files").doc(file.id)
                .update(file.getUpdateDataComparedTo(context.runningFile))
                .then(() => {
                    context.library.modifyFile(file);
                })
                .catch(() => {
                    // TODO.
                });
        }
    });

    const libraryPanel = new LibraryPanel(context);
    panelManager.pushPanel(libraryPanel);

    // Fetch all files.
    context.db.collection("files").get().then((querySnapshot) => {
        for (const doc of querySnapshot.docs) {
            const file = FileBuilder.fromDoc(doc).build();
            library.addFile(file);
        }
    });
}
