import type {DiskTemplateSource} from "./DiskTemplates.js";

/**
 * A {@link DiskTemplateSource} for a browser. The system disks have to be fetched, which is asynchronous, and
 * {@link DiskTemplateSource.systemDisk} is not, so a page calls {@link prefetchSystemDisk} for each disk it might
 * use (before the user can ask for it) and then hands the source to the session. The boot sectors are small, so
 * the page imports the table, templates/data-disk-boot-sectors.json, with the app.
 */
export class PrefetchedTemplateSource implements DiskTemplateSource {
    /** The boot sectors as hex strings, keyed as in data-disk-boot-sectors.json. */
    private readonly bootSectors: Readonly<Record<string, readonly string[]>>;
    /** The unzipped system disks that have been prefetched, by name. */
    private readonly systemDisks = new Map<string, Uint8Array>();

    /**
     * @param bootSectorsHex the contents of data-disk-boot-sectors.json.
     */
    constructor(bootSectorsHex: Readonly<Record<string, readonly string[]>>) {
        this.bootSectors = bootSectorsHex;
    }

    /**
     * Load a system disk and keep its unzipped bytes, so that {@link systemDisk} can return them. Does nothing if
     * the disk has already been prefetched.
     *
     * @param name the template's name, such as "ldos-5.3.1-model3" (its file's name without ".dmk.gz").
     * @param loadGzipped fetches the gzipped file's bytes for a name. Bytes that don't start with gzip's magic
     * number are taken to be unzipped already, as when a server sends the file with "Content-Encoding: gzip"
     * (vite's dev server does) and the browser unzips it on the way in.
     * @throws Error if loading fails or the bytes are damaged gzip data.
     */
    public async prefetchSystemDisk(name: string, loadGzipped: (name: string) => Promise<Uint8Array>): Promise<void> {
        if (this.systemDisks.has(name)) {
            return;
        }

        const loaded = await loadGzipped(name);
        const isGzipped = loaded.length >= 2 && loaded[0] === 0x1F && loaded[1] === 0x8B;
        let unzipped = loaded;
        if (isGzipped) {
            const stream = new Blob([loaded as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
            unzipped = new Uint8Array(await new Response(stream).arrayBuffer());
        }
        this.systemDisks.set(name, unzipped);
    }

    /**
     * Whether {@link prefetchSystemDisk} has finished for the named disk.
     *
     * @param name the template's name.
     */
    public hasSystemDisk(name: string): boolean {
        return this.systemDisks.has(name);
    }

    /**
     * The prefetched system disk's unzipped DMK image, or undefined if it hasn't been prefetched.
     *
     * @param name the template's name.
     */
    public systemDisk(name: string): Uint8Array | undefined {
        return this.systemDisks.get(name);
    }

    /**
     * The named boot sectors, as hex strings, or undefined if the table has none by that name.
     *
     * @param key the key in the table.
     */
    public bootSectorsHex(key: string): readonly string[] | undefined {
        return this.bootSectors[key];
    }
}
