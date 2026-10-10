# TRS-80 floppy formats: verified notes

Findings from researching the specs and measuring them against the disks in
`~/mine/trs80-floppy-regress`. Everything here was checked against real disks or
quoted documentation; guesses are labeled as such.

## Sources

- Tim Mann's [disk image spec](https://www.tim-mann.org/trs80/dskspec.html) covers JV1 and JV3, not DMK.
- David Keil's emulator documentation covers DMK. Both of its mirrors were down
  when this was written; a copy is at `~/Downloads/dmk.html`.
- [Tim Mann's FAQ](https://www.tim-mann.org/trs80faq.html) for hardware and density questions.
- **The DOS manuals** are in `~/Dropbox/Personal/Books/TRS-80/disk/`, each with a
  searchable `.txt` sidecar; `~/Dropbox/Personal/Books/CLAUDE.md` explains how to
  search them, and warns that the OCR of old scans garbles hex. Page numbers below
  are PDF pages. The ones that describe on-disk structures:
  - *NEWDOS-80 Version 2.0 Manual* (`NEWDOS/`): lumps, PDRIVE and the directory
    (chapter 5, pages 96-101), and conversion from version 1 and compatibility
    with TRSDOS 2.3 and 1.3 (chapter 12, pages 187-195). Also
    [online](https://www.trs-80.com/sub-reference-newdos80-manual-2.htm).
  - *TRS-80 Hacker's Handbook for NEWDOS-80* (`NEWDOS/`): the PDRIVE parameter
    table (page 73), the directory, GAT and HIT sectors (74-76), and an appendix
    explaining lumps and PDRIVE (from 138). Printed page numbers run 8 behind.
  - *LDOS 5.1 User's Manual (retyped text)* (`LDOS/`), "Tech Info - Directory
    Records", pages 209-219: directory entries, the GAT, the HIT, and the
    granule table for every LDOS media type.
  - *The Programmer's Guide to TRSDOS Version 6* (`TRSDOS/`), chapter 5 (pages
    45-57): the GAT, HIT and directory entries for TRSDOS 6 and LS-DOS, in more
    detail than any other source. Chapter 4.2 (pages 30-35) is the Drive Control
    Table, and 8.10 (page 145) the boot track and system information sector. The
    *Model 4 and 4P Technical Reference Manual - Software* says the same more
    briefly (pages 3-4, 18-19).
  - *TRSDOS 2.3 Decoded and Other Mysteries* (`TRSDOS/`): Model I TRSDOS 2.3's
    directory structures (pages 24-27) and its boot sector, disassembled (210-213).
  - *TRS-80 Disk & Other Mysteries* (1979, `disk/`): directory dumps of TRSDOS
    2.2, NEWDOS 2.1 and VTOS 3.0, but the OCR is nearly unreadable.
  - Nothing in the library documents TRSDOS 1.3's directory; the *TRSDOS 1.3
    Reference Guide* is commands only. What we know about 1.3 is measured.
  - *Mod III ROM Commented* (`TRS-80/`) has the Model III boot code, at 3455H.
  - *Machine Language Disk I-O & Other Mysteries* (1982, `disk/`) is about driving
    the floppy controller. For decoding it adds the 16-bit password hash, as
    the source of a password finder (pages 116-118, checked on the scan), the
    fact that TRSDOS and VTOS store their SYS0 boot messages negated (page 93),
    and the Model I and III track formats (pages 18-28, 96-97).

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
MultiDOS uses either allocation depending on the disk, and several other sources
use NEWDOS/80-style lumps too, which is why the lump model treats all of these as one
layout with different parameters.

**Tandy's Model II lineage** — Model III TRSDOS 1.x, Model I TRSDOS 2.7DD/2.8,
and Model II TRSDOS — are related to each other and can't read each other's
disks. 2.7DD reportedly has the `FE` boot prefix of the 1.3 family but 32-byte
entries. Out of scope for now, as are CP/M and game disks with no file system.

## Boot sector prefixes

The first bytes are executable code whose operand holds the directory cylinder,
so the prefix identifies the layout. Across the collection as it stood at 104
disks (before the five NEWDOS/80 disks below were added):

| Prefix | Meaning | Disks |
|---|---|---|
| `FE xx` | 1.3 layout, directory cylinder in byte 1 | 12 |
| `00 FE xx` | 2.3 family, directory cylinder in byte 2 | 70 |
| `?? FE xx` | 2.3 family (`F3 FE` DOSPLUS, `76 FE` some LDOS) | 5 |
| `01 82`, `00 00` | MULTIDOS, directory cylinder still in byte 2 | 6 |

Mask the cylinder byte with 0x7F; DOSPLUS sets the high bit. The Model I ROM
boots cylinder 0 sector 0 in single density; the Model III ROM boots sector 1 in
double density, loading it at 4300H (*Mod III ROM Commented*, 34E3H; all ten 1.3
disks are double density from cylinder 0 on). That asymmetry is why dual-boot
disks put two boot sectors on cylinder 0, one of each density, and nothing else.

The manuals add:

- **TRSDOS 6 keeps the directory cylinder in byte 2 of both sector 0 and sector
  1**, so that either ROM finds it (*Programmer's Guide*, page 145). That holds on
  every TRSDOS 6 and LS-DOS system disk and blank disk we have; some data disks
  have 0xE5 filler in sector 1.
- **In TRSDOS 2.3, byte 0 is a flag that BACKUP sets**, and is 0x00 otherwise;
  bytes 0-2 are `00 FE nn`, which executes harmlessly as `NOP; CP nn` (*TRSDOS 2.3
  Decoded*, pages 211-212).
- The directory cylinder is how every DOS finds the directory. TRSDOS 6 also
  copies it into its drive table, and re-reads the boot sector when a directory
  read returns an ordinary data mark, which it takes to mean the disk was changed.

## The HIT

The hash is 11 characters, the 8-character name and 3-character extension, both
space padded:

    hash = 0
    for each of 11 bytes: hash = rotateLeft8(byte XOR hash)
    if hash == 0: hash = 1

Position in the HIT gives the directory entry. Verified on real disks:

- **2.3 family and NEWDOS/80:** `hitIndex = (entryIndex << 5) | (dirSector - 2)`,
  where `dirSector` counts sectors from the start of the directory in the linear
  order of the lump model (side 0, then side 1), so the GAT is 0 and the HIT is 1.
  Five bits means 32 entry sectors at most; on a double-sided 18-sector directory
  the last two sectors of side 1 (directory sectors 34 and 35) can't be
  addressed, and LDOS leaves them empty.

  An older reading, `(entryIndex << 5) | (side << 4) | sectorIndexWithinSide`
  with 2 subtracted on side 0 only, gives the same index whenever the directory
  starts at sector 0 of an 18-sector track, which is why it worked for LDOS. It
  fails everywhere else: on the NEWDOS/80 disks it finds 316 of the 1,379 hashes the
  linear formula finds, because their directories start mid-track or on side 1.
- **1.3:** `hitIndex = sectorIndex * 5 + entryIndex`, dense, 80 bytes total.

Gotchas: one-byte hashes collide often, so check `HIT[expectedIndex]`, never
"is this hash anywhere". The same numbering, the *Directory Entry Code* (DEC), is
used by the bytes that link a primary entry to its extended entries. The LDOS
5.1 manual and the TRSDOS 6 guide both describe the HIT as eight rows of 32, one
row per entry within a sector and one column per directory sector, and give
the number of columns used as sectors per cylinder minus 2, at most 32.

**System files sit at fixed DECs**, because the DOS loads its overlays by
position rather than by name. The reservations differ:

| DOS | Reserved DECs |
|---|---|
| TRSDOS 2.3 | 0x00-0x07 and 0x20-0x27: entries 0 and 1 of all eight sectors (*TRSDOS 2.3 Decoded*, page 26) |
| LDOS 5.1 | the same 16, on data disks too (LDOS manual, page 209) |
| TRSDOS 6, LS-DOS | the same 16 on system disks; only 0x00 and 0x01 on data disks (*Programmer's Guide*, page 53), as GAT byte 0xCD bit 7 says |
| NEWDOS/80 | only 0x00 and 0x01 are kept free; everything else is used when the system files are absent |

In all of them BOOT/SYS is 0x00, DIR/SYS 0x01, SYS0-SYS5 0x02-0x07 and SYS6-SYS13
0x20-0x27. On a directory longer than eight sectors, entries 0 and 1 of the later
sectors hold ordinary files. NEWDOS/80 version 2 continues the pattern with
SYS14-SYS21 at 0x40-0x47 (measured on every NEWDOS/80 v2 system disk; version 1 stops
at SYS13), and `NEWDOS90.dmk` adds SYS22-SYS29 at 0x60-0x67.

**TRSDOS 2.x writes 44 (0x2C) into DIR/SYS's HIT slot** instead of its hash (196,
0xC4). All nine TRSDOS 2.x disks in the collection do this, so on those DIR/SYS
never hash-matches; `evaluate()` counts 0x2C as a hit, but only for a DIR/SYS
entry in DEC 0x01. BOOT/SYS matched on all 68 disks that have it. The NEWDOS/80
manual (page 98) calls 0x2C a bug of old Model I disks, which NEWDOS/80 reports as
"file not in directory" until it's patched to 0xC4, and the HIT dump in the
1979 *Disk & Other Mysteries* (page 45) has it too.

## TRSDOS 2.3B

Measured on `trsdos-2.3B-sssd.dmk`, which boots on an emulator and calls itself
2.3B. Nothing online documents the revision; the only outside trace is the
NEWDOS/80 PDRIVE flag `M`, "TRSDOS ModI 2.3B or higher or ModIII read", which
says other DOSes needed a special mode for its disks.

- **No BOOT/SYS or DIR/SYS directory entries.** The system files sit at DEC n
  for SYSn (0x00-0x06, with SYS8 wrapping to 0x20), which is standard 2.3's
  layout shifted two slots earlier: 2.3 puts BOOT/SYS at 0x00, DIR/SYS at 0x01
  and SYS0 at 0x02. Every entry's extent matches that file's extent on a normal
  2.3 disk, so the names are correct, and no entry points at the directory
  cylinder. The SYS7 slot holds a second SYS5 entry with an identical extent.
- **The boot code doesn't use the directory.** 2.3's boot sector reads directory
  sector 4, entry 0 (SYS0's fixed slot), checks only the in-use bit, and follows
  the extent: `3A 02 42 57 1E 04` (`LD A,(4202h)`, `LD D,A`, `LD E,4`). 2.3B's
  reads SYS0's load records straight from cylinder 0 sector 5: `16 00 1E 05`.
  Only the first seven bytes of the two boot sectors agree, which makes that a
  clean fingerprint.
- **GAT byte 0xCB is 0**, so we report "TRSDOS 0.0". The GAT still marks the
  directory cylinder fully allocated, which is what actually protects it.

So the DOS never needs BOOT/SYS or DIR/SYS entries: the directory is reached by
absolute position from the boot sector's byte 2, and those entries are
bookkeeping. The consequence for decoding is that a 2.3B system disk has hashes
only for its SYS and user files, and a 2.3B *data* disk may well have no
directory entries at all — not measured, since we have no such disk — which
would leave nothing for the HIT check to confirm.

## Cylinders, sides, and allocation

A cylinder is one head position, holding one track per side. The address mark
stores a cylinder number plus a side number, and both sides use the *same*
cylinder number, so an 80-track double-sided disk is 80 cylinders and 160
tracks. Everything TRSDOS calls a track number is really a cylinder.

On a double-sided disk:

- **Allocation sides are not media sides.** Which sides the DOS allocates is a
  property of how the disk was formatted, and it disagrees with the image in
  both directions:
  - *Double-sided media used single-sided.* The two Cornsoft disks and `DS023`
    are double-sided images whose GATs have 3 granules per byte; read
    single-sided, every file is clean, and read double-sided, files break.
    Side 1 is leftover from an earlier format.
  - *Double-sided allocation imaged single-sided.* Cornsoft-Brix `bath3` and
    `F05 - Monas Main Disk 2` have 6-granule GATs on one-sided images, so their
    side-1 data simply isn't in the file.

  So allocation sides must come from the DOS, never from `geometry.sideCount`.
  Two signals prove double-sided allocation without knowing which DOS wrote
  the disk. One is a GAT byte with a clear bit above the single-sided granules
  (`0xC0` free on double-sided double density, against `0xF8` single-sided).
  The other is an extent whose granule offset is at least the granules per
  track: read single-sided, every file that starts on side 1 has one. That
  fired on 11 of the 34 double-sided images, including `ldos-5.3.0-dsdd.dmk`,
  whose GAT is `0xFF` throughout and so carries no signal (21 such extents).
  LDOS's GAT byte 0xCD has bit 5 set on double-sided disks too, but only on
  that line. When neither signal fires, the two readings place every file the
  same way, except where a multi-granule extent crosses from side 0. There, on
  the Cornsoft disks, `DS023` and `willus/fractl5.dmk`, the single-sided
  reading is the clean one: text files are 62-100% printable against 31-81%,
  and code files are CMD programs. So the decoder assumes one side unless
  something proves two.

  Reading one side as NEWDOS/80-style lumps can mimic two: on the TRSDOS 6
  double-sided disks (the TRSLink issues), six 5-sector granules per lump on
  one side reach the same directory sectors as six 6-sector granules on two,
  and every extent fits. DIR/SYS gives it away, because its extent names the
  directory's lump (20) and that reading puts the directory in lump 12. So
  when a directory has DIR/SYS, a reading that puts the directory anywhere else
  is rejected. That also rejects the leftover side-1 directory on `Super Dos
  [IRA334]`, whose DIR/SYS points elsewhere, and the short NEWDOS/80-style
  directory that dodged the bad sector on `03 -Assignments [T40S01]`. TRSDOS
  1.3 and 2.3B directories have no DIR/SYS, so they get no help from it; boot
  byte 2 would cover them.
  Comparing the directory sectors' interleave on the two sides doesn't help:
  it's the same on every double-sided disk in the collection, including those
  whose side 1 is left over from an earlier format.
- **Whether the directory uses side 1 depends on the DOS.** LDOS uses the whole
  cylinder: the GAT and HIT are in sectors 0 and 1 of side 0, and every sector of
  side 1 holds directory entries. DOSPLUS 3.4 (`dospls34.dmk`) keeps the
  directory on side 0 and allocates side 1 of that cylinder to files: SYS10,
  SYS11 and SYS12 live there. DIR/SYS's own extent says which, 3 granules on
  `dospls34` against 6 on all three double-sided LDOS disks. The deleted marks
  agree (18 and 0 against 18 and 18), but the HIT can't tell them apart:
  `ldos-5.3-dsdd-80-tracks.dmk` has a two-sided directory with no entries on
  side 1 yet. (The Cornsoft disks also show a 3-granule DIR/SYS, but only because
  they don't use side 1 at all; see above.)
- A GAT byte covers a whole cylinder. Double-sided LDOS at 18 sectors per track
  has 6 granules per cylinder, 3 per side, so a free byte reads 0xC0.
  Single-sided 1.3 reads 0x3F.
- Granule offsets run across the cylinder: offsets 0-2 are side 0 and 3-5 side 1.
  Sector order is side 0, then side 1, then the next cylinder — verified by
  17 files whose extents cross the side boundary and still decode cleanly.

## GAT bytes 0xCB-0xCD

LDOS added three bytes to the end of the 2.3 GAT, and TRSDOS 6 and LS-DOS 6
(LDOS's successors) kept them:

    0xCB   DOS version, BCD (0x51 = 5.1)
    0xCC   cylinders minus 35
    0xCD   bits 0-2 granules per track minus 1, bit 5 double sided,
           bit 6 double density, bit 7 data disk (TRSDOS 6 and LS-DOS only)

TRSDOS 6.2 and LS-DOS also describe the disk's whole geometry at 0xF5-0xFF; see
"The media block" below.

Other DOSes write 0xCB but not, or not reliably, the other two. Checked on all
213 decoded 2.3-family disks against each disk's cylinders, media density,
granules per track and (where extents or the GAT prove it) allocation sides:

| DOS | 0xCB | 0xCC and 0xCD |
|---|---|---|
| LDOS 5.x, TRSDOS 6.x, LS-DOS 6.3, DOSPLUS IV | 0x50-0x53, 0x60-0x63 | all fields right on all 71 (see below) |
| TRSDOS 2.1-2.3 | 0x21, even on 2.3; 2.3B writes 0 | both 0 |
| VTOS 3.0 | 0x30 | both 0 |
| DOSPLUS 3.x, 4.0 | version | 0xCC right; 0xCD usually 0, sometimes 0x01 or 0x20 |
| NEWDOS/80 | 0x80, 0x82 | usually 0; 0x3F and 0x23 on the eleven Infocom disks |
| MultiDOS 1.x | 0x10, 0x17, 0 | both 0x28 |
| MultiDOS 2.0 | 0x17, 0xFF | LDOS-style, but `Bright-412` puts granules per *cylinder* (6) in bits 0-2 |

Two of those 71 aren't Logical Systems DOSes at all: the two 0x60 disks,
`DOSPLSIV.dmk` and `DOSPLUS4.dmk`, are DOSPLUS IV (its SYS0 banner credits
Micro-Systems Software, 1983), which writes the TRSDOS 6 GAT format. So the
question for these fields isn't "is this LDOS" but "does this disk use the
LDOS/TRSDOS 6 GAT", and 0xCB doesn't answer even that alone.

On those 71 disks every field checks out against the disk itself: the version
is plausible (5.0, 5.1, 5.3; 6.0 from DOSPLUS IV; 6.1, 6.2, 6.3), the density bit matches the
media, the granules per track give the granule size that decodes every CMD and
SYS file, and the side bit matches the allocation sides on all 71 (each proven by
one-sided media, a clear GAT bit above the side-0 granules, or a side-1 extent).
0xCC is the cylinder count the DOS formatted, and matches the lockout table on
the 70 disks that have one (the 8-inch LS-DOS `l2-631a.dmk` has 0xFF from
0x60 on); it equals the image's formatted cylinders on 70, and on `ldos-5.0.3-sssd.dmk`
the image has five more, blank (0xE5) and locked out, so the DOS never used them.

Outside the LDOS line the granules field is right on 9 of 64 disks, and the side
bit misleads in both directions: Cornsoft-Brix `bath3` (DOSPLUS 4.0) allocates
both sides with 0xCD = 0, and the Infocom disks claim two sides on one-sided
media.

0xCB alone doesn't identify the DOS. `newdos30.dmk` (NEWDOS 3.0) writes 0x53
and then zeros. `ORCH80.DMK` is a 1980 Orchestra-80 distribution disk, written
by the program's own copier (ORCHCOPY) with a non-Tandy boot sector and a
TRSDOS 2.x GAT, which has the ASCII text "U41" in 0xCB-0xCD where TRSDOS 2.3
writes 21 00 00. Read as LDOS fields that's version 5.5, 87 cylinders and two
sides, on a one-sided 35-cylinder disk. (UltraDOS, `ultdos42.dmk`, also writes
0x55, with a consistent 0xCD; there was no LDOS 5.5.) So trust 0xCC and 0xCD only
when 0xCB is 0x50-0x63 **and** the byte agrees with the media: the density bit matches, the
granules per track times the granule size is the sectors per track, and 0xCC + 35
is at most the image's cylinders. Every disk that passes that test has a correct
side bit.

### What the LDOS 5.1 manual says about these bytes

- **0xCB** is "the operating system version used in formatting the disk", used
  "to determine whether or not the diskette contains all of the parameters
  needed for LDOS 5.1 operation". It's LDOS's own marker, not a convention other
  DOSes share.
- **0xCC** is excess-35 "so as to provide complete compatibility with alien
  systems not maintaining that byte": a zero means "35, or not maintained".
- **0xCD**: bit 6 double density, bit 5 two-sided, bits 2-0 granules per
  cylinder minus 1; bits 7, 4 and 3 reserved (in 5.1). "Cylinder" here means
  one side: the manual's granule table "assumes single sided media", and on
  every double-sided LDOS disk bits 2-0 hold 3 while the GAT bytes hold 6
  granules. MultiDOS 2.0's `Bright-412` is the one disk that stores 6.
- **The granule table** (single-sided):

      5" SD   10 sectors   5 per granule   2 granules   80 cylinders max
      5" DD   18           6               3            80
      8" SD   16           8               2            77
      8" DD   30          10               3            77
      5" hard 128         16               8           153
      8" hard 256         32               8           256

  So for every floppy the count is 2 in single density and 3 in double, which
  is the rule `generateTrsdos23Candidates()` uses.
- **0x60-0xBF**, the lockout table, exists for mirror-image backups; hard disks
  have none and extend the allocation table through 0xCA instead.
- **The directory** is on a single cylinder, at most 32 entry sectors (the HIT
  limit): 8 on 5" SD single-sided, 18 double-sided, 16 and 32 in DD.
- **REPAIR** converts alien disks, explicitly including Model I TRSDOS 2.3: it
  sets 0xCC and the granule byte, strips the high bit of the boot sector's
  directory-cylinder byte (DOSPLUS sets it), and **writes an LDOS boot sector**.
  So a disk's boot sector identifies whoever last formatted *or repaired* it.

### What the TRSDOS 6 manuals add

The *Programmer's Guide to TRSDOS Version 6* (pages 46-49) and the Model 4
technical reference (pages 18-19) describe the same GAT, with these additions:

- **0xCD bit 7 means a data disk** (1) or a system disk (0), which decides how
  many DECs are reserved (see the HIT). Bits 4 and 3 are "reserved for internal
  system use". Measured on the 34 TRSDOS 6 and LS-DOS disks: the bit agrees
  with the presence of SYS0/SYS on 21. Twelve of the others (the ten *TRSLink*
  magazine disks and `Bright-340` and `-361`) have the bit clear and no system
  files, and also 0xE5 filler in cylinder 0 sectors 1 and 2, so something other
  than TRSDOS 6's FORMAT made them. The last is DOSPLUS IV's `DOSPLUS4.dmk`
  (bit set on a system disk). **Under LDOS 5.x the bit means
  nothing**: LDOS 5.3 system disks write 0xCA (bits 7 and 3 set), and 5.1 says
  bit 7 is reserved.
- The granule table allows **96 cylinders** on 5" media (LDOS 5.1 said 80), the
  size of the allocation table.
- **The media block, 0xF5-0xFF** (TRSDOS 6.2 and LS-DOS 6.3). The guide says
  0xF4-0xFF holds 0x03, "LSI", then a copy of the last seven bytes of the Drive
  Control Table the disk was formatted with. On the disks, 0xF4 is 0x00 and the
  block starts at 0xF5; LS-DOS 6.3.1 writes "631" instead of "LSI". The DCT
  bytes (guide, pages 31-34) are:

      0xF9  flags 1: bit 6 double density, bit 5 8" drive, bits 1-0 step rate
      0xFA  flags 2: bit 6 double-density capable, bit 5 two-sided,
            bits 3-0 drive select
      0xFB  current cylinder (0)
      0xFC  highest cylinder number (cylinders - 1)
      0xFD  bits 4-0 sectors per track - 1 (bits 7-5 heads - 1, hard disks only)
      0xFE  bits 7-5 granules per track - 1, bits 4-0 sectors per granule - 1
      0xFF  directory cylinder

  **All 18 disks that have it describe themselves exactly**: density, sides
  (against the allocation sides), sectors per track, granules per track and
  granule size (against the decoded files), the directory cylinder, and the
  cylinder count (against 0xCC). That includes data disks and both 8" disks,
  but only one double-sided disk (`LOAD-80 Issue 85-03`). It's the most
  complete self-description any disk in the collection carries, and FORMAT
  writes it on data disks too, unlike the system information sector below.
- **The system information sector** is cylinder 0 sector 2 (guide, page 145):
  0x00 the DOS version, 0xC0 the disk type (0xFF system, 0x00 data), 0x10-0x1F
  the pack name and date, 0x20-0x6F the AUTO command, and 0x70-0xBF the drive
  table, eight 10-byte DCTs. Like NEWDOS/80's PDRIVE copy in the same sector, the
  table describes the *drives* of the machine that wrote it, and it's zeros on
  blank disks. Measured: the nine TRSDOS 6 and LS-DOS system disks have version
  0x61-0x63, type 0xFF, and a drive 0 DCT that matches the disk (a tenth,
  the 8" `l2-631a.dmk`, has a short sector there); the nine data
  disks made by FORMAT have the version, type 0x00 and zeros. The twelve disks
  above have 0xE5 filler, and the two DOSPLUS IV disks something else.

### Granules per track without the GAT header

The decoder needs nothing from 0xCB-0xCD. On all 138 TRSDOS-style disks with
files, the granule count is the density default: 2 granules of 5 sectors on
10-sector tracks (52 disks), 3 of 6 on 18-sector tracks (84), and 3 of 10 on
30-sector 8" tracks (2), exactly what `generateTrsdos23Candidates()` picks
without reading the GAT. When every granule count dividing the track (2-8) is
tried, the true one is uniquely best on all 138 by two checks that ignore the
header bytes: every file's extents cover its sector count, ideally tightly
(ceil(sectors / granule size) granules), and the strict GAT bitmap check, which
rejects counts that are too small but passes any count that is too large. (The
two apparent misses, Cornsoft-Brix `bath3` and `F05 - Monas`, were tested with
one side; with sides free, 3 x 2 wins.) Hash hits can't choose between granule
counts: a TRSDOS-style directory fills its cylinder whatever the granule size,
so every count scores the same. Blank disks stay ambiguous, which costs nothing.

## Identifying the DOS

Strongest first. Measured on all 274 images.

1. **The SYS0/SYS banner**, on system disks only. It names the DOS and exact
   version: `L D O S - The Logical Disk Operating System - Ver 5.1.4`,
   `TRSDOS 06.02.00 - Copyright 1984 Logical Systems Inc.`,
   `LS-DOS 06.03.00 - Copyright 1986 Logical Systems Inc.`,
   `NEWDOS80, APPARAT'S DISK OPERATING SYSTEM, VERSION 1.0` (v1.1 words it
   differently), Micro-Systems Software for DOSPLUS, `COPYRIGHT (c) 1979 BY
   TANDY CORPORATION` for TRSDOS 2.x, and `(C) 1981 BY LOBO DRIVES
   INTERNATIONAL` for the Lobo edition of LDOS. Some are unreadable (the
   "TRS-80 Format" disks' SYS0). **TRSDOS 2.x's version banner is stored
   negated** (each byte is 256 minus the character), as is VTOS's, according to
   *Machine Language Disk I-O*; negated, five images read `TRSDOS - DISK
   OPERATING SYSTEM - VER 2.3`. Search for the negated form too. (Single-density
   DMK images store each byte twice, so a plain byte search of the image file
   misses it there.) The banners showed that three disks named "trsdos-2.1"
   were 2.2 and 2.3, and they were renamed (October 2026; see "Disks worth
   remembering").
2. **The boot sector's code.** FORMAT writes the same boot sector to every disk,
   data disks included, so hashing it (with byte 2, the directory cylinder,
   masked) identifies the formatter. 274 disks have 120 distinct boot sectors.
   The big clusters are one DOS family each and mix system and data disks
   (17 TRSDOS 2.x disks; an LDOS 5.1/5.3 cluster of 9 system and 6 data disks;
   one per MultiDOS version and per NEWDOS/80 v1 variant). But one DOS has several
   (LDOS at least four, by version and density); some boot sectors belong to a
   formatting tool rather than a DOS (one is on data disks whose GATs say 0x22,
   0x34 and 0x50; another on both TRSDOS 6.2 data disks and the "TRS-80 Format"
   disks with GAT 0x82); and 78 are singletons. A table of known hashes would
   need curating, labelled from the banners of system disks that share them.
3. **Boot messages** are mostly short and shared ("NO SYSTEM", "DISK ERROR").
   LDOS writes them in mixed case ("Disk error", "No system") on 31 of 39 disks,
   TRSDOS 2.x in capitals. A few are distinctive: "Cannot boot, DATA DISK!"
   (TRSDOS 6 and LS-DOS data disks), "NO MICRODOS" (Percom), "ULTRADOS formatted
   diskette", MultiDOS's banner and "(c) CEC." (Cosmopolitan Electronics).
4. **GAT byte 0xCB**, last; see "GAT bytes 0xCB-0xCD".

## The lump model

One model covers the TRSDOS family, NEWDOS/80 and MultiDOS. The DOS sees the
disk as a single **linear sequence of sectors**: side 0 of a cylinder, then side
1 (if the DOS allocates it), then the next cylinder, starting at the first
cylinder of the data area. A **lump** is `sectorsPerLump` consecutive sectors of
that sequence, made of granules, and maps to exactly **one GAT byte**. Extents and
the directory location are virtual positions, (lump, granule, sector within the
granule), and every family maps them to physical sectors the same way:

    linear   = lump * sectorsPerLump + granule * sectorsPerGranule + sector
    cylinder = firstDataCylinder + linear / (sectorsPerTrack * allocationSides)
    side     = (linear % (sectorsPerTrack * allocationSides)) / sectorsPerTrack
    sector   = firstSectorNumber + linear % sectorsPerTrack

The families differ only in the parameters:

| | Lump | Granule | Data area starts |
|---|---|---|---|
| TRSDOS family | one cylinder (both allocated sides) | 5 sectors single density, 6 double | cylinder 0, always: lump L *is* cylinder L |
| TRSDOS 1.3 | one cylinder | 2 sectors single density, 3 double | cylinder 0; sectors numbered from 1 |
| NEWDOS/80 | `GPL` granules (2-8) | 5 sectors | the first cylinder formatted at `SPT` |
| MultiDOS | either of the above, per disk | 5 or 6 sectors | as above |

The TRSDOS family is simply the case where a lump happens to be a cylinder. A
NEWDOS/80 lump is a run of sectors that crosses track and side boundaries freely;
it coincides with one track only when `GPL=2` on a 10-sector track, and only
then do successive lumps alternate sides.

**Verified against the whole collection (276 images).** Re-reading every file
in the 104 snapshots from its recorded extents through this mapping reproduced
2,284 of 2,300 files byte for byte. The other 16 decode cleanly under the model
where the old decoder produced errors (`dospls34.dmk`, `NEWDOS_80sssd_jv1.DSK`),
so they're old bugs it fixes. Decoding every image independently, with no
snapshots, covered 139 TRSDOS-family disks (2,028 of 2,072 load modules decode
cleanly; the rest are on disks whose names record bad tracks, or aren't load
modules under any reading), 12 TRSDOS 1.3 disks (114 of 115), and about 60
NEWDOS/80 disks covering `GPL` 2, 6 and 8, single- and double-sided, uniform and
mixed density. `GPL` 3, 4, 5 and 7 appear on no disk.

`Trsdos.logicalToPhysical()` implements this mapping (October 2026). Through the
real class, 2,294 of the 2,300 snapshot files read back identical; the other six
are on `dospls34.dmk`, whose snapshot was made reading it single-sided. The five
disks with the owner's PDRIVE settings decode to exactly those settings (`GPL`,
`DDSL`, and sides), including both `TI=CK` flippies and the 160-lump
double-sided disk, with every file clean.

What the decoder must **not** assume, because the collection breaks each one:

- **Allocation sides** come from the DOS, not the image; see the previous
  section.
- **Granule size and `GPL` aren't fixed by the DOS.** MultiDOS uses 6-sector
  granules with lump = cylinder on `MLTDOS4P.dmk` (uniform double density), but
  5-sector granules with `GPL=2` on its "pseudo density" disks, which have a
  single-density cylinder 0. Several disks whose GAT doesn't identify NEWDOS/80 (an
  Infocom loader disk, `BUSINESS`, `COMREF`) also use 5-sector granules on
  18-sector tracks, and only this model reads them. Treat (granule size, `GPL`) as candidate parameters for
  every family and let the score choose.
- **Where the data area starts.** For NEWDOS/80-style lumps it's the first cylinder
  formatted at `SPT`, which skips cylinder 0 when it's in the other density. On
  the double-sided `NEWDOS-80 v2.0 ... [German].dmk`, cylinder 0 is 5-sector
  single density on *both* sides, and only skipping the whole cylinder finds the
  GAT (36 of 36 hashes, `GPL=6`). TRSDOS-style lumps never skip anything, since
  an extent's lump byte is the physical cylinder number: on
  `trs80gp/l2-631a.dmk` (LS-DOS on an 8" disk with a single-density cylinder
  0), the GAT is on cylinder 38, which is boot byte 2, not 39.
- **The HIT index** must be linear within the directory; see the HIT section.
- **The extent count is the low 5 bits plus one** in every family that uses it,
  NEWDOS/80 included: with the +1, the extents cover the sector count of all 213
  files on the `GPL=2` NEWDOS/80 disks and all 15 on `52VFRED.DMK` (`GPL=8`); without
  it they cover 4 and 1. TRSDOS 1.3 alone stores the count itself.

## Directory entries (2.3 family)

Documented by *TRSDOS 2.3 Decoded* (page 27), the LDOS 5.1 manual (pages
210-213), the *Programmer's Guide to TRSDOS Version 6* (pages 54-57) and the
NEWDOS/80 manual (pages 99-101). They agree on the layout:

    0      attributes: bit 7 extended entry (FXDE), bit 6 system file,
           bit 4 in use, bit 3 invisible, bits 2-0 protection level
    1      flags, or in an FXDE the DEC of the entry it extends
    2      date (LDOS line only)
    3      EOF offset within the last sector
    4      logical record length, 0 meaning 256
    5-15   name and extension, space padded
    16-17  update (owner) password hash; 18-19 access (user) password hash
    20-21  sector count, LSB first ("ending record number")
    22-29  four extents: lump (cylinder), then bits 7-5 the granule within it
           and bits 4-0 the granule count minus 1
    30-31  0xFF, or 0xFE followed by the DEC of the next FXDE

Where they differ:

- **Byte 1.** LDOS and TRSDOS 6: bit 7 CREATEd (never shrinks), bit 6 modified
  since the last backup, bit 5 open (TRSDOS 6; reserved in LDOS 5.1), bit 4 date
  not set, bits 3-0 the month. NEWDOS/80: bit 7 no more space may be allocated,
  bit 6 no excess space released at close, bit 5 written since last cleared,
  bits 4-0 undefined. TRSDOS 2.3 calls the byte "overflow".
- **Byte 2.** LDOS line: bits 7-3 the day, bits 2-0 the year minus 1980. NEWDOS/80
  and TRSDOS 2.3: reserved, 0. So only the LDOS line has file dates, and a
  month in byte 1 of a NEWDOS/80 entry is really flag bits.
- **Byte 0 bit 5**: a partitioned data set in TRSDOS 6, reserved elsewhere.
- **Protection levels.** LDOS 5.1 and NEWDOS/80: 0 full, 1 kill, 2 rename, 3
  unused, 4 write, 5 read, 6 execute, 7 none. TRSDOS 6 renumbers the middle: 1
  remove, 3 write, 4 update.
- **Extents.** TRSDOS 2.3 counts bytes 22-31 as five "granule allocation pairs",
  the fifth being the link. NEWDOS/80 allows 0xFE or 0xFF in the first byte of any
  pair: 0xFF ends the list, 0xFE means the next byte is an FXDE's DEC. It limits
  lump numbers to 0-191, the most the GAT can hold. The NEWDOS/80 manual says
  outright that the count is the number of granules less one, which settles the
  handbook's contradiction (see "NEWDOS/80 lumps").
- **An FXDE** uses only bytes 0, 1 and 22-31 (bits 7 and 4 of byte 0 set).
- **Deleting a file** clears bit 4 of byte 0 and the HIT byte and frees the
  granules, leaving the rest of the entry intact. A HIT byte of 0 means a free
  slot in every one of these DOSes.

## Password hashes

Passwords are stored as a 16-bit hash, LSB first: the master password in GAT
bytes 0xCE-0xCF, and each file's update and access passwords in directory bytes
16-19. *Machine Language Disk I-O* (PDF page 118) gives the algorithm as Z80.
Restated, with the password padded with spaces to 8 bytes, and checked against
a direct transcription of the listing on 20,000 random passwords:

    hi = lo = 0xFF
    for each byte c, last to first:
        t  = lo ^ ((lo & 7) << 5)
        hi, lo = t ^ (t >> 4) ^ c, ((t << 4) & 0xFF) ^ (t >> 3) ^ hi
    hash = (hi << 8) | lo

It checks out: eight spaces hash to 0x4296, which a file entry holds when it
has no password (stored 96 42), and **"PASSWORD" hashes to 0x42E0, TRSDOS's default
master password**, which is what the GAT's E0 42 is. In the snapshots the
master password is "PASSWORD" on 70 of the 77 2.3-family disks, blank on three
(`dosplus3.dmk` and the two Cornsoft SynthDev disks), zero on `NEWDOS90.dmk`,
and something else on `dospl31a.dmk`, `ldos-5.0.3-sssd.dmk` and `ldos513.dmk`.
The 1.3 disks hold 0x8FD3 (nine disks) and 0x5CEF (the blank `m3-trsdos-blank.dmk`), which don't correspond to
"PASSWORD" or blank under this algorithm, so TRSDOS 1.3 probably hashes
differently. Being 16 bits, a hash has thousands of short passwords that match,
so it can't be reversed to *the* password, only to *a* password.

## File sizes

In the 2.3 family, `sectorCount` includes the partly-filled last sector and the
EOF byte is an offset within it, so the size is
`(sectorCount - 1) * 256 + lastSectorSize` when the EOF byte is non-zero. In
1.3, the EOF byte adds to the full sector count. Getting this wrong makes every
partial-sector file exactly one sector too large.

Both rules are documented. The TRSDOS 6 guide's example: a count of 3 with an
EOF byte of 62 is two full sectors and 62 bytes. The NEWDOS/80 manual (pages
100 and 187) calls the 2.3 rule the "old TRSDOS format", which NEWDOS/80 keeps in
the directory for compatibility although its FCBs use a plain byte offset, and
says Model III TRSDOS 1.3 switched its directory to the plain offset, which made
**TRSDOS 1.1 and 1.2 disks unreadable by 1.3** and vice versa. So 1.1 and 1.2
directories differ from 1.3's at least in the size rule. `trsdos-1.2.dmk` is
1.2 (its boot code says "version 1.2") and decodes with the 1.3 layout, which
we report as 1.3, but its three files all end on a sector boundary, so it can't
tell the two rules apart.

## NEWDOS/80 lumps

- A lump is 2-8 granules (the PDRIVE `GPL` parameter); a granule is 5 sectors by
  default (`SPG`), and at most 8. "In NEWDOS/80 we place the Directory at the
  start of a lump not a track."
- The **third byte of the first sector holds the directory's starting lump**,
  not a track number: "The starting lump number of the directory is always
  contained as a hexadecimal value in the 3rd byte of each diskette's 1st sector".
- An extent's first byte is a lump number (0-253, though the GAT limits it to
  191); in the second byte the top 3 bits are the granule offset within the lump
  and the low 5 bits are the count minus one. The handbook says those bits are
  the count itself, but its own worked example contradicts that (a 3-sector file
  shows 0 there and must own one granule), and so do 228 files on real NEWDOS/80
  disks; see the lump model. The NEWDOS/80 manual (page 100) agrees: the count
  less one.
- Directory size is `DDGA` granules (2-6), giving 8, 13, 18, 23 or 28 entry sectors.
- Geometry lives in the PDRIVE table, which describes *drives*, not diskettes, so
  a data disk doesn't describe itself. But a **system** disk carries the table at
  drive-relative sector 2, i.e. cylinder 0 sector 2, and that copy is readable
  (see below).
- Model I NEWDOS/80 and TRSDOS disks are interchangeable only when the directory
  is 2 granules and the drive is 10 sectors/track, 2 granules/lump, 5
  sectors/granule. That is why some NEWDOS/80 disks in the collection decode with
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

**Where sector 0 of the data area is.** On every disk whose cylinder 0 is in the
other density from the rest (the `TI=..K` case below), lump 0 starts at cylinder
1; on uniformly formatted disks it starts at cylinder 0. `NEWDOS1D.dmk` and
`newdos80-2.0-ssdd.dmk` are the controlled pair, identical PDRIVE settings with
directories one cylinder apart. The double-sided case is settled by the German
NEWDOS/80 disk, whose cylinder 0 is single density on both sides: the data area
skips the whole cylinder, not just its side-0 track. The handbook says the
directory starts at "Drive sector 170" without defining where drive sector 0 is
on a mixed-density disk, so this rule is ours, not theirs — but it now holds on
every mixed-density NEWDOS/80 disk in the collection.

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

**With `K`, `TC` doesn't count track 0.** The NEWDOS/80 manual's settings for
reading version 1 Percom double-density disks (page 189, checked on the scan) give `TC=34` for a
35-track drive, and 39, 76 and 79 for 40, 77 and 80 tracks. The flippies agree:
their lockout tables cover 77 and 70 lumps, which is `TC * 18 / 10` for `TC=43`
(the owner's setting) and `TC=39` (a 40-track format), counting only the
double-density tracks. `games1_flippy_games2.dmk`'s image holds only 41 of its 43.

**NEWDOS/80 version 1 disks** (GAT byte 0xCB = 0x80), from the same page: single
density single sided is `SPT=10, GPL=2`; single density double sided is
`SPT=20, GPL=4`, so a lump is a whole cylinder, as in TRSDOS; and version 1's
double-density double-sided disks can't be read by version 2 at all.

**A NEWDOS/80 system disk carries its PDRIVE table at cylinder 0, sector 2**, as
sixteen-byte slots, one per drive. Verified against the owner's own listing for
three disks — every field matches:

    byte 0   DDSL            byte 5   GPL
    byte 1   lump count      byte 8   DDSL again
    byte 3   TC              byte 9   DDGA
    byte 4   SPT             byte 15  TD, apparently a bit field: bit 1 = double
                                      sided, bit 2 = double density (0=A, 2=C, 4=E, 6=G)

Bytes 2, 7, 0x0D and 0x0E hold the `TI` flags and the step rate; those bits are
only partly worked out. The lump count in byte 1 matches `TC * SPT / (SPG * GPL)`
on every disk, including the 160 of `newdos80-DSSD-80T.dmk`.

**The table is a strong hint, not ground truth.** It describes how the *drive*
was configured when the system disk was last written, and the disk in the image
can differ. Across the 28 images that carry one:

- `SPT` matches the media on 27. The exception is `73BFRED.DMK`, whose table says
  `SPT=18` (double density, single sided) while the disk is single density,
  double sided, i.e. `SPT=20`; its directory is found with `GPL=2` and 20.
- The `TD` bit field agrees with `SPT` on 23. The five that don't all come from
  the same source (the "FRED" disks): `TD=6`, which would be double density
  double sided, alongside `SPT=20` and single-density media.

So prefer the table's `GPL` and `DDSL` as the first candidates to try, trust
`SPT` over `TD`, and trust the media over both. Data disks have no table at all
(the flippies' sector 2 is 0xE5 filler). The later slots describe the owner's
*other* drives, so slot 0 is the one that matters.

The owner's PDRIVE settings for five disks are recorded in the `pdrive` field of
their sidecar JSON files in the regression repo. They are the only disks whose
intended geometry is known independently of the media, so prefer them when
checking a NEWDOS/80 decoder.

## NEWDOS/80 on-disk structures

From the handbook's chapter 5 (printed pages 66-68), cross-checked against the
seven NEWDOS/80 disks the collection had when this was written. "All seven" below
means those seven; the later additions are covered in the lump model section.

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
    0xCC       tracks above 35, used by other DOSes but not NEWDOS/80
    0xCD       density, sides and granules per track in some DOSes; NEWDOS/80 writes 0
    0xCE-0xCF  master password hash, LSB first; E0 42 is 42E0H, the hash of
               "PASSWORD" (see "Password hashes")
    0xD0-0xD7  disk name
    0xD8-0xDF  date
    0xE0-0xFF  AUTO command, at most 31 bytes plus a 0x0D terminator

**Byte 0xCB is usually a BCD version number**, although the handbook calls it a
DOS identifier and lists TRSDOS 0x23, NEWDOS/80 0x82, LDOS 0x51 and DOSPLUS 0x34.
Those are just common versions: the collection has 0x21 (TRSDOS 2.1 to 2.3), 0x33-0x35
(DOSPLUS 3.3-3.5), 0x50-0x55 (LDOS 5.x) and 0x60-0x63 (TRSDOS 6, LS-DOS 6.3).
The exception is NEWDOS/80, which writes `0x8n`: **0x82 for version 2 and 0x80
for version 1** (the DoubleZap disks, `cord2003`, `NEWDOS1D.dmk`, and eleven
disks in all). Reading it as BCD is why our decoder used to report "version 8.2",
and keying NEWDOS/80 detection on 0x82 alone misses every v1 disk. MultiDOS's
pseudo-density disks write 0x00 or their own version (0x17), and TRSDOS 2.3B
writes 0, so a zero here means nothing.

**Do not read 0xCC or 0xCD on a NEWDOS/80 disk.** Both are zero on all seven (and on
most later additions; the Infocom game disks hold 0x3F and 0x23), so the
cylinder count our decoder derives as `0xCC + 35` comes out as 35 even for the
80-cylinder disks, and the flags byte claims single sided and single density for
everything. NEWDOS/80 keeps that information in PDRIVE, not in the GAT.

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
  claims instead that NEWDOS/80 keeps "tracks above 35" there, which the disks
  disprove: it is 0 on all seven, including the 80-cylinder pair where the track
  reading would require 45. The NEWDOS/80 manual (page 98) confirms it: the
  extra entry sectors, 0, 5, 10, 15 or 20. Across all the NEWDOS/80 disks we see 0,
  5, 10 and 20 (the "FRED" disks).

The handbook's remark that the HIT "uses every second line in the sector" checks
out on all seven disks: with 8 directory entry sectors only the low 3 bits of the
sector field vary, so hashes land in the first 8 bytes of each 32, which in a
16-byte dump means every even line.

**NEWDOS/80 reuses the system-file slots.** Unlike the rest of the 2.3 family it
"does not exclude the use of the fixed slots for SYS files by other files if the
SYS files are not on the disk", so a NEWDOS/80 decoder must not assume entries 0 and
1 of each sector are reserved.

## Evidence that turned out to be reliable

For guessing a layout and directory location, strongest first:

1. **HIT hash matches.** A wrong layout or location matches roughly 1 in 256 by chance.
2. **The strict GAT check.** Every allocation byte's unused high bits must be
   set (2.3 family, NEWDOS/80) or clear (1.3), using the granules per GAT byte — that
   is, per lump, so 6 on a double-sided double-density TRSDOS-family disk, not
   the 3 per track. With that mask it passes at the true directory on all 86
   decoded disks and on none of 3,663 wrong-cylinder candidates, and it needs no
   directory entries, so it carries blank disks. Check every lump, lump 0
   included: the DOS marks cylinder 0 fully allocated, and byte 0 obeys the rule
   on all 108 disks checked (71 TRSDOS-family, 10 TRSDOS 1.3, 27 NEWDOS/80 system
   disks). Check exactly `lumpCount` bytes, which on NEWDOS/80 can be fewer or more
   than the cylinders. Caveats: a damaged GAT fails it
   (`Col 2 - 028 - No Box - Scripsit [T11-T12-T13 BAD].dmk` has one bad byte and
   44 of 51 hashes); some formatters leave the unused bits clear on 2.3-family
   disks (the two Planet Makruk disks, `willus/NEWDMIN.dmk`); and an all-0xFF
   sector passes the 2.3-family form, an all-zero sector the 1.3 form, so keep
   the printable name and date check alongside it.

   So `decodeTrsdos()` uses it as a preference, not a requirement (October
   2026): among candidates that aren't disqualified, one that passes beats one
   that doesn't, and score decides within each group. As a hard reject it lost
   9 of the 244 decoded disks; as a preference it loses none and changes six
   readings, five of them for the better, because it fixes the granules per
   lump, which hash hits can't: `41BFRED` and `49VFRED` (`GPL=8`; 10 more files
   found on the second), `Manufacturing and Inventory Control` (`GPL=8`, as its
   PDRIVE table says, every file now clean), `willus/ND80BIG.dmk` (`GPL=4`, as
   its PDRIVE table says) and `willus/rapds13.dmk` (31 clean files instead of
   24). The sixth, `DS023.DMK`, changes reading without getting better or
   worse; neither reading decodes its CMD files. (Since the decoder tries both
   allocation sides, `DS023` reads single-sided with the directory on cylinder
   20, where DIR/SYS says it is. Four of its CMD files then start with their
   own names and dates in the header, but end mid-record at the size the
   directory gives, so the truncation is in the directory.)
3. **The boot sector's byte 2** (masked with 0x7F) names the directory cylinder
   on all 76 decoded Model I and 4 disks, and for NEWDOS/80 it's the starting lump.
   It's how the DOS itself finds the directory, and TRSDOS 2.3B kept it even
   after dropping DIR/SYS.
4. **Other GAT self-consistency:** it marks its own cylinder fully allocated (0xFF in
   the 2.3 family, 0x3F in 1.3) and the boot granule on cylinder 0; the name and
   date are printable; the master password is usually the default, "PASSWORD"
   (stored E0 42) in the 2.3 family; 1.3 disks hold D3 8F or EF 5C (see "Password
   hashes").
5. **DIR/SYS's extent** gives the directory's size, 3 granules for a side-0-only
   directory and 6 for a whole double-sided cylinder.
6. **Deleted address marks.** 2.3-family directory sectors are all marked
   (10 of 10 single density, 18 of 18 double). TRSDOS 1.3 does **not** mark
   them. JV1's mark is synthesized by our reader for track 17, so it is never
   evidence. The Model I controller could write 0xFA, which Model III hardware
   can't distinguish from 0xFB, so a missing mark means "no information".
   NEWDOS/80 has a SYSTEM option (BN) choosing whether single-density directory
   sectors are written for Model I TRSDOS or for Model III NEWDOS/80, but not both
   (manual, page 189). TRSDOS 6 marks the whole directory cylinder with 0xF8
   and relies on it to notice a changed disk (*Programmer's Guide*, page 45).
7. **The "(c) 1980 Tandy" string:** on all sixteen directory sectors of every
   1.3 disk, and on 0 of 16 for everything else.
8. **The conventional cylinder** (17 of 35, 20 of 40, 40 of 80).

A directory slot whose first byte has the in-use bit set but whose name isn't
printable is garbage, not a file: such slots carry sector counts in the tens of
thousands and extents pointing at cylinders up to 252 (`Abacux X`, `102A -
Foibles`, `MLTDOS4P`). Count them as misses rather than rejecting the whole
candidate: `Abacux X` has 45 good hashes and 8 garbage slots, while a wrong
candidate, such as reading file data on side 1 of `dospls34`'s directory
cylinder, still loses because it reads mostly garbage.

A blank 2.3-family disk usually offers at least one matching hash, but not
always two: TRSDOS 2.x's DIR/SYS hash is wrong (see the HIT, and accepting
that is what gives `m1-trsdos-blank.dmk` its second hit), MultiDOS and
UltraDOS have no BOOT/SYS entry, and TRSDOS 2.3B has neither. So require at
least one hit or, failing that, a
strict GAT pass, since a blank 2.3B data disk may offer no hashes at all. A blank
1.3 disk (`m3-trsdos-blank.dmk`) has no directory entries either, and is carried
by the Tandy string and the GAT instead. A GAT full of zeros is not an
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
the time (the five NEWDOS/80 additions were checked the same way and agree): no
entries after a terminator, none out of order, and every file's doubling matches
its flags (checked by recomputing IDAM CRCs at both strides). Sector size codes
are 128, 256, 512, 1024.

**SCP** is raw flux. There are no SCP images in the collection, so that reader is
entirely untested.

## Disks worth remembering

As of October 2026 the collection is 288 images: 266 DMK, 13 DSK, 5 JV1, 4 JV3,
all with sidecars and snapshots. The biggest part is `peter/` (152): Ira's set
of disks that trsread and trstools couldn't read but VDISK could (see its
`README.md`). Thirteen byte-identical copies were removed when it was added,
and their names kept as aliases.

**`willus/`** holds 25 disks picked from willus.com's archive of TRS-80
software (`~/Dropbox/Personal/willus.com/trs80`, about 15,500 DMK files). Most
of that archive is useless here: willus copied each program, even ones listed
as original disk images, onto a 40-track TRSDOS 1.3 disk for his emulator, and
those are all identical in layout. Only the roughly 900 images that aren't
256,016 bytes are originals, and 873 of them aren't in this collection. The
picks are DOS versions we lacked (DOSPLUS 3.2.1, VTOS 4.0 and 4.0.1, TRSDOS 2.0
and 6.0.0, Percom DoubleDOS 4.23, MultiDOS 1.5, RAPIDOS, two DOSPLUS IV, two TRSDOS
2.3B system disks, an 80-cylinder double-sided NEWDOS/80 disk) and disks that
exercise gaps in `FLOPPY_TODO.md`. Each sidecar's notes say why it's there.
The rest of the archive's originals are worth rescanning when a gap needs more
evidence: there are, for example, about 100 double-sided LS-DOS data disks.

**DOSPLUS 3.2 existed** (trs-80.org: Micro-Systems released 3.1 through 3.4 in
1980-1982). `willus/dsp1321a.dmk` is 3.2.1 for the Model I, with 0xCB = 0x32
and DOSPLUS's `F3 FE` boot sector. The six 0x32 disks in `peter/` are not
DOSPLUS: they share another boot sector, which says "Not A System Disk:", from
a formatter that also writes 0x34.

**Filenames came from wherever the images were found, and some were wrong.**
These were renamed in October 2026, from evidence on the disks; each sidecar's
`aliases` keeps the old name:

| Old name | New name | Evidence |
|---|---|---|
| `StarTrek-Trsdos-8.2.dsk` | `StarTrek-NEWDOS80.dsk` | GAT byte 0xCB is 0x82, NEWDOS/80 v2; "8.2" was our old misreading |
| `simple/DOSPLS2B.dmk` (and `C`, `D`) | `simple/ldos-5.1-dosplus2-source-b.dmk` (`-c`, `-d`) | LDOS 5.1.3 data disks (GAT name "LDOSDISK", LDOS boot sector) holding DOSPLUS II's assembly source |
| `simple/trsdos-2.1-sssd-1.dmk` | `simple/trsdos-2.2-sssd.dmk` | SYS0 banner (negated) says VER 2.2 |
| `simple/trsdos-2.1-sssd-2.dmk` | `simple/trsdos-2.3-sssd-2.dmk` | SYS0 banner says VER 2.3 |
| `simple/trsdos-2.1-sssd-1.jv1` | `simple/trsdos-2.3-sssd.jv1` | SYS0 banner says VER 2.3 |
| `peter/055 - DosPlus IV Master.dmk` (and `055v`) | `peter/055 - Orchestra-90 [Labeled DosPlus IV Master].dmk` (and `055v`) | only BOOT/SYS, DIR/SYS and ORCH90/CMD; the boot sector is Orchestra-90's. A third copy was already named `[Really Only ORCH-90]` |

So a filename is a hint, not evidence. Before relying on one, check the
SYS0 banner, the boot track and the GAT.

- `NEWDOS-80 v2.0 Build 02.03.87 (-)(Apparat)[h Horst Weikamp][German].dmk`: the
  only double-sided, mixed-density NEWDOS/80 disk. Cylinder 0 is 5-sector single
  density on both sides; `GPL=6`; the data area starts at cylinder 1, skipping
  both sides.
- `49VFRED.DMK`, `52VFRED.DMK`, `41BFRED.DMK` and the rest of the "FRED" disks:
  the only `GPL=8` NEWDOS/80 disks (`52VFRED` has 15 of 15 hashes, `49VFRED` 74 of
  74). Their PDRIVE `TD` byte disagrees with their `SPT`, and `52VFRED`'s GAT
  isn't a granule bitmap at all — it reads `0x25` in every used lump — though
  every file reads cleanly. `73BFRED.DMK` has a PDRIVE `SPT` that doesn't match
  its media.
- `dospls34.dmk`: DOSPLUS allocating side 1, with the directory on side 0 only
  and SYS10-12 on side 1 of the directory cylinder. `willus/PRODUCER.dmk`
  (DOSPLUS 3.4) and Cornsoft-Brix `bath4` (DOSPLUS 4.0) do the same.
- The Cornsoft disks and `DS023.DMK`: double-sided images used single-sided.
  `Cornsoft-Brix-Development-newshell2-bath3.dmk` and `F05 - Monas Main Disk 2.dmk`
  are the reverse, double-sided allocations imaged with one side.
- MultiDOS's "pseudo density" disks (`MultiDOS v1.4` through `v1.7P`): NEWDOS/80-style
  5-sector granules with `GPL=2` and the data area from cylinder 1, unlike
  `MLTDOS4P.dmk`, which uses TRSDOS-style lumps.
- `newdos80-DSSD-80T.dmk`: the first double-sided NEWDOS/80 disk, and the one that
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
  The Model I's FD1771 ignores the side byte when reading (*Machine Language
  Disk I-O*, page 22), so a Model I disk can put anything there.
- `NEWDOS90.dmk`: the NEWDOS/80 lump case described above. NEWDOS/90 is an
  update of NEWDOS/86, itself built on NEWDOS/80 v2, so the on-disk rules are
  NEWDOS/80's. Its GAT byte 0xCB is 0x82, which the handbook documents as the
  identifier for NEWDOS/80 itself rather than a version number; our code
  misreports it as "version 8.2".
- `trsdos-2.3B-sssd.dmk` (renamed from `trsdos-2.3-sssd.dmk`): the only TRSDOS
  2.3B disk, with no BOOT/SYS or DIR/SYS entries and a boot sector that loads
  SYS0 without the directory. See the TRSDOS 2.3B section.
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
