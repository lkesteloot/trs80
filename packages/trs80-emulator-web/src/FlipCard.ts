import {addPrinterCssFontToPage} from "./PrinterFonts";

/**
 * Internal number of side, where 0 is the front and 1 is the back.
 */
type SideNumber = 0 | 1;

/**
 * Get the other side than the one specified.
 */
function otherSide(sideNumber: SideNumber): SideNumber {
    return (1 - sideNumber) as SideNumber;
}

/**
 * Interface implemented by a class that wants to show on a flip card.
 */
export interface FlipCardSide {
    /**
     * The DOM node to show. Must match the size of the flip card.
     */
    getNode(): HTMLElement;

    /**
     * The side is about to be removed from the flip card.
     */
    willDetachFromFlipCard?(): void;

    /**
     * The side just got attached to the flip card.
     */
    didAttachToFlipCard?(flipCard: FlipCard): void;

    /**
     * The side is about to be hidden (flipped).
     */
    willHideOnFlipCard?(): void;

    /**
     * The side just got finished showing (flipped). Note this doesn't mean the flipped
     * is done, it means that the showing began.
     */
    didShowOnFlipCard?(): void;
}

/**
 * Utility parent class to keep track of the attached flip card.
 */
export abstract class FlipCardSideAdapter implements FlipCardSide {
    protected flipCard: FlipCard | undefined = undefined;

    abstract getNode(): HTMLElement;

    didAttachToFlipCard(flipCard: FlipCard): void {
        this.flipCard = flipCard;
    }

    willDetachFromFlipCard(): void {
        this.flipCard = undefined;
    }

    show() {
        this.flipCard?.show(this);
    }

    hide() {
        this.flipCard?.hide(this);
    }

    isShowing(): boolean {
        return this.flipCard?.isShowing(this) ?? false;
    }
}

/**
 * A card that has a front and a back, and can flip around.
 */
export class FlipCard {
    public readonly width: number;
    public readonly height: number;
    public readonly node: HTMLElement;
    private readonly card: HTMLElement;
    // [Front, Back]:
    private readonly sides: (FlipCardSide | undefined)[] = [undefined, undefined];
    private showingSideNumber: SideNumber = 0;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;

        // This is the "stage" node, which provides perspective for its children.
        this.node = document.createElement("div");
        this.node.style.perspective = "1000px";

        // This is the card that will be flipped around.
        this.card = document.createElement("div");
        this.card.style.width = width + "px";
        this.card.style.height = height + "px";
        this.card.style.position = "relative";
        this.card.style.transition = "transform 0.5s ease-in-out";
        this.card.style.transformStyle = "preserve-3d";
        this.node.append(this.card);

        // Add two dummy children, they'll be replaced later.
        const dummyChild1 = document.createElement("div");
        const dummyChild2 = document.createElement("div");
        this.card.append(dummyChild1, dummyChild2);
    }

    /**
     * Set the front side.
     */
    public setFront(side: FlipCardSide) {
        this.setSideNumber(0, side);
    }

    /**
     * Set the back side.
     */
    public setBack(side: FlipCardSide) {
        this.setSideNumber(1, side);
    }

    /**
     * Set the specific side.
     */
    private setSideNumber(sideNumber: SideNumber, side: FlipCardSide) {
        if (side !== this.sides[sideNumber]) {
            this.sides[sideNumber]?.willDetachFromFlipCard?.();
            this.sides[sideNumber] = side;
            const node = side.getNode();
            this.configureNode(node);
            this.setTransform(node, sideNumber);
            this.card.replaceChild(node, this.card.children[sideNumber]);
            side.didAttachToFlipCard?.(this);
        }
    }

    /**
     * Update the flip transform of the node.
     */
    private setTransform(node: HTMLElement, sideNumber: SideNumber) {
        node.style.transform = "rotateY(" + (sideNumber * 180) + "deg)";
    }

    /**
     * Configure the CSS of the node to be a side.
     */
    private configureNode(node: HTMLElement) {
        node.style.position = "absolute";
        node.style.backfaceVisibility = "hidden";
    }

    /**
     * Show the specified side.
     */
    private showSideNumber(sideNumber: SideNumber) {
        this.sides[otherSide(sideNumber)]?.willHideOnFlipCard?.();
        this.setTransform(this.card, sideNumber);
        this.showingSideNumber = sideNumber;
        this.sides[sideNumber]?.didShowOnFlipCard?.();
    }

    /**
     * Get the number (0 or 1) of the specified side.
     */
    private getSideNumber(side: FlipCardSide): SideNumber | undefined {
        const sideNumber = this.sides.indexOf(side);
        return sideNumber === 0 || sideNumber === 1 ? sideNumber : undefined;
    }

    /**
     * Flip to the front side.
     */
    public showFront() {
        this.showSideNumber(0);
    }

    /**
     * Flip to the back side.
     */
    public showBack() {
        this.showSideNumber(1);
    }

    /**
     * Show (flip to) the specified side.
     */
    public show(side: FlipCardSide) {
        const sideNumber = this.getSideNumber(side);
        if (sideNumber !== undefined) {
            this.showSideNumber(sideNumber);
        }
    }

    /**
     * Hide the specified side (flip to the opposite side).
     */
    public hide(side: FlipCardSide) {
        const sideNumber = this.getSideNumber(side);
        if (sideNumber !== undefined) {
            this.showSideNumber(otherSide(sideNumber));
        }
    }

    /**
     * Whether the specified side is currently showing (flipped to).
     */
    public isShowing(side: FlipCardSide) {
        return this.getSideNumber(side) === this.showingSideNumber;
    }
}
