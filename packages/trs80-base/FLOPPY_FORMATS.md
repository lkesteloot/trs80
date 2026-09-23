# TRS-80 floppy formats: verified notes

Findings from researching the specs and measuring them against the disks in
`~/mine/trs80-floppy-regress`. Everything here was checked against real disks or
quoted documentation; guesses are labeled as such.

## Sources

- Tim Mann's [disk image spec](https://www.tim-mann.org/trs80/dskspec.html) covers JV1 and JV3, not DMK.
- David Keil's emulator documentation covers DMK. Both of its mirrors were down
  when this was written; a copy is at `~/Downloads/dmk.html`.
- The [NEWDOS/80 v2 manual](https://www.trs-80.com/sub-reference-newdos80-manual-2.htm), chapters 4-6, documents lumps, PDRIVE, and the directory.
- *TRS-80 Hacker's Handbook for NEWDOS/80*, at
  `~/Dropbox/Personal/Books/TRS-80/disk/NEWDOS/TRS-80 Hacker's Handbook for Newdos80.pdf`,
  is the best NEWDOS source we have: page 65 is the PDRIVE parameter table, 66-68
  are the directory, GAT and HIT sectors, and the appendix on pages 130-133
  explains lumps and PDRIVE in detail. The PDF is a 154-page scan with no text
  layer (CCITT images), and its PDF page numbers run 8 ahead of the printed ones.
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
so the prefix identifies the layout. Across the collection as it stood at 104
disks (before the five NEWDOS disks below were added):

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
files in the 2.3 family, except under NEWDOS/80, which reuses them when the
system files are absent. Some entries legitimately have no HIT byte, e.g.
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

- A lump is 2-8 granules (the PDRIVE `GPL` parameter); a granule is 5 sectors by
  default (`SPG`), and at most 8. "In NEWDOS/80 we place the Directory at the
  start of a lump not a track."
- The **third byte of the first sector holds the directory's starting lump**,
  not a track number: "The starting lump number of the directory is always
  contained as a hexadecimal value in the 3rd byte of each diskette's 1st sector".
- An extent's first byte is a lump number (0-253); in the second byte the top 3
  bits are the granule offset within the lump and the low 5 bits are the count
  minus one. The handbook says those bits are the count itself, but its own
  worked example contradicts that: a 3-sector file shows 0 there and must own one
  granule. Treat it as count minus one, as the NEWDOS/80 manual says.
- Directory size is `DDGA` granules (2-6), giving 8, 13, 18, 23 or 28 entry sectors.
- Geometry lives in the PDRIVE table, which describes *drives*, not diskettes, so
  a data disk doesn't describe itself. But a **system** disk carries the table at
  drive-relative sector 2, i.e. cylinder 0 sector 2, and that copy is readable
  (see below).
- Model I NEWDOS/80 and TRSDOS disks are interchangeable only when the directory
  is 2 granules and the drive is 10 sectors/track, 2 granules/lump, 5
  sectors/granule. That is why some NEWDOS disks in the collection decode with
  the TRSDOS reader and others don't.
- **`SPT` counts both sides of a cylinder.** The handbook is explicit: "In double
  sided drives the SPT changes to twice as many because tracks span sides. Then
  the track-lump nexus is broken." Its `TD` table gives the sectors per track for
  each drive type as 10 (SS SD), 20 (DS SD), 18 (SS DD) and 36 (DS DD). So a lump
  flows onto side 1 before advancing, and can be half a cylinder.
- **The GAT holds one byte per lump**, with one bit per granule starting at bit 0,
  so `GPL` bits are used: a free lump reads 0xFC when `GPL=2` and 0xF0 when
  `GPL=4`. The lockout table mirrors it at 0x60, one byte per lump again. When a
  disk has **more than 96 lumps the GAT runs past 0x60 and over the lockout
  table**, which the handbook states outright and which
  `newdos80-DSSD-80T.dmk` shows: 160 lumps, running through 0x9F. The DOS detects
  this by checking whether byte 0x60 is 0xFF. Trailing 0xFF bytes mean "beyond
  `TC`": cylinders the DOS will never allocate even though they're formatted.

The arithmetic, all of it confirmed against the disks:

    sectorsPerGranule = SPG                  (5 by default, max 8)
    lumpSizeInSectors = SPG * GPL
    lumpCount         = TC * SPT / (SPG * GPL)
    directorySector   = SPG * GPL * DDSL     absolute, within the data area
    directorySectors  = SPG * DDGA

`NEWDOS90.dmk` is the worked example: boot byte 31, `GPL=2`, giving cylinder 17
sector 4, where the real GAT ("ND90.3") sits, with exactly 10 deleted-marked
sectors — the minimum 2-granule directory, starting mid-track, which a whole-track
scan would never find.

**Open question: where sector 0 of the data area is.** On every disk whose
cylinder 0 is single density while the rest is double (the `TI=..K` case below),
the directory lands one full cylinder later than counting absolute sectors from
cylinder 0 would predict, so lump 0 starts at cylinder 1. On uniformly formatted
disks lump 0 starts at cylinder 0. Measured on all ten NEWDOS disks in the
collection; `NEWDOS1D.dmk` and `newdos80-2.0-ssdd.dmk` are the controlled pair,
identical PDRIVE settings with directories one cylinder apart. The handbook says
the directory starts at "Drive sector 170" without defining where drive sector 0
is on a mixed-density disk, so this rule is ours, not theirs.

## PDRIVE

From the handbook's parameter page:

| Field | Meaning |
|---|---|
| `TI` | Type of Interface: A standard Tandy, B Omikron (Mod I), C Percom doubler (Mod I), D Apparat (Mod III), E LNW (Mod I) |
| | plus special-condition letters: **H** head settle delay (8"), **I** sector 1 is the lowest sector on each track, **J** track 1 is the lowest track, **K** track 0 formatted in the opposite density to the rest, **L** two steps between tracks (40-track disk in an 80-track drive), **M** TRSDOS Model I 2.3B or higher, or Model III, read |
| `TD` | Type of Drive. 5": A SD/SS, C SD/DS, E DD/SS, G DD/DS. 8": B, D, F, H in the same order |
| `TC` | Number of tracks formatted on the disk |
| `SPT` | Sectors per track, counting both sides |
| `TSR` | Track step rate: 0=5ms, 1=10, 2=20, 3=40 |
| `GPL` | Granules per lump (2-8) |
| `DDSL` | Disk directory starting lump (used only by Format) |
| `DDGA` | Granules allocated to the directory (2-6) |

`TI=..K` is worth knowing: it *names* the mixed-density disks, the ones with a
single-density cylinder 0 and double density elsewhere. Both flippy disks in the
collection are `TI=CK`, a Percom doubler with an opposite-density track 0, and
they are exactly the disks whose lump numbering starts at cylinder 1.

**A NEWDOS system disk carries its PDRIVE table at cylinder 0, sector 2**, as
sixteen-byte slots, one per drive. Verified against the owner's own listing for
three disks — every field matches:

    byte 0   DDSL            byte 5   GPL
    byte 1   lump count      byte 8   DDSL again
    byte 3   TC              byte 9   DDGA
    byte 4   SPT             byte 15  TD, as a bit field: bit 1 = double sided,
                                      bit 2 = double density (0=A, 2=C, 4=E, 6=G)

Bytes 2, 7, 0x0D and 0x0E hold the `TI` flags and the step rate; those bits are
only partly worked out. The lump count in byte 1 matches `TC * SPT / (SPG * GPL)`
on every disk, including the 160 of `newdos80-DSSD-80T.dmk`.

This means a NEWDOS **system** disk describes its own geometry and we should read
it rather than guess. A data disk does not: the flippies' sector 2 is 0xE5
filler. Note also that the later slots describe the owner's *other* drives, so
slot 0 is the one that matters and the rest are a bonus.

The owner's PDRIVE settings for five disks are recorded in the `pdrive` field of
their sidecar JSON files in the regression repo. They are the only disks whose
intended geometry is known independently of the media, so prefer them when
checking a NEWDOS decoder.

## NEWDOS/80 on-disk structures

From the handbook's chapter 5 (printed pages 66-68), cross-checked against the
seven NEWDOS disks in the collection.

### Directory entry (FPDE), 32 bytes

    0       file type and access level; bit 4 set means the slot is in use
    1       flags: bit 7 ASE, bit 6 ASC, bit 5 update
    2       unused by NEWDOS/80
    3       EOF offset in the final sector (last byte used)
    4       logical record length, 0 means 256
    5-12    file name, ASCII, blank filled on the right
    13-15   extension, same
    16-17   update password hash, 9642H when unused
    18-19   access password hash, same
    20-21   sector count, from 1, LSB then MSB
    22-23   first extent: lump number, then granule offset and count
    24-29   three more extents, 0xFF when unused
    30      0xFF, or 0xFE when an FXDE exists (bit 0 is the flag)
    31      DEC of the next FXDE: bits 0-4 the directory sector, bits 5-7 the entry

**File size** works differently from TRSDOS: when byte 3 is zero, the 24-bit
value (bytes 21, 20, 3) is the byte count; when it's non-zero, that value is the
byte count plus 256. Worth remembering given how much trouble the TRSDOS size
rule caused.

An FXDE holds 0x90 in byte 0 (bits 7 and 4 both set), the previous entry's DEC in
byte 1, nothing in bytes 2-21, and four more extents in bytes 22-31.

### GAT sector

Beyond the lump bytes described above:

    0xC0-0xCA  unused, except on hard drives
    0xCB       DOS and format identifier
    0xCC       tracks above 35, used by other DOSes but not NEWDOS
    0xCD       density, sides and granules per track in some DOSes; NEWDOS writes 0
    0xCE-0xCF  master password hash, E0 42 when inactive (the value 42E0H)
    0xD0-0xD7  disk name
    0xD8-0xDF  date
    0xE0-0xFF  AUTO command, at most 31 bytes plus a 0x0D terminator

**Byte 0xCB identifies the DOS**: TRSDOS 0x23, NEWDOS/80 0x82, LDOS 0x51, DOSPLUS
0x34. All seven NEWDOS disks in the collection read 0x82, so this is a reliable
fingerprint — and it explains the "version 8.2" our decoder currently reports for
`NEWDOS90.dmk`, which is reading 0x82 as a BCD version number.

**Do not read 0xCC or 0xCD on a NEWDOS disk.** Both are zero on all seven, so the
cylinder count our decoder derives as `0xCC + 35` comes out as 35 even for the
80-cylinder disks, and the flags byte claims single sided and single density for
everything. NEWDOS keeps that information in PDRIVE, not in the GAT.

### HIT sector

The hash is the same one TRSDOS uses, a value from 1 to 255, and the byte's
position is the DEC: bits 0-4 the directory sector (0-27, not counting the GAT
and HIT sectors), bits 5-7 the entry within that sector. FXDEs get HIT entries
too, so a hash match may land on a continuation rather than a primary entry, and
the name still has to be compared.

Two details worth having:

- A HIT byte of 0 means the slot is free, and bit 4 of the entry's first byte
  must then be 0 as well. Consistent checks, useful for scoring.
- **Byte 0x1F holds the number of directory sectors beyond 10.** The GAT page
  claims instead that NEWDOS keeps "tracks above 35" there, which the disks
  disprove: it is 0 on all seven, including the 80-cylinder pair where the track
  reading would require 45.

The handbook's remark that the HIT "uses every second line in the sector" checks
out on all seven disks: with 8 directory entry sectors only the low 3 bits of the
sector field vary, so hashes land in the first 8 bytes of each 32, which in a
16-byte dump means every even line.

**NEWDOS reuses the system-file slots.** Unlike the rest of the 2.3 family it
"does not exclude the use of the fixed slots for SYS files by other files if the
SYS files are not on the disk", so a NEWDOS decoder must not assume entries 0 and
1 of each sector are reserved.

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
ascending order and zero-terminated. Verified across the 84 DMK files present at
the time (the five NEWDOS additions were checked the same way and agree): no
entries after a terminator, none out of order, and every file's doubling matches
its flags (checked by recomputing IDAM CRCs at both strides). Sector size codes
are 128, 256, 512, 1024.

**SCP** is raw flux. There are no SCP images in the collection, so that reader is
entirely untested.

## Disks worth remembering

The collection is 109 files: 89 DMK, 11 DSK, 5 JV1, 4 JV3.

- `newdos80-DSSD-80T.dmk`: the only double-sided NEWDOS disk, and the one that
  settled how `SPT` and lumps work across sides. 80 cylinders, single density, 10
  sectors on each of two tracks per cylinder, directory on cylinder 8 side 1. Its
  twin `newdos80-SSSD-80T.dmk` holds the same content single-sided, and their
  deleted-marked file occupies the same absolute sectors on both, which confirms
  the side-0-then-side-1 order a second way.
- `qb-games2-flippy-games1.dmk` and `games1_flippy_games2.dmk`: the two sides of
  one flippy disk, read separately. Each is its own single-sided disk with its own
  directory, so they are not aliases. Both are double density with a
  single-density 10-sector cylinder 0, and both have their directory mid-track at
  cylinder 10 sectors 8-17. The first also has an incomplete cylinder 37 (17
  sectors) and two cylinders left over from an earlier format.
- `irwin-newdos80-v2.0.dmk`: PDRIVE says `TC=35` but the image holds 40 formatted
  cylinders, and the GAT agrees with PDRIVE, marking everything past cylinder 34
  unavailable. A formatted cylinder is not necessarily one the DOS will use.
- `SuperUtility-1su.dmk`: copy protection with 182 duplicate sector numbers per
  track (same number in both densities) and garbage side bytes in its IDAMs
  (32, 64, 72, ...). A sector map keyed by position keeps only the last of each.
- `NEWDOS90.dmk`: the NEWDOS/80 lump case described above. NEWDOS/90 is an
  update of NEWDOS/86, itself built on NEWDOS/80 v2, so the on-disk rules are
  NEWDOS/80's. Its GAT byte 0xCB is 0x82, which the handbook documents as the
  identifier for NEWDOS/80 itself rather than a version number; our code
  misreports it as "version 8.2".
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
