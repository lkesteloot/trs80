const MATERIAL_ICONS_CLASS = "material-icons-round";

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
    const button = document.createElement("div");
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

export function makeButton(label: string, iconName: string | string[] | undefined,
                           cssClass: string, clickCallback: (() => void) | undefined): HTMLButtonElement {

    const button = document.createElement("button");
    button.innerText = label;
    button.classList.add(cssClass);

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
