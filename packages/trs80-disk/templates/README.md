# Templates

Disk images and boot sectors for making disks like the ones the DOSes make, which the `disk create` command
uses. trs80-tool's `tools/GenerateTemplates.ts` embeds everything in this directory in its gitignored
`src/disk/Templates.ts` at build time, and a web page can fetch the files through the `./templates/*` export
of this package. `src/DiskTemplates.ts` here is the API to them.

These are the DOSes' own software, not ours. They are shipped inside the tool as the trs80gp emulator
ships them, and will be taken down on request.

## System disks

Bootable disks, as gzipped DMK images, copied by `disk create DOS --system`. The Montezuma disk is kept apart in the code from the TRSDOS-family ones (CP/M isn't one of their DOSes): `disk create cpm --system` copies all of it, and `disk create cpm` and `disk format cpm` put system tracks derived from it (see "Montezuma system tracks") on the 18 × 256 layouts of BIOS 2.x:

| File | What it is |
|---|---|
| `trsdos-2.3-model1.dmk.gz` | TRSDOS 2.3 for the Model I |
| `trsdos-1.3-model3.dmk.gz` | TRSDOS 1.3 for the Model III |
| `ldos-5.3.1-model1.dmk.gz` | LDOS 5.3.1 for the Model I (disk 1) |
| `ldos-5.3.1-model3.dmk.gz` | LDOS 5.3.1 for the Model III |
| `trsdos-6.2.1-model4.dmk.gz` | TRSDOS 6.2.1 for the Model 4 |
| `lsdos-6.3.1-model4.dmk.gz` | LS-DOS 6.3.1 for the Model 4 |
| `montezuma-cpm-2.32-model4.dmk.gz` | Montezuma Micro CP/M 2.2, BIOS 2.32 (64K), for the Model 4 (one side, 40 cylinders, 22 files) |

## Montezuma system tracks

`montezuma-cpm-2.32-system-tracks.json` holds, for each of the four 18 × 256 system presets of BIOS 2.x (`mm-system`,
`mm-ds-system`, `mm-80-system`, and `mm-80-ds-system`), the two reserved (system) tracks of a 2.32 system configured for
that layout, as a hex string of 9,216 bytes: reserved track 0's sectors 1 to 18, then reserved track 1's. Montezuma's
BIOS takes the drive's sides and tracks from the configuration in these tracks and not from the disk, so each layout
needs its own (the shipped disk above is configured for 40 tracks, one side). They were made by running Montezuma's
CONFIG (version 3.10) in an emulator, with no startup command, and saved on four disks, one per layout, which are in
the notes repository's `montezuma-config/` directory (its README.md says how). Those are what the generator reads
(its fourth argument below). `disk create cpm` and `disk format cpm` put them on the layouts, so that the disk boots
and CP/M addresses it correctly; see "Making Montezuma disks" in `FLOPPY_FORMATS.md`.

## Data-disk boot sectors

`data-disk-boot-sectors.json` holds the boot sectors that each DOS's FORMAT writes on a data disk, as hex
strings of 256 bytes, copied from disks that the DOS formatted. `disk create` and `disk format` pass them
to `formatTrsdosDataDisk`, so that a disk we make has the same boot sectors as the DOS's own. The keys are:

| Key | DOS | Sectors, on cylinder 0 side 0 |
|---|---|---|
| `ldos-5.3-single` | LDOS 5.3 for the Model I (single density) | 0 and 1 (they differ) |
| `ldos-5.3-double` | LDOS 5.3 for the Model III (double density) | 0 and 1 |
| `lsdos-6.3` | LS-DOS 6.3 | 0 and 1 |
| `trsdos-6.2` | TRSDOS 6.2 | 0 and 1 |
| `trsdos-1.3` | TRSDOS 1.3 | 1 and 2 |
| `trsdos-2.3` | TRSDOS 2.3 | 0 (from the TRSDOS 2.3 system disk) |

Combinations not listed (such as single-density TRSDOS 6) get a boot sector of our own.

Montezuma Micro CP/M has two keys of its own, used by `disk create cpm` and `disk format cpm`. The sector is the
boot sector that Montezuma's FORMAT leaves in track 0 sector 1 of a system format that hasn't been SYSGENed (it
says there's no CP/M on the disk), and it goes there on the system layouts that have no BIOS system tracks of
ours. A disk's sector size decides which one:

| Key | Layouts | Sector |
|---|---|---|
| `montezuma-cpm-no-system-256` | 18 × 256 (the version 1.x ones, since BIOS 2.x gets the system tracks) | 1 of 256 bytes, from `mloewen/FORMAT13.DMK` |
| `montezuma-cpm-no-system-512` | 10 × 512 (the extended ones) | 1 of 512 bytes, from `mloewen/FORMAT9.DMK` |

All of the collection's unSYSGENed system formats of a size have the same sector. The 512-byte one starts with the
256-byte one.

The hard disk keys hold sectors 0 and 1 of cylinder 0 of a freshly formatted data partition, which
`disk create` and `disk partition --add` and `format` on a hard disk pass to `formatLdosPartition`. The
directory cylinder at byte 2 is patched in when a partition is written, so they work for any size:

| Key | DOS | Taken from |
|---|---|---|
| `ldos-5.3-hard-model1` | LDOS 5.3 for the Model I (`--model 1`) | partition M1LDVOL2 (head 1) of `m1-ldos531-keil.hdv.gz` |
| `ldos-5.3-hard-model3` | LDOS 5.3 for the Model III (any other `--model`) | partition LDM3HDD (head 3) of `m3-ldos531.hdv.gz` |
| `lsdos-6.3-hard` | LS-DOS 6.3 | partition M4LSDOSC (head 2) of `m4-lsdos631.hdv.gz` |

The images are in the regression collection's `disks/hard/`, gzipped. There are none for TRSDOS 6.2, which hard
disks don't support here.

## Regenerating

`npx tsx tools/ExtractTemplates.ts [SOURCE_DIR [HARD_DISK_DIR [COLLECTION_DIR [CONFIG_DIR]]]]`, from `packages/trs80-tool`, reads the
source images (the floppies from the first directory, the hard disk partitions from the second, the
Montezuma Micro disks from the whole collection in the third, and the disks that CONFIG saved from the fourth),
checks that each decodes as the DOS it should, and rewrites everything here. It is only needed when a
template is added or replaced.
