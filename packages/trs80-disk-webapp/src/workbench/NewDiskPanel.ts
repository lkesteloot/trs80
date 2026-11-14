import {TRSDOS_FORMAT_DOSES, TrsdosFormatDos, trsdosFormatDosToString} from "trs80-base";
import {
    createCommandLine, type CreateFloppyRequest, findSystemDiskTemplate, loadSystemDiskTemplate,
} from "trs80-disk";
import {el, makeButton} from "../core/Dom.js";
import {type DosOptions, getDosOptions, hasSystemDisk} from "../core/DosOptions.js";
import {ensureSystemDisk, TEMPLATES} from "../core/Templates.js";

/**
 * The shape of a system disk template.
 */
interface SystemShape {
    /** The cylinder count. */
    cylinders: number;
    /** The side count. */
    sides: number;
}

/**
 * The shapes of the system disk templates found so far, by template name. A template is fetched and decoded
 * once, the first time that its shape is wanted.
 */
const systemShapes = new Map<string, SystemShape>();

/**
 * What the New Disk panel reports when the user presses Create.
 */
export interface NewDiskChoice {
    /** What to make. */
    request: CreateFloppyRequest;
    /** The file name, which ends in ".dmk". */
    name: string;
}

/**
 * The "Make a new disk" panel: a card for each DOS that "create" supports, then the choices that DOS allows, the
 * file name, and the command line that the choices equal. The HTML (disk/index.html) holds the empty frame, and
 * this class fills it in.
 */
export class NewDiskPanel {
    private readonly onCreate: (choice: NewDiskChoice) => void;
    private readonly grid = document.getElementById("dosGrid") as HTMLElement;
    private readonly options = document.querySelector("#newDisk .newopts") as HTMLElement;
    private readonly kindChoice = document.getElementById("kindChoice") as HTMLElement;
    private readonly cylinderChoice = document.getElementById("cylinderChoice") as HTMLElement;
    private readonly sideChoice = document.getElementById("sideChoice") as HTMLElement;
    private readonly nameInput = document.getElementById("newName") as HTMLInputElement;
    private readonly createButton = document.getElementById("createBtn") as HTMLButtonElement;
    private readonly commandElement = document.getElementById("createCommand") as HTMLElement;

    private dos: TrsdosFormatDos | undefined = undefined;
    private system = false;
    private cylinders = 40;
    private sides = 1;
    private model: 1 | 3 = 3;
    private nameEdited = false;
    private modelRow: HTMLElement[] = [];
    private readonly shapeNote = el("div", "note", "A system disk's shape is fixed.");

    /**
     * Fill in the panel.
     *
     * @param onCreate called when the user presses Create with the choice that they made.
     */
    constructor(onCreate: (choice: NewDiskChoice) => void) {
        this.onCreate = onCreate;
        this.options.hidden = true;
        this.shapeNote.style.gridColumn = "2";
        this.shapeNote.hidden = true;
        this.sideChoice.after(this.shapeNote);

        for (const dos of TRSDOS_FORMAT_DOSES) {
            const card = el("button", "doscard", el("b", "", trsdosFormatDosToString(dos)),
                el("span", "", getDosOptions(dos).summary));
            card.type = "button";
            card.dataset.dos = String(dos);
            card.addEventListener("click", () => this.chooseDos(dos));
            this.grid.append(card);
        }

        this.kindChoice.addEventListener("click", event => {
            const button = (event.target as HTMLElement).closest("button");
            if (button !== null && this.dos !== undefined) {
                this.system = button.dataset.sys === "1";
                this.update();
            }
        });
        this.nameInput.addEventListener("input", () => {
            this.nameEdited = true;
            this.update();
        });
        this.createButton.addEventListener("click", () => this.create());
    }

    /**
     * Bring the panel into view and put the cursor where the user can go on.
     */
    public focus(): void {
        document.getElementById("newDisk")?.scrollIntoView({block: "nearest"});
        (this.grid.querySelector("button") as HTMLElement | null)?.focus();
    }

    /**
     * Choose a DOS, which resets the choices to its defaults.
     */
    private chooseDos(dos: TrsdosFormatDos): void {
        this.dos = dos;
        const options = getDosOptions(dos);
        this.cylinders = options.initialCylinders;
        this.sides = options.sides[0];
        this.model = options.defaultModel;
        if (!hasSystemDisk(dos)) {
            this.system = false;
        }
        this.options.hidden = false;
        this.update();
    }

    /**
     * Make a row of segmented buttons, replacing a container's contents.
     *
     * @param container the container.
     * @param values the choices.
     * @param current the current choice.
     * @param label how to show a choice.
     * @param onChoose called with the choice that the user clicks.
     */
    private fillSegments<T>(container: HTMLElement, values: T[], current: T, label: (value: T) => string,
                            onChoose: (value: T) => void): void {

        container.replaceChildren(...values.map(value => {
            const button = makeButton(label(value), () => onChoose(value), value === current ? "on" : "");
            return button;
        }));
    }

    /**
     * Redraw the choices and the command line after any change.
     */
    private update(): void {
        for (const card of Array.from(this.grid.children) as HTMLElement[]) {
            card.classList.toggle("on", card.dataset.dos === String(this.dos));
        }
        if (this.dos === undefined) {
            this.createButton.disabled = true;
            return;
        }
        const dos = this.dos;
        const options = getDosOptions(dos);
        const canSystem = hasSystemDisk(dos);

        for (const button of Array.from(this.kindChoice.children) as HTMLElement[]) {
            const isSystemButton = button.dataset.sys === "1";
            button.classList.toggle("on", isSystemButton === this.system);
            (button as HTMLButtonElement).disabled = isSystemButton && !canSystem;
            button.title = isSystemButton && !canSystem ? "There's no system disk for this DOS" : "";
        }

        // A system disk has the shape of the DOS's own disk, so its shape isn't a choice: show that shape, and
        // bring the user's own choices back when they return to a data disk.
        const systemShape = this.system ? this.getSystemShape(dos) : undefined;
        if (this.system) {
            const unknown = systemShape === undefined;
            this.fillSegments(this.cylinderChoice, [0], 0, () => unknown ? "…" : String(systemShape.cylinders),
                () => {});
            this.fillSegments(this.sideChoice, [0], 0, () => unknown ? "…" : String(systemShape.sides), () => {});
        } else {
            this.fillSegments(this.cylinderChoice, options.cylinders, this.cylinders, String, value => {
                this.cylinders = value;
                this.update();
            });
            this.fillSegments(this.sideChoice, options.sides, this.sides, String, value => {
                this.sides = value;
                this.update();
            });
        }
        for (const container of [this.cylinderChoice, this.sideChoice]) {
            for (const button of Array.from(container.children) as HTMLButtonElement[]) {
                button.disabled = this.system;
            }
            container.title = this.system ? "A system disk has the shape of the DOS's own disk" : "";
        }
        this.shapeNote.hidden = !this.system;
        this.updateModelRow(options);

        if (!this.nameEdited) {
            this.nameInput.value = this.system ? this.systemName(dos) : "new.dmk";
        }
        const name = this.diskName();
        this.createButton.disabled = name === "";
        this.commandElement.textContent = createCommandLine(this.makeRequest());
    }

    /**
     * The shape of the system disk that would be copied for a DOS (and, for LDOS, the chosen model), or undefined
     * if it hasn't been loaded yet, in which case it's loaded in the background and the panel is redrawn when
     * it's ready.
     */
    private getSystemShape(dos: TrsdosFormatDos): SystemShape | undefined {
        const template = findSystemDiskTemplate(dos, this.model);
        const known = systemShapes.get(template.name);
        if (known !== undefined) {
            return known;
        }

        ensureSystemDisk(template.name)
            .then(() => {
                const geometry = loadSystemDiskTemplate(TEMPLATES, template).getGeometry();
                systemShapes.set(template.name, {cylinders: geometry.cylinderCount, sides: geometry.sideCount});
                this.update();
            })
            .catch(e => console.error("Can't load the system disk " + template.name + ":", e));
        return undefined;
    }

    /**
     * Show or hide the row that chooses the model, which only LDOS has.
     */
    private updateModelRow(options: DosOptions): void {
        const form = this.cylinderChoice.parentElement as HTMLElement;
        for (const element of this.modelRow) {
            element.remove();
        }
        this.modelRow = [];
        if (options.models.length === 0) {
            return;
        }

        const choice = el("div", "segmented");
        this.fillSegments(choice, options.models, this.model, value => "Model " + (value === 1 ? "I" : "III"),
            value => {
                this.model = value;
                this.update();
            });
        const label = el("label", "", "Model");
        const nameLabel = Array.from(form.children).find(child => child.textContent === "File name") as HTMLElement;
        form.insertBefore(label, nameLabel);
        form.insertBefore(choice, nameLabel);
        this.modelRow = [label, choice];
    }

    /**
     * The file name for a system disk of a DOS, such as "ldos-5.3-system.dmk".
     */
    private systemName(dos: TrsdosFormatDos): string {
        return trsdosFormatDosToString(dos).toLowerCase().replace(/[^a-z0-9.]+/g, "-") + "-system.dmk";
    }

    /**
     * The file name to use, with ".dmk" added if the user left the extension off, or "" if there's none.
     */
    private diskName(): string {
        const name = this.nameInput.value.trim();
        if (name === "") {
            return "";
        }
        return name.includes(".") ? name : name + ".dmk";
    }

    /**
     * The "create" request that the choices equal. Choices that equal the DOS's defaults are left undefined, so
     * that the command line stays short.
     */
    private makeRequest(): CreateFloppyRequest {
        const dos = this.dos as TrsdosFormatDos;
        const options = getDosOptions(dos);
        const useShape = !this.system;
        return {
            format: {
                dos,
                cylinders: useShape && this.cylinders !== options.defaultCylinders ? this.cylinders : undefined,
                sides: useShape && this.sides !== 1 ? this.sides : undefined,
                density: undefined,
                model: options.models.length > 0 && this.model !== options.defaultModel ? this.model : undefined,
                name: undefined,
                date: undefined,
            },
            system: this.system,
            minimal: false,
            force: false,
        };
    }

    /**
     * Report the choice to the page.
     */
    private create(): void {
        if (this.dos === undefined) {
            return;
        }
        const name = this.diskName();
        if (name === "") {
            return;
        }
        this.onCreate({request: this.makeRequest(), name});
    }
}
