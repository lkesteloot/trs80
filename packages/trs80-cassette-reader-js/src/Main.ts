import {Decoder} from "./Decoder";
import {Tape} from "./Tape";
import {TapeBrowser} from "./TapeBrowser";
import {Uploader} from "./Uploader";
import Split from "split.js";
import {AudioFile} from "./AudioUtils";
import {clearElement, flashNode} from "./Utils";
import {CanvasScreen} from "trs80-emulator";
import {TestFile, TestType} from "./Test";
import {readWavFile} from "./WavFile";
import {WaveformDisplay} from "./WaveformDisplay";
import {LowSpeedAnteoTapeDecoder, PulseResultType} from "./LowSpeedAnteoTapeDecoder";
import {HighSpeedTapeDecoder} from "./HighSpeedTapeDecoder";

function nameFromPathname(pathname: string): string {
    let name = pathname;

    // Keep only last component.
    let pos = name.lastIndexOf("/");
    if (pos >= 0) {
        name = name.substr(pos + 1);
    }

    // Remove extension.
    pos = name.lastIndexOf(".");
    if (pos >= 0) {
        name = name.substr(0, pos);
    }

    return name;
}

/**
 * Show the screen with the specified ID, hide the rest.
 * @return the shown element.
 */
function showScreen(screenId: string): HTMLElement {
    const allScreens = document.getElementsByClassName("screen");

    let shownScreen: HTMLElement | undefined = undefined;

    for (const screen of allScreens) {
        if (screen.id === screenId) {
            screen.classList.remove("hidden");
            shownScreen = screen as HTMLElement;
        } else {
            screen.classList.add("hidden");
        }
    }

    if (shownScreen === undefined) {
        throw new Error("Cannot find screen " + screenId);
    }

    return shownScreen;
}

/**
 * Show the user data.
 */
function populateBrowseScreen(browseScreen: HTMLElement): void {
    clearElement(browseScreen);

    const data = Tape.loadAllData();

    for (const tapeData of data.tapes) {
        const h1 = document.createElement("h1");
        h1.textContent = tapeData.name;
        browseScreen.appendChild(h1);
        if (tapeData.notes) {
            const p = document.createElement("p");
            p.textContent = tapeData.notes;
            browseScreen.appendChild(p);
        }

        for (const programData of tapeData.programs) {
            const h2 = document.createElement("h2");
            h2.textContent = programData.name || "Untitled";
            browseScreen.appendChild(h2);

            if (programData.notes) {
                const p = document.createElement("p");
                p.textContent = programData.notes;
                browseScreen.appendChild(p);
            }

            if (programData.screenshot) {
                const div = document.createElement("div");
                browseScreen.appendChild(div);
                const screen = new CanvasScreen(div, false);
                screen.displayScreenshot(programData.screenshot);
            }
        }
    }
}

/**
 * Show the export/import panel and the appropriate set of buttons.
 */
function showExportImport(action: "import" | "export"): void {
    const exportImport = document.getElementById("export_import") as HTMLDivElement;
    exportImport.classList.remove("hidden");

    // Hide all button groups.
    for (const buttonGroup of exportImport.getElementsByClassName("button_group")) {
        buttonGroup.classList.add("hidden");
    }

    // Show our button group.
    const buttonGroup = document.getElementById(action == "export" ? "export_buttons" : "import_buttons") as HTMLElement;
    buttonGroup.classList.remove("hidden");
}

function showExportData(): void {
    showExportImport("export");
    const textArea = document.getElementById("user_data_field") as HTMLTextAreaElement;
    textArea.placeholder = "";
    textArea.value = Tape.getAllDataAsJson();
    textArea.select();
}

function showImportData(): void {
    showExportImport("import");
    const textArea = document.getElementById("user_data_field") as HTMLTextAreaElement;
    textArea.value = "";
    textArea.placeholder = "Paste exported data here, then click “Import”.";
    textArea.focus();
}

function copyToClipboard(): void {
    const textArea = document.getElementById("user_data_field") as HTMLTextAreaElement;
    textArea.select();
    document.execCommand("copy");

    const exportImport = document.getElementById("export_import") as HTMLDivElement;
    flashNode(exportImport);
}

function importData(): void {
    const textArea = document.getElementById("user_data_field") as HTMLTextAreaElement;
    if (textArea) {
        Tape.saveAllDataAsJson(textArea.value);

        const exportImport = document.getElementById("export_import") as HTMLDivElement;
        flashNode(exportImport);
    }
}

function handleAudioBuffer(pathname: string, audioFile: AudioFile) {
    // console.log("Audio is " + audioFile.rate + " Hz");
    // TODO check that there's 1 channel.

    const tape = new Tape(nameFromPathname(pathname), audioFile);
    const decoder = new Decoder(tape);
    decoder.decode();
    tape.listenForStorageChanges();
    tape.loadUserData();
    const tapeBrowser = new TapeBrowser(tape,
        document.getElementById("waveforms") as HTMLElement,
        document.getElementById("original_canvas") as HTMLCanvasElement,
        document.getElementById("filtered_canvas") as HTMLCanvasElement,
        document.getElementById("low_speed_canvas") as HTMLCanvasElement,
        document.getElementById("tape_contents") as HTMLElement,
        document.getElementById("top_data") as HTMLElement);

    // Switch screens.
    showScreen("data_screen");

    /*
    const loadAnotherButton = document.getElementById("load_another_button") as HTMLButtonElement;
    loadAnotherButton.onclick = () => {
        showScreen("drop_screen");
        if (uploader !== undefined) {
            uploader.reset();
        }
    };
    */

    Split(["#data_screen > nav", "#data_screen > main"], {
        sizes: [20,80],
        minSize: [200, 200],
        snapOffset: 0,
    });
    Split(["#top_data", "#waveforms"], {
        sizes: [50,50],
        minSize: [100, 100],
        snapOffset: 0,
        direction: "vertical",
    });
}

// https://stackoverflow.com/a/6234804/211234
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Makes a pill to show pass or fail for a test.
 */
function makePassFailLabel(pass: boolean): HTMLElement {
    const result = document.createElement("span");
    result.classList.add("test_result");
    if (pass) {
        result.innerText = "Pass";
        result.classList.add("test_pass");
    } else {
        result.innerText = "Fail";
        result.classList.add("test_fail");
    }

    return result;
}

function runTests(parent: HTMLElement, testFile: TestFile): void {
    if (testFile.name !== undefined) {
        const pageHeader = document.createElement("h2");
        pageHeader.innerText = testFile.name;
        parent.appendChild(pageHeader);
    }

    for (const test of testFile.tests) {
        const testResult = document.createElement("div");
        testResult.classList.add("test");
        parent.append(testResult);

        const url = new URL(test.wavUrl, testFile.url).href;
        fetch(url, {cache: "reload"})
            .then(response => {
                if (response.ok) {
                    return response.arrayBuffer();
                }
                throw new Error(response.statusText);
            })
            .then(arrayBuffer => {
                const wavFile = readWavFile(arrayBuffer);
                const tape = new Tape(url, wavFile);
                const waveformDisplay = new WaveformDisplay(wavFile.rate);

                const title = document.createElement("span");
                title.innerText = test.name;

                const header = document.createElement("div");
                header.appendChild(title);
                header.classList.add("test_header");
                testResult.append(header);

                const panel = document.createElement("div");
                panel.classList.add("expandable_panel");
                testResult.append(panel);

                const explanation = document.createElement("p");
                panel.append(explanation);

                header.addEventListener("click", () => {
                    testResult.classList.toggle("expanded");
                });

                WaveformDisplay.makeWaveformDisplay("Original samples", tape.originalSamples, panel, waveformDisplay);
                if (test.isHighSpeed()) {
                    WaveformDisplay.makeWaveformDisplay("High pass filter", tape.filteredSamples, panel, waveformDisplay);
                } else {
                    WaveformDisplay.makeWaveformDisplay("Low speed filter", tape.lowSpeedSamples, panel, waveformDisplay);
                }

                let pass: boolean;
                switch (test.type) {
                    case TestType.LOW_SPEED_PULSE:
                    case TestType.LOW_SPEED_NO_PULSE: {
                        const decoder = new LowSpeedAnteoTapeDecoder(tape);
                        const pulse = decoder.isPulseAt(Math.round(wavFile.samples.length / 2), true);
                        waveformDisplay.addWaveformAnnotations(pulse.waveformAnnotations);
                        if (pulse.explanation !== "") {
                            explanation.innerText = pulse.explanation;
                        } else {
                            explanation.remove();
                        }
                        pass = pulse.resultType === PulseResultType.PULSE === (test.type === TestType.LOW_SPEED_PULSE);
                        break;
                    }

                    case TestType.LOW_SPEED_BITS:
                    case TestType.HIGH_SPEED_BITS: {
                        const decoder = test.type === TestType.LOW_SPEED_BITS
                            ? new LowSpeedAnteoTapeDecoder(tape)
                            : new HighSpeedTapeDecoder(tape);
                        const [actualBits, waveformAnnotations, explanations] = decoder.readBits(0);
                        if (test.bin === undefined) {
                            // We don't yet support binUrl.
                            throw new Error("must define bin for bits test");
                        }
                        const expectBits = test.bin.replace(/ /g, "");
                        waveformDisplay.addWaveformAnnotations(waveformAnnotations);
                        pass = actualBits === expectBits;
                        if (!pass) {
                            explanations.unshift("Expected " + expectBits + " but got " + actualBits + ".");
                        }
                        if (explanations.length === 0) {
                            explanation.remove();
                        } else {
                            let html = "";
                            for (const e of explanations) {
                                if (html !== "") {
                                    html += "<br>";
                                }
                                html += escapeHtml(e);
                            }
                            explanation.innerHTML = html;
                        }
                        break;
                    }
                }

                header.appendChild(makePassFailLabel(pass));
            })
            .catch(reason => {
                const title = document.createElement("span");
                title.innerText = test.name + " (" + reason + ")";

                const header = document.createElement("div");
                header.appendChild(title);
                // header.classList.add("test_header");
                testResult.append(header);

                header.appendChild(makePassFailLabel(false));
            });
    }
    for (const include of testFile.includes) {
        const testFileDiv = document.createElement("div");
        parent.appendChild(testFileDiv);

        loadTestFile(testFileDiv, include, testFile.url);
    }
}

function loadTestFile(parent: HTMLElement, relativeUrl: string, parentUrl: string): void {
    const url = new URL(relativeUrl, parentUrl).href;
    fetch(url, {cache: "reload"})
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            throw new Error(response.statusText);
        })
        .then(json => {
            runTests(parent, new TestFile(url, json));
        })
        .catch(reason => {
            const title = document.createElement("span");
            title.innerText = url + " (" + reason + ")";

            const header = document.createElement("div");
            header.appendChild(title);
            // header.classList.add("test_header");
            parent.append(header);

            header.appendChild(makePassFailLabel(false));
        });
}

/**
 * Show the test screen and start loading the test JSON file.
 */
function showTestScreen(): void {
    const screen = showScreen("test_screen");
    clearElement(screen);

    const pageHeader = document.createElement("h1");
    pageHeader.innerText = "Test Results";
    screen.appendChild(pageHeader);

    loadTestFile(screen, "tests/tests.json", document.baseURI);
}

/**
 * Handle the browser's back and forward history buttons.
 */
function handleNewLocation() {
    const hash = window.location.hash;

    switch (hash) {
        case "":
        case "#":
        default:
            showScreen("drop_screen");
            break;

        case "#test":
            showTestScreen();
            break;
    }
}

export function main() {
    showScreen("drop_screen");

    // Configure uploading box.
    const dropZone = document.getElementById("drop_zone") as HTMLElement;
    const dropUpload = document.getElementById("drop_upload") as HTMLInputElement;
    const dropS3 = document.querySelectorAll("#test_files button");
    const dropProgress = document.getElementById("drop_progress") as HTMLProgressElement;
    const uploader = new Uploader(dropZone, dropUpload, dropS3, dropProgress, handleAudioBuffer);

    // Configure action buttons.
    const exportDataButton = document.getElementById("export_data_button") as HTMLButtonElement;
    const importDataButton = document.getElementById("import_data_button") as HTMLButtonElement;
    const browseDataButton = document.getElementById("browse_data_button") as HTMLButtonElement;
    const runTestsButton = document.getElementById("run_tests_button") as HTMLButtonElement;
    const copyToClipboardButton = document.getElementById("copy_to_clipboard_button") as HTMLButtonElement;
    const importButton = document.getElementById("import_button") as HTMLButtonElement;

    exportDataButton.addEventListener("click", event => showExportData());
    importDataButton.addEventListener("click", event => showImportData());
    browseDataButton.addEventListener("click", event => {
        const browseScreen = showScreen("browse_screen");
        populateBrowseScreen(browseScreen);
    });
    runTestsButton.addEventListener("click", () => window.location.href = "#test");

    copyToClipboardButton.addEventListener("click", event => copyToClipboard());
    importButton.addEventListener("click", event => importData());

    window.addEventListener("popstate", handleNewLocation);
}
