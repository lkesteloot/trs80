
/**
 * Remove all children from element.
 */
export function clearElement(e: HTMLElement): void {
    while (e.firstChild) {
        e.removeChild(e.firstChild);
    }
}

/**
 * Flash the node as if a photo were taken.
 */
export function flashNode(node: HTMLElement): void {
    // Position a semi-transparent white div over the screen, and reduce its transparency over time.
    const oldNodePosition = node.style.position;
    node.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.right = "0";
    overlay.style.bottom = "0";
    overlay.style.backgroundColor = "#ffffff";

    // Fade out.
    let opacity = 1;
    const updateOpacity = () => {
        overlay.style.opacity = opacity.toString();
        opacity -= 0.05;
        if (opacity >= 0) {
            window.requestAnimationFrame(updateOpacity);
        } else {
            node.removeChild(overlay);
            node.style.position = oldNodePosition;
        }
    };
    updateOpacity();
    node.appendChild(overlay);
}
