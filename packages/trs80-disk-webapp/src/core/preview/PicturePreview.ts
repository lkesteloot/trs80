import {HiResScreen} from "trs80-base";
import {newPreviewElement, newToolbar} from "./PreviewHtml.js";

/**
 * The whole-number scales that the user can pick.
 */
const SCALES = [1, 2, 3];

/**
 * How much taller than wide a pixel of a hi-res screen looks. Both screens are 8/3 as wide as they are tall
 * in pixels but shown on a 4:3 tube, which makes a pixel twice as tall as it is wide (see HIRES_FORMATS.md).
 */
const PIXEL_ASPECT = 2;

/**
 * Draw the bitmap of a hi-res screen on a canvas, at one canvas pixel per screen pixel: white on black.
 *
 * @param screen the screen.
 * @return the canvas.
 */
function drawScreen(screen: HiResScreen): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = screen.width;
    canvas.height = screen.height;
    const context = canvas.getContext("2d");
    if (context === null) {
        return canvas;
    }

    const imageData = context.createImageData(screen.width, screen.height);
    const data = imageData.data;
    const bytesPerRow = screen.bytesPerRow;
    for (let y = 0; y < screen.height; y++) {
        for (let x = 0; x < screen.width; x++) {
            const byte = screen.bitmap[y*bytesPerRow + (x >> 3)];
            const value = (byte & (0x80 >> (x & 7))) !== 0 ? 255 : 0;
            const i = (y*screen.width + x)*4;
            data[i] = value;
            data[i + 1] = value;
            data[i + 2] = value;
            data[i + 3] = 255;
        }
    }
    context.putImageData(imageData, 0, 0);

    return canvas;
}

/**
 * Render a hi-res screen picture. The canvas is scaled by a whole number (chosen with the toolbar's buttons),
 * with pixels twice as tall as wide, and without smoothing.
 *
 * @param screen the decoded screen.
 * @return the preview element.
 */
export function renderPicturePreview(screen: HiResScreen): HTMLElement {
    const canvas = drawScreen(screen);
    canvas.classList.add("preview-picture-canvas");

    /** Size the canvas's display for the scale. */
    const setScale = (scale: number) => {
        canvas.style.width = (screen.width*scale) + "px";
        canvas.style.height = (screen.height*scale*PIXEL_ASPECT) + "px";
    };

    const select = document.createElement("select");
    for (const scale of SCALES) {
        const option = document.createElement("option");
        option.value = scale.toString();
        option.textContent = scale + "x";
        select.append(option);
    }
    // The Model 4's 640-pixel-wide screen is wide enough at 1x.
    const initialScale = screen.width >= 640 ? 1 : 2;
    select.value = initialScale.toString();
    select.addEventListener("change", () => setScale(parseInt(select.value, 10)));
    setScale(initialScale);

    const label = document.createElement("label");
    label.append("Scale ", select);
    const size = document.createElement("span");
    size.textContent = screen.getDescription();

    const scroller = document.createElement("div");
    scroller.classList.add("preview-body", "preview-picture-scroller");
    scroller.append(canvas);

    const element = newPreviewElement("preview-picture");
    element.append(newToolbar(label, size), scroller);
    return element;
}
