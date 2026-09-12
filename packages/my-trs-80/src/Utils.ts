
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

// Google's "G" logo, for the sign-in button.
const GOOGLE_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';

/**
 * Make a "Sign in with Google" button that follows Google's branding guidelines.
 */
export function makeGoogleSignInButton(clickCallback: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.classList.add("google-sign-in-button");
    button.innerHTML = GOOGLE_LOGO_SVG;

    const label = document.createElement("span");
    label.innerText = "Sign in with Google";
    button.append(label);

    button.addEventListener("click", clickCallback);

    return button;
}
