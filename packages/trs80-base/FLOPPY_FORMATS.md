# TRS-80 floppy formats: verified notes

Findings from researching the specs and measuring them against the disks in
`~/mine/trs80-floppy-regress`. Everything here was checked against real disks or
quoted documentation; guesses are labeled as such.

## Sources

- Tim Mann's [disk image spec](https://www.tim-mann.org/trs80/dskspec.html) covers JV1 and JV3, not DMK.
- David Keil's emulator documentation covers DMK. Both of its mirrors were down
  when this was written; a copy is at `~/Downloads/dmk.html`.
- The [NEWDOS/80 v2 manual](https://www.trs-80.com/sub-reference-newdos80-manual-2.htm), chapters 4-6, documents lumps, PDRIVE, and the directory.
- [Tim Mann's FAQ](https://www.tim-mann.org/trs80faq.html) for hardware and density questions.

## Which DOSes share a layout

**The TRSDOS 2.3 family** is nearly everything: TRSDOS 2.0-2.3, NEWDOS 2.1
(Clifford Ide's patches of TRSDOS 2.1), VTOS (Randy Cook, who also wrote Model I
TRSDOS), LDOS 5.x and its descendants TRSDOS 6 and LS-DOS 6.3, DOSPLUS, and
MULTIDOS. They use 32-byte directory entries with a GAT in the directory
cylinder's first sector and a HIT in its second. Tim Mann: LDOS formats are
"upward compatible from Model I TRSDOS, and identical to Model 4 TRSDOS".
Expect small undocumented differences between them.

**TRSDOS 1.3 (Model III)** is the incompatible one: 48-byte entries, five per
sector (measured: filenames at offsets 5, 53, 101, 149, 197), 16 directory
sectors, 3-sector granules, 6 granules per track, and "(c) 1980 Tandy" as filler
in the spare 16 bytes of each directory sector. Its sectors are numbered from 1.

**NEWDOS/80** keeps the 2.3-family structures but allocates in *lumps*; see below.

**Tandy's Model II lineage** — Model III TRSDOS 1.x, Model I TRSDOS 2.7DD/2.8,
and Model II TRSDOS — are related to each other and can't read each other's
disks. 2.7DD reportedly has the `FE` boot prefix of the 1.3 family but 32-byte
entries. Out of scope for now, as are CP/M and game disks with no file system.

## Boot sector prefixes

The first bytes are executable code whose operand holds the directory cylinder,
so the prefix identifies the layout. Across the 104-disk collection:

| Prefix | Meaning | Disks |
|---|---|---|
| `FE xx` | 1.3 layout, directory cylinder in byte 1 | 12 |
| `00 FE xx` | 2.3 family, directory cylinder in byte 2 | 70 |
| `?? FE xx` | 2.3 family (`F3 FE` DOSPLUS, `76 FE` some LDOS) | 5 |
| `01 82`, `00 00` | MULTIDOS, directory cylinder still in byte 2 | 6 |

Mask the cylinder byte with 0x7F; DOSPLUS sets the high bit. The Model I ROM
boots cylinder 0 sector 0 in single density; the Model III ROM boots sector 1 in
double density (all ten 1.3 disks are double density from cylinder 0 on). That
asymmetry is why dual-boot disks put two boot sectors on cylinder 0, one of each
density, and nothing else.

## The HIT

The hash is 11 characters, the 8-character name and 3-character extension, both
space padded:

    hash = 0
    for each of 11 bytes: hash = rotateLeft8(byte XOR hash)
    if hash == 0: hash = 1

Position in the HIT gives the directory entry. Verified on real disks:

- **2.3 family:** `hitIndex = (entryIndex << 5) | (side << 4) | sectorIndexWithinSide`,
  where the sector index is the physical sector minus 2 on side 0 and the
  physical sector itself on side 1. Four bits means 16 sectors per side, so on
  an 18-sector track the last two sectors of side 1 can't be addressed; LDOS
  leaves them empty.
- **1.3:** `hitIndex = sectorIndex * 5 + entryIndex`, dense, 80 bytes total.

Gotchas: one-byte hashes collide often, so check `HIT[expectedIndex]`, never
"is this hash anywhere". Entries 0 and 1 of each sector are reserved for system
files in the 2.3 family. Some entries legitimately have no HIT byte, e.g.
DIR/SYS on `trsdos-2.1-sssd-2.dmk`. The same numbering is used by the DEC byte
that links a primary entry to its extended entries.

## Cylinders, sides, and allocation

A cylinder is one head position, holding one track per side. The address mark
stores a cylinder number plus a side number, and both sides use the *same*
cylinder number, so an 80-track double-sided disk is 80 cylinders and 160
tracks. Everything TRSDOS calls a track number is really a cylinder.

On a double-sided disk:

- The directory occupies the **whole cylinder**. The GAT and HIT are only in
  sectors 0 and 1 of side 0; every sector of side 1 holds directory entries.
- A GAT byte covers a whole cylinder. Double-sided LDOS at 18 sectors per track
  has 6 granules per cylinder, 3 per side, so a free byte reads 0xC0.
  Single-sided 1.3 reads 0x3F.
- Granule offsets run across the cylinder: offsets 0-2 are side 0 and 3-5 side 1.
  Sector order is side 0, then side 1, then the next cylinder — verified by
  17 files whose extents cross the side boundary and still decode cleanly.

## File sizes

In the 2.3 family, `sectorCount` includes the partly-filled last sector and the
EOF byte is an offset within it, so the size is
`(sectorCount - 1) * 256 + lastSectorSize` when the EOF byte is non-zero. In
1.3, the EOF byte adds to the full sector count. Getting this wrong makes every
partial-sector file exactly one sector too large.

## NEWDOS/80 lumps

- A lump is 2-8 granules (the PDRIVE `GPL` parameter); a granule is always 5 sectors.
- The **third byte of the first sector holds the directory's starting lump**,
  not a track number: "The starting lump number of the directory is always
  contained as a hexadecimal value in the 3rd byte of each diskette's 1st sector".
- An extent's first byte is a lump number (0-253); in the second byte the top 3
  bits are the granule offset within the lump and the low 5 bits are the count
  minus one.
- Directory size is `DDGA` granules (2-6), giving 8, 13, 18, 23 or 28 entry sectors.
- Geometry lives in the PDRIVE table on the *system* disk, not on each diskette,
  so a data disk doesn't describe itself. The table is in the boot area and is
  read at reset; it has ten entries, four for the physical drives.
- Model I NEWDOS/80 and TRSDOS disks are interchangeable only when the directory
  is 2 granules and the drive is 10 sectors/track, 2 granules/lump, 5
  sectors/granule. That is why some NEWDOS disks in the collection decode with
  the TRSDOS reader and others don't.
- Double-sided: documented PDRIVE examples use `SPT=36` for a 5.25" DSDD drive
  (and 20 for DSSD, 34 and 52 for 8"), i.e. **SPT counts both sides of a
  cylinder**, so a lump flows onto side 1 before advancing. This is inferred
  from those numbers; the manual never says it outright, and the collection has
  no double-sided NEWDOS disk to check.

To find such a directory: `absolute = lump * granulesPerLump * 5`, then split by
`sectorsPerCylinder = spt * sides`. `NEWDOS90.dmk` is the worked example: boot
byte 31, GPL 2, giving cylinder 17 sector 4, where the real GAT ("ND90.3") sits,
with exactly 10 deleted-marked sectors — the minimum 2-granule directory,
starting mid-track, which a whole-track scan would never find.

## Evidence that turned out to be reliable

For guessing a layout and directory location, strongest first:

1. **HIT hash matches.** A wrong layout or location matches roughly 1 in 256 by chance.
2. **GAT self-consistency:** it marks its own cylinder fully allocated (0xFF in
   the 2.3 family, 0x3F in 1.3) and the boot granule on cylinder 0; the name and
   date are printable; a blank password is 0xE042 in the 2.3 family, 0xEF5C in 1.3.
3. **Deleted address marks.** 2.3-family directory sectors are all marked
   (10 of 10 single density, 18 of 18 double). TRSDOS 1.3 does **not** mark
   them. JV1's mark is synthesized by our reader for track 17, so it is never
   evidence. The Model I controller could write 0xFA, which Model III hardware
   can't distinguish from 0xFB, so a missing mark means "no information".
4. **The "(c) 1980 Tandy" string:** on all sixteen directory sectors of every
   1.3 disk, and on 0 of 16 for everything else.
5. **The boot prefix and the conventional cylinder** (17 of 35, 20 of 40, 40 of 80).

A blank 2.3-family disk still has BOOT/SYS and DIR/SYS, so even an "empty" disk
offers two hashes. A blank 1.3 disk has no directory entries at all, and is
carried by the Tandy string and the GAT instead. A GAT full of zeros is not an
empty disk, it's the wrong cylinder — that was the old bug on `NEWDOS90.dmk`.

## Image formats

**JV1** is fixed by definition: 256-byte sectors, 10 per track numbered 0-9, one
side, single density, up to 254 tracks, track count = size / 2560. All sectors
on track 17 carry the 0xFA mark. The `00 FE` magic used to detect it assumes a
Model I TRSDOS-style *boot* disk, so data disks and other DOSes' boot code are
rejected.

**JV3**: 2,901 three-byte headers plus a write-protect byte (8,704 bytes), then
the data. Free entries are `FF FF` and **still own a data block**, so offsets
must account for them. A second block follows "if and only if the file is long
enough to contain it", starting immediately after the first block's data;
double-sided disks nearly always fit in one block. Size codes differ between
used (0=256, 1=128, 2=1024, 3=512) and free (0=512, 1=1024, 2=128, 3=256)
entries. Keil's emulator supports up to 96 tracks, which is why a
cylinder < 100 plausibility bound fits.

**DMK** stores raw track bytes. The 16-byte header is write-protect, track
count, little-endian track length, flags. Flag bit 4 is single-sided, bit 6 is
single-density size, bit 7 is ignore-density. **Bits 6 or 7 mean single-density
bytes are stored once; otherwise every single-density byte is doubled**, with
CRCs computed over the un-doubled bytes. Track length includes the 128-byte
header (0x1900 is the usual double-density value, 0x0CC0 single density, max
0x2940). Each track has 64 IDAM pointers, LSB/MSB, bit 15 for double density,
bit 14 undefined, offsets masked with 0x3FFF and including the header, in
ascending order and zero-terminated. Verified across all 84 DMK files: no
entries after a terminator, none out of order, and every file's doubling matches
its flags (checked by recomputing IDAM CRCs at both strides). Sector size codes
are 128, 256, 512, 1024.

**SCP** is raw flux. There are no SCP images in the collection, so that reader is
entirely untested.

## Disks worth remembering

The collection is 104 files: 84 DMK, 11 DSK, 5 JV1, 4 JV3.

- `SuperUtility-1su.dmk`: copy protection with 182 duplicate sector numbers per
  track (same number in both densities) and garbage side bytes in its IDAMs
  (32, 64, 72, ...). A sector map keyed by position keeps only the last of each.
- `NEWDOS90.dmk`: the NEWDOS/80 lump case described above. NEWDOS/90 is an
  update of NEWDOS/86, itself built on NEWDOS/80 v2, so the on-disk rules are
  NEWDOS/80's. Its GAT byte 0xCB is 0x82, which our code reports as "version
  8.2" — probably "/80 version 2", and a useful fingerprint.
- `LD4-631.DSK`: a DMK header claiming 40 tracks but holding 79 tracks' worth of
  data, so it's a truncated double-sided image that the DMK reader rejects.
- `trsdos13-corrupt-side-2.dmk`: valid side 0, garbage side 1 including 400
  sectors claiming 1024-byte size codes.
- The dual-boot disks (`Cosmic_Fighter…`, `sledge13.dmk`) and `ldosutil.dmk`:
  cylinder 0 holds exactly two sectors, single-density sector 0 and
  double-density sector 1, and nothing else. `ldosutil` and `sledge13` are
  otherwise ordinary single-density Model I disks.
- Mixed-density disks (8 of them, all single-sided) have a single-density
  cylinder 0 and double-density elsewhere: the Model I doubler convention.
- Five DMK files set flag bit 6; none set bit 7.
