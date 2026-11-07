# Templates

Disk images and boot sectors that trs80-tool embeds, so that its `disk create` command can make disks
like the ones the DOSes make. `tools/GenerateTemplates.ts` embeds everything in this directory in the
gitignored `src/disk/Templates.ts` at build time, and `src/disk/DiskTemplates.ts` is the API to it.

These are the DOSes' own software, not ours. They are shipped inside the tool as the trs80gp emulator
ships them, and will be taken down on request.

## System disks

Bootable disks, as gzipped DMK images, copied by `disk create DOS --system`:

| File | What it is |
|---|---|
| `trsdos-2.3-model1.dmk.gz` | TRSDOS 2.3 for the Model I |
| `trsdos-1.3-model3.dmk.gz` | TRSDOS 1.3 for the Model III |
| `ldos-5.3.1-model1.dmk.gz` | LDOS 5.3.1 for the Model I (disk 1) |
| `ldos-5.3.1-model3.dmk.gz` | LDOS 5.3.1 for the Model III |
| `trsdos-6.2.1-model4.dmk.gz` | TRSDOS 6.2.1 for the Model 4 |
| `lsdos-6.3.1-model4.dmk.gz` | LS-DOS 6.3.1 for the Model 4 |

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

## Regenerating

`npx tsx tools/ExtractTemplates.ts [SOURCE_DIR]`, from `packages/trs80-tool`, reads the source images,
checks that each decodes as the DOS it should, and rewrites everything here. It is only needed when a
template is added or replaced.
