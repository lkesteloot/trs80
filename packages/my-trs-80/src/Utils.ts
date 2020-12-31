const MATERIAL_ICONS_CLASS = "material-icons-round";

// Next function to call in the deferred chain.
let nextDeferredFunction: (() => void) | undefined = undefined;
// Whether we've already created a timer to call the deferred function.
let deferredFunctionScheduled = false;

/**
 * Defer a function until later. All deferred functions are queued up and
 * executed sequentially, but not necessarily in the order that defer()
 * was called.
 */
export function defer(f: () => void): void {
    // Get the current function to call next.
    const nextDeferredFunctionCopy = nextDeferredFunction;

    // Set ourselves up to be called next, but restore the previous pointer when done.
    nextDeferredFunction = () => {
        f();
        nextDeferredFunction = nextDeferredFunctionCopy;
    };

    // Call the next deferred function.
    const callback = () => {
        if (nextDeferredFunction === undefined) {
            deferredFunctionScheduled = false
        } else {
            nextDeferredFunction();
            setTimeout(callback, 0);
        }
    };

    // Kick it all off if necessary.
    if (!deferredFunctionScheduled) {
        setTimeout(callback, 0);
        deferredFunctionScheduled = true;
    }
}

/**
 * Format a long date without a time.
 */
export function formatDate(date: Date): string {
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };

    return date.toLocaleDateString(undefined, options);
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
    icon.innerText = name;

    return icon;
}

/**
 * Make a generic round button.
 */
export function makeIconButton(icon: HTMLElement, title: string, clickCallback: () => void) {
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
    const button = makeIconButton(makeIcon("close"), "Close window", closeCallback);
    button.classList.add("close-button");

    return button;
}

export function makeTextButton(label: string, iconName: string | string[] | undefined,
                               cssClass: string, clickCallback: (() => void) | undefined): HTMLButtonElement {

    const button = document.createElement("button");
    button.innerText = label;
    button.classList.add("text-button", cssClass);

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

    if (clickCallback !== undefined) {
        button.addEventListener("click", clickCallback);
    }

    return button;
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

/**
 * Start a timer, and return a function that will evaluate to how many milliseconds
 * the timer has been running. Calling the function restarts the timer.
 */
export function startTimer(): () => number {
    let timerStart = new Date().getTime();

    return () => {
        const now = new Date().getTime();
        const elapsed = now - timerStart;
        timerStart = now;
        return elapsed;
    };
}
