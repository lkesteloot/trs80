
const MATERIAL_ICONS_CLASS = "material-icons-round";

// Name of tag we use for files in the trash.
 export const TRASH_TAG = "Trash";

// Functions to call.
const gDeferredFunctions: (() => Promise<void>)[] = [];
// Whether we've already created a timer to call the deferred functions.
let gDeferredFunctionsScheduled = false;

// Call the next deferred function.
async function callDeferredFunction() {
    const deferredFunction = gDeferredFunctions.shift();
    if (deferredFunction === undefined) {
        gDeferredFunctionsScheduled = false
    } else {
        // Make sure we don't kill the process if the function throws.
        try {
            await deferredFunction();
        } finally {
            setTimeout(callDeferredFunction, 0);
        }
    }
}

/**
 * Defer a function until later. All deferred functions are queued up and
 * executed sequentially, in order.
 */
export function defer(f: () => Promise<void>): void {
    // Add our function in order.
    gDeferredFunctions.push(f);

    // Kick it all off if necessary.
    if (!gDeferredFunctionsScheduled) {
        setTimeout(callDeferredFunction, 0);
        gDeferredFunctionsScheduled = true;
    }
}

/**
 * Format a long date without a time.
 */
export function formatDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

/**
 * Make a material design icon with the given name.
 *
 * https://google.github.io/material-design-icons/
 * https://material.io/resources/icons/?style=round
 */
export function makeIcon(name: string): HTMLElement {
    const icon = document.createElement("i");

    icon.classList.add(MATERIAL_ICONS_CLASS);
    icon.classList.add("material-icons-override");
    if (name === "edit") {
        // Icon is too large.
        icon.classList.add("smaller-icon");
    }
    icon.innerText = name;

    return icon;
}

/**
 * Make a generic round button.
 */
export function makeIconButton(icon: HTMLElement, title: string, clickCallback: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.classList.add("icon-button");
    button.title = title;
    button.append(icon);
    button.addEventListener("click", clickCallback);

    return button;
}

/**
 * Make a float-right close button for dialog boxes.
 */
export function makeCloseIconButton(closeCallback: () => void) {
    const button = makeIconButton(makeIcon("close"), "Close window (ESC)", closeCallback);
    button.classList.add("close-button");

    return button;
}

const TEXT_BUTTON_LABEL_CLASS = "text-button-label";
export function makeTextButton(label: string, iconName: string | string[] | undefined,
                               cssClass: string, clickCallback: (() => void) | undefined): HTMLButtonElement {

    const button = document.createElement("button");
    button.classList.add("text-button", cssClass);

    // Add text.
    const labelNode = document.createElement("span");
    labelNode.classList.add(TEXT_BUTTON_LABEL_CLASS);
    labelNode.innerText = label;
    button.append(labelNode);

    // Add icons.
    if (iconName !== undefined) {
        if (typeof iconName === "string") {
            iconName = [iconName];
        }
        for (const i of iconName) {
            const icon = document.createElement("i");
            icon.classList.add(MATERIAL_ICONS_CLASS);
            icon.innerText = i;
            button.append(icon);
        }
    }

    // Action.
    if (clickCallback !== undefined) {
        button.addEventListener("click", clickCallback);
    }

    return button;
}

/**
 * Get the label node for a text button created by {@link makeTextButton}.
 */
export function getLabelNodeForTextButton(button: HTMLElement): HTMLElement {
    return button.querySelector("." + TEXT_BUTTON_LABEL_CLASS) as HTMLElement;
}

/**
 * Options for the {@link makeTagCapsule} function.
 */
export interface TagCapsuleOptions {
    // Text to draw on the tag.
    tag: string;

    // "clear" for X, "add" for +.
    iconName?: string;

    // Whether to draw it dimly.
    faint?: boolean;

    // Whether this is an "exclude" tag.
    exclude?: boolean;

    // Change cursor to pointer and make it clickable.
    clickCallback?: (event: MouseEvent) => void;
}

/**
 * Compute a hash for the tag string. See the "tag-#" CSS classes.
 */
function computeTagColor(tag: string): string {
    if (tag === TRASH_TAG) {
        return "trash";
    }

    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = (hash*37 + tag.charCodeAt(i)) & 0xFFFFFFFF;
    }
    if (hash < 0) {
        hash += 0x100000000;
    }
    return (hash % 6).toString();
}

/**
 * Make a capsule to display a tag.
 */
export function makeTagCapsule(options: TagCapsuleOptions): HTMLElement {
    // The capsule itself.
    const capsule = document.createElement("div");
    capsule.classList.add("tag", "tag-" + computeTagColor(options.tag));
    if (options.exclude) {
        capsule.classList.add("tag-exclude");
    }
    if (options.faint) {
        capsule.classList.add("tag-faint");
    }

    // The text.
    const capsuleText = document.createElement("span");
    capsuleText.classList.add("tag-text");
    capsuleText.innerText = options.tag;
    capsule.append(capsuleText);

    // The icon.
    if (options.iconName !== undefined) {
        const deleteIcon = document.createElement("i");
        deleteIcon.classList.add(MATERIAL_ICONS_CLASS);
        deleteIcon.innerText = options.iconName;
        capsule.append(deleteIcon)
    }

    // The X for exclude.
    if (options.exclude) {
        const excludeIcon = document.createElement("i");
        excludeIcon.classList.add(MATERIAL_ICONS_CLASS, "tag-exclude-icon");
        excludeIcon.innerText = "clear";
        capsule.append(excludeIcon)
    }

    // Action.
    const clickCallback = options.clickCallback;
    if (clickCallback !== undefined) {
        capsule.addEventListener("click", e => {
            clickCallback(e);
            e.preventDefault();
            e.stopPropagation();
        });
        capsule.classList.add("tag-clickable");
    }

    return capsule;
}

/**
 * Returns whether two string arrays are the same.
 *
 * Lodash has isEqual(), but it adds about 15 kB after minimization! (It's a deep comparison
 * that has to deal with all sorts of data types.)
 */
export function isSameStringArray(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
