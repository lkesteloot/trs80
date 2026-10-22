import {FloppyDisk, FloppyFileSystem, getFloppyDetails} from "trs80-base";

/**
 * Make the block of labeled facts at the top of a DOS tab: the file type, the operating system,
 * and the floppy's details (its geometry and what the file system records about itself), the
 * same ones that "trs80-tool info --verbose" prints.
 */
export function makeFloppyInfo(floppy: FloppyDisk, fileSystem: FloppyFileSystem): HTMLElement {
    const infoDiv = document.createElement("div");
    infoDiv.classList.add("info");

    const addField = (label: string, value: string): void => {
        const labelDiv = document.createElement("div");
        labelDiv.classList.add("label");
        labelDiv.innerText = label + ":";
        infoDiv.append(labelDiv);
        const valueDiv = document.createElement("div");
        valueDiv.classList.add("value");
        valueDiv.innerText = value;
        infoDiv.append(valueDiv);
    };

    addField("File type", floppy.getDescription());
    addField("Operating System", fileSystem.nameAndVersion);
    for (const detail of getFloppyDetails(floppy, fileSystem)) {
        addField(detail.label, detail.value);
    }

    return infoDiv;
}
