import {breakdwn} from "./breakdwn";
import {scarfman} from "./scarfman";
import {createMenubar, getMenuEntryById, isMenuCommand, isMenuParent, Menu, MenuCommand} from "./Menubar";
import {downloadFromRetroStore, uploadToRetroStore} from "./RetroStore";
import {Emulator} from "./Emulator";
import {Editor} from "./Editor";
import {wolf} from "./wolf";
import { fileOpen, fileSave } from "browser-fs-access"

// So that if we later have different types of files (images, project files), the user agent
// can have a different default or current directory for each.
const ASSEMBLY_LANGUAGE_FILES_DIR_ID = "asm_files";

// File extensions for assembly language files.
const ASSEMBLY_LANGUAGE_EXTENSIONS = [".asm", ".s"];

const simpleExample = `        .org 0x9000

        ld a,191
        ld hl,15360
        ld b,10
        
loop:
        ld (hl),a
        inc hl
        djnz loop

stop:
        jp stop
`;

const screenshotExample = `        .org 0x9000
        
        ld hl,screenshot
        ld de,15360
draw:
        ld a,(hl)
        or a
        jr z,enddraw
        ld (de),a
        inc de
        inc hl
        jr draw

enddraw:

stop:
        jp stop

        ; Screenshot
screenshot:
        .byte 65, 66
        ; End screenshot
        .byte 0
`;

const spaceInvaders = `        .org 0x9000
        di
        ; Set up stack.
        ld hl,0
        ld sp,hl

top:
        ld hl,15360
        ld b,100
        
loop:
        ; Draw alien.
        push hl
        ld (hl),0x80
        inc hl
        ld (hl),0x89
        inc hl
        ld (hl),0xB7
        inc hl
        ld (hl),0x9D
        inc hl
        ld (hl),0x81
        inc hl

        pop hl
        inc hl

        ; Delay loop.
        push bc
        ld bc,1500
wait:
        dec bc
        ld a,b
        or a,c
        jr nz,wait
        pop bc

        djnz loop

        jp top
`;

/**
 * Make a function that, when run, takes the user to the link.
 */
function makeLink(link: string): () => void {
    return () => {
        const a = document.createElement("a");
        a.href = link;
        a.target = "_blank";
        a.click();
    };
}

// Available templates.
const TEMPLATES = [
    { name: "Simple", code: simpleExample },
    { name: "Screenshot", code: screenshotExample },
    { name: "Space Invaders", code: spaceInvaders },
    { name: "Wolfenstein", code: wolf },
    { name: "Breakdown", code: breakdwn },
    { name: "Scarfman", code: scarfman },
];

// Get the code we should display initially.
export function getDefaultExample(): string {
    return simpleExample;
}

// Everything related to the menus and the top-level UI.
export class UserInterface {
    public constructor(emulator: Emulator, editor: Editor) {
        // Pull-down menu.
        const menu: Menu = [
            {
                text: "File",
                menu: [
                    {
                        text: "New",
                        // Can't override Cmd-N in browsers.
                        // hotkey: "Cmd-N",
                        action: async () => {
                            await this.newFile(editor);
                        },
                    },
                    {
                        id: "template-list",
                        text: "New From Template",
                        menu: [],
                    },
                    {
                        text: "Open...",
                        hotkey: "Cmd-O",
                        action: async () => {
                            await this.openFile(editor);
                        },
                    },
                    {
                        text: "Save",
                        hotkey: "Cmd-S",
                        action: async () => {
                            await this.saveFile(editor);
                        },
                    },
                    // Disable this, was only for demo.
                    /*
                    {
                        text: "Upload to RetroStore",
                        action: async () => {
                            const assemblyResults = editor.getAssemblyResults();
                            await uploadToRetroStore(assemblyResults);
                        },
                    },
                    {
                        text: "Download from RetroStore",
                        action: async () => {
                            const code = await downloadFromRetroStore();
                            if (code !== undefined) {
                                emulator.closeScreenEditor();
                                editor.setCode(code);
                            }
                        },
                    },*/
                ],
            },
            {
                text: "View",
                menu: [
                    // Disable presentation mode, it's really only for demos.
                    /*
                    {
                        text: "Presentation Mode",
                        action: (menuCommand: MenuCommand) => {
                            // Toggle current mode.
                            const presentationMode = !(menuCommand.checked ?? false);
                            editor.setPresentationMode(presentationMode);
                            document.body.classList.toggle("presentation-mode", presentationMode);
                            document.body.classList.toggle("work-mode", !presentationMode);
                            menuCommand.setChecked?.(presentationMode);
                        },
                    },
                    {
                        separator: true,
                    },*/
                    {
                        text: "Show Line Numbers",
                        checked: true,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowLineNumbers(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        text: "Show Addresses",
                        checked: true,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowAddresses(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        text: "Show Bytecode",
                        checked: true,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowBytecode(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                    {
                        text: "Show Timing",
                        checked: false,
                        action: (menuCommand: MenuCommand) => {
                            const show = !(menuCommand.checked ?? false);
                            editor.setShowTiming(show);
                            menuCommand.setChecked?.(show);
                        },
                    },
                ],
            },
            {
                text: "Navigate",
                menu: [
                    {
                        text: "Declaration or Usages",
                        action: () => {
                            editor.jumpToDefinition(false);
                        },
                        hotkey: "Cmd-B",
                    },
                    {
                        text: "Next Declaration or Usages",
                        action: () => {
                            editor.jumpToDefinition(true);
                        },
                        hotkey: "Shift-Cmd-B",
                    },
                    {
                        separator: true,
                    },
                    {
                        text: "Next Error",
                        action: () => {
                            editor.nextError();
                        },
                        hotkey: "F2",
                    },
                    {
                        text: "Previous Error",
                        action: () => {
                            editor.prevError();
                        },
                        hotkey: "Shift-F2",
                    },
                ],
            },
            {
                text: "Run",
                menu: [
                    {
                        text: "Run",
                        action: () => {
                            const assemblyResults = editor.getAssemblyResults();
                            emulator.runProgram(assemblyResults);
                        },
                        hotkey: "Cmd-R",
                    },
                    {
                        id: "auto-run",
                        text: "Auto-run",
                        checked: editor.autoRun,
                        action: (menuCommand: MenuCommand) => {
                            const autoRun = !menuCommand.checked;
                            menuCommand.setChecked?.(autoRun);
                            editor.autoRun = autoRun;
                        },
                    },
                ],
            },
            {
                text: "Debug",
                menu: [
                    {
                        text: "Step",
                        hotkey: "Meta-Shift-S",
                        action: () => {
                            emulator.step();
                        },
                    },
                    {
                        text: "Continue",
                        hotkey: "Meta-Shift-C",
                        action: () => {
                            emulator.continue();
                        },
                    },
                    {
                        text: "Clear All Breakpoints",
                        action: () => {
                            editor.clearAllBreakpoints();
                        },
                    },
                ],
            },
            {
                text: "Help",
                menu: [
                    {
                        text: "IDE Documentation",
                        action: makeLink("https://lkesteloot.github.io/trs80/"),
                    },
                    {
                        text: "Z80 Instruction Summary",
                        action: makeLink("https://clrhome.org/table/"),
                    },
                ],
            },
        ];

        const body = document.body;
        body.classList.add("dark-mode", "work-mode");

        const content = document.createElement("div");
        content.classList.add("content");
        body.append(content);

        const leftPane = document.createElement("div");
        leftPane.classList.add("left-pane");
        const newFromExamplesMenu = getMenuEntryById(menu, "template-list");
        if (newFromExamplesMenu !== undefined && isMenuParent(newFromExamplesMenu)) {
            for (const template of TEMPLATES) {
                newFromExamplesMenu.menu.push({
                    text: template.name,
                    action: async () => {
                        const proceed = await this.promptIfFileModified(editor);
                        if (proceed) {
                            editor.setCode(template.code);
                        }
                    },
                });
            }
        }
        const menubar = createMenubar(menu);
        const toolbar = document.createElement("div");
        toolbar.classList.add("toolbar");
        // Toolbar is currently empty.
        const editorContainer = document.createElement("div");
        editorContainer.classList.add("editor-container");
        const editorDiv = document.createElement("div");
        editorDiv.classList.add("editor");
        editorDiv.append(editor.getNode(), editor.errorPill);
        editorContainer.append(editorDiv);
        leftPane.append(menubar, /*toolbar,*/ editorContainer);

        const rightPane = document.createElement("div");
        rightPane.classList.add("right-pane");
        const z80Inspector = emulator.createZ80Inspector();
        rightPane.append(emulator.getNode(), z80Inspector);

        content.append(leftPane, rightPane);
    }

    /**
     * If the user has modified the file, prompt to save it. Returns
     * true if the file was not modified, if the file was saved, or if
     * the user decided to abandon the changes. Returns false if the user
     * canceled the operation (the file was saved but they don't want
     * to proceed with the new operation).
     */
    private async promptIfFileModified(editor: Editor): Promise<boolean> {
        if (editor.fileHasBeenModified()) {
            return new Promise(resolve => {
                // Ask user if they want to save the file.
                const dialog = document.createElement("dialog");
                dialog.classList.add("modal-dialog");
                const promptNode = document.createElement("div");
                promptNode.classList.add("dialog-prompt");
                promptNode.textContent = "The file has been modified. Would you like to save it?";

                const buttonRow = document.createElement("form");
                buttonRow.classList.add("dialog-button-row");
                buttonRow.method = "dialog";

                const dontSaveButton = document.createElement("button");
                dontSaveButton.classList.add("dialog-dont-save-button");
                dontSaveButton.textContent = "Don’t Save";
                dontSaveButton.value = "dont-save";

                const spacer = document.createElement("div");
                spacer.classList.add("dialog-spacer");

                const saveButton = document.createElement("button");
                saveButton.classList.add("dialog-save-button");
                saveButton.textContent = "Save";
                saveButton.value = "save";

                const cancelButton = document.createElement("button");
                cancelButton.classList.add("dialog-cancel-button");
                cancelButton.textContent = "Cancel";
                cancelButton.value = "cancel";

                buttonRow.append(dontSaveButton, spacer, saveButton, cancelButton);
                dialog.append(promptNode, buttonRow);
                document.body.append(dialog);
                dialog.showModal();
                saveButton.focus();

                dialog.addEventListener("close", () => {
                    dialog.remove();

                    const action = dialog.returnValue;
                    if (action === "save") {
                        // Save.
                        this.saveFile(editor)
                            .then(saved => {
                                // Continue if we saved.
                                resolve(saved);
                            });
                    } else if (action === "dont-save") {
                        // Don't save.
                        resolve(true);
                    } else {
                        // Cancel or ESC was pressed.
                        resolve(false);
                    }
                });
            });
        } else {
            return true;
        }
    }

    /**
     * Create a new source file.
     */
    private async newFile(editor: Editor) {
        const proceed = await this.promptIfFileModified(editor);
        if (proceed) {
            editor.setCode("");
        }
    }

    /**
     * Prompt the user to open a new asm file.
     */
    private async openFile(editor: Editor) {
        const proceed = await this.promptIfFileModified(editor);
        if (proceed) {
            const blob = await fileOpen({
                description: "Assembly Language files",
                extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
                id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
            });
            const text = await blob.text();
            editor.setCode(text, blob.handle);
        }
    }

    /**
     * Prompt the user to save the current asm file.
     *
     * @return whether the file was saved.
     */
    private async saveFile(editor: Editor): Promise<boolean> {
        const text = editor.getCode();
        const blob = new Blob([text], {
            type: "text/plain",
        });
        const handle = editor.getFileHandle();
        const newHandle = await fileSave(blob, {
            id: ASSEMBLY_LANGUAGE_FILES_DIR_ID,
            extensions: ASSEMBLY_LANGUAGE_EXTENSIONS,
        }, handle);
        if (newHandle === null) {
            return false;
        } else {
            editor.fileWasSaved();
            return true;
        }
    }
}
