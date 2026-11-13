import type {OpenDisk} from "./OpenDisk.js";

/**
 * The disks that a page has open, in the order they were added, with events for the page's views. A page has
 * one store.
 */
export class DiskStore {
    private readonly disks: OpenDisk[] = [];
    private readonly stopWatching = new Map<OpenDisk, () => void>();
    private readonly addedListeners: ((disk: OpenDisk) => void)[] = [];
    private readonly removedListeners: ((disk: OpenDisk) => void)[] = [];
    private readonly changedListeners: ((disk: OpenDisk) => void)[] = [];

    /**
     * The open disks, in order. The array is a copy.
     */
    public list(): OpenDisk[] {
        return [...this.disks];
    }

    /**
     * Find an open disk by its ID, or undefined if it isn't open.
     *
     * @param id the disk's {@link OpenDisk.id}.
     */
    public get(id: number): OpenDisk | undefined {
        return this.disks.find(disk => disk.id === id);
    }

    /**
     * Add a disk at the end, and start passing on its changes. Does nothing if the disk is already here.
     *
     * @param disk the disk.
     */
    public add(disk: OpenDisk): void {
        if (this.disks.includes(disk)) {
            return;
        }

        this.disks.push(disk);
        this.stopWatching.set(disk, disk.onChange(() => notifyAll(this.changedListeners, disk)));
        notifyAll(this.addedListeners, disk);
    }

    /**
     * Remove a disk, and release it. Does nothing if the disk isn't here.
     *
     * @param disk the disk, or its ID.
     * @returns whether a disk was removed.
     */
    public remove(disk: OpenDisk | number): boolean {
        const target = typeof disk === "number" ? this.get(disk) : disk;
        const index = target === undefined ? -1 : this.disks.indexOf(target);
        if (target === undefined || index < 0) {
            return false;
        }

        this.disks.splice(index, 1);
        this.stopWatching.get(target)?.();
        this.stopWatching.delete(target);
        target.dispose();
        notifyAll(this.removedListeners, target);
        return true;
    }

    /**
     * Ask to be told when a disk is added.
     *
     * @returns a function that removes the listener.
     */
    public onAdded(listener: (disk: OpenDisk) => void): () => void {
        return addListener(this.addedListeners, listener);
    }

    /**
     * Ask to be told when a disk is removed. The disk has been disposed by then.
     *
     * @returns a function that removes the listener.
     */
    public onRemoved(listener: (disk: OpenDisk) => void): () => void {
        return addListener(this.removedListeners, listener);
    }

    /**
     * Ask to be told when any disk in the store changes (see {@link OpenDisk.onChange}).
     *
     * @returns a function that removes the listener.
     */
    public onChanged(listener: (disk: OpenDisk) => void): () => void {
        return addListener(this.changedListeners, listener);
    }
}

/**
 * Add a listener to a list.
 *
 * @param listeners the list.
 * @param listener the listener.
 * @returns a function that takes it out again.
 */
function addListener(listeners: ((disk: OpenDisk) => void)[], listener: (disk: OpenDisk) => void): () => void {
    listeners.push(listener);

    return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
            listeners.splice(index, 1);
        }
    };
}

/**
 * Call every listener with the disk. A listener that throws doesn't stop the others.
 *
 * @param listeners the listeners, which may change while we call them.
 * @param disk the disk to tell them about.
 */
function notifyAll(listeners: readonly ((disk: OpenDisk) => void)[], disk: OpenDisk): void {
    for (const listener of [...listeners]) {
        try {
            listener(disk);
        } catch (e) {
            console.error("Error in a disk store listener:", e);
        }
    }
}
