# TRS-80 floppy formats: verified notes

Findings from researching the specs and measuring them against the disks in
`~/mine/trs80-floppy-regress`. Everything here was checked against real disks or
quoted documentation; guesses are labeled as such.

## Sources

- Tim Mann's [disk image spec](https://www.tim-mann.org/trs80/dskspec.html) covers JV1 and JV3, not DMK.
- David Keil's emulator documentation covers DMK. Both of its mirrors were down
  when this was written; a copy is at `~/Downloads/dmk.html`.
- [Tim Mann's FAQ](https://www.tim-mann.org/trs80faq.html) for hardware and density questions.
- IMD is described in the documentation of Dave Dunfield's
  [ImageDisk](http://dunfield.classiccmp.org/img/index.htm); MAME's
  `src/lib/formats/imd_dsk.cpp` is a second reference.
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
  - *Model III TRSDOS Commented* (Soft Sector Marketing, 1982, `TRSDOS/`), Rick
    Papo's commented disassembly of TRSDOS 1.3B, is the only source on 1.3's
    structures: the boot sector's backup count, the directory entry, the HIT
    and its system overlay table, and the GAT (pages 8-10), then the whole DOS,
    bookmarked by overlay. What it says agrees with what we'd measured, except
    as noted below. (The *TRSDOS 1.3 Reference Guide* is commands only.)
  - *Mod III ROM Commented* (`TRS-80/`) has the Model III boot code, at 3455H.
  - *Machine Language Disk I-O & Other Mysteries* (1982, `disk/`) is about driving
    the floppy controller. For decoding it adds the 16-bit password hash, as
    the source of a password finder (pages 116-118, checked on the scan), the
    fact that TRSDOS and VTOS store their SYS0 boot messages negated (page 93),
    and the Model I and III track formats (pages 18-28, 96-97).
- **Model II manuals** are in `~/Dropbox/Personal/Books/TRS-80/Model II/`, copied
  from Pete's Model II archive (`~/others/model2archive`, github.com/pski/model2archive):
  the *Model II Disk Operating System Reference Manual* (TRSDOS 2.0), the *Model II
  TRSDOS 1.1 Manual*, two editions of the *TRSDOS-II Reference Manual*, *DOSPLUS II
  and EDAS for the Model II*, and the Pickles & Trout, Lifeboat, Aton and Digital
  Research CP/M manuals. None gives the byte layout of a directory except DOSPLUS
  II's; what's below about Model II TRSDOS and TRSDOS-II was measured.
- **CP/M**: the Model I/III/4 CP/Ms have no manuals in the library. The directory entry and disk
  parameter block are as in Digital Research's *CP/M 2.2 Alteration Guide* and
  the cpmtools package. Montezuma Micro's parameters come from `PROBE.TXT` on
  each of mloewen's disks, a dump that the PROBE utility made of the DPB.
  Lifeboat's were measured on telanoc's system disk. Holmes Engineering's come
  from a `PROBE.TXT` that mloewen put next to the disk image.

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
On the directory cylinder (17), sector 1 is the GAT, sector 2 the HIT, and
sectors 3-18 the entries. An entry, from *Model III TRSDOS Commented* (page 8):

    0x00  bit 6 system, bit 5 limited backup, bit 4 in use, bit 3 invisible,
          bits 2-0 access level; an entry whose byte 0 is zero is free
    0x01  month
    0x02  year
    0x03  EOF byte offset in the last sector
    0x04  logical record length (0 = 256)
    0x05  name (8), then extension (3)
    0x10  update password hash, then access password hash
    0x14  EOF sector, 16 bits
    0x16  thirteen extents: cylinder, then granule (bits 7-5) and count (bits 4-0)

**Limited backup.** A file with bit 5 set can be backed up only as many times
as boot sector byte 0x22 says. BACKUP decrements the count, and when it reaches
zero deletes every such file; 0xFF means unlimited. In 1.3's boot sector the
byte follows the loader's `JP (HL)`, and it's 0xFF on 52 of the 97 1.3-layout
disks. TRSDOS 1.1's loader is one byte longer, so its 0x22 is that `JP (HL)`
(0xE9, on nine disks) and it has no count there; 1.2's holds 0x00; and other
publishers' disks have their own boot code. Only one entry in the collection
has the bit (`SPELLING` on Spelling Demons, whose count is 0xFF).

**NEWDOS/80** keeps the 2.3-family structures but allocates in *lumps*; see below.
MultiDOS uses either allocation depending on the disk, and several other sources
use NEWDOS/80-style lumps too, which is why the lump model treats all of these as one
layout with different parameters.

**Tandy's Model II lineage** — Model III TRSDOS 1.x, Model I TRSDOS 2.7DD/2.8,
and Model II TRSDOS — are related to each other and can't read each other's
disks. CP/M is a separate decoder (see "CP/M" below), and game disks with no
file system are out of scope.

**TRSDOS 2.7DD** (Model I, 1982) came with Radio Shack's Double-Density Disk Kit
(26-1143) and was its only double-density Model I TRSDOS; 2.8 replaced it later
in 1982, fixing a bug in single-drive copies from single to double density. It
wasn't a revision of 2.3 but a new system that, like Model III TRSDOS, came
partly from Model II TRSDOS, and it can't read double-density Model III disks
(trs-80.org, "Model I TRSDOS Versions" and "The Radio Shack Double-Density
Disk Kit"). Its disks are a hybrid, measured on two (`quentin/TRSDOS
v2.7DD ...`, and `simple/trsdos-2.7-ssmd.dmk`, of which
`difficult/TRSDOS27-Percom-Double-Dos.DSK` is a byte-identical copy despite its
name). From the 1.3 side: data tracks number their 18 sectors from 1; granules
are 3 sectors, six per track, so a lump is a cylinder; the GAT is in sector 1
of the directory cylinder (17) and its unused high bits are clear (bytes 0x3F);
the HIT lists entries in directory order (E2 F0 3C E8 for the first four); the
directory holds no BOOT/SYS or DIR/SYS (only a few files flagged system, such as
ULC and BASIC/CMD); and the disk says "TRSDOS version 2.7DD Thu May 20, 1982"
and "TANDY CORP.", the way 1.3 says "TRSDOS version 1.3". From the 2.3 side:
32-byte directory entries with the name at offset 5, and extents with the
cylinder byte first (`04 21`). Cylinder 0 is single density, sectors 0-9, with a
boot sector starting `FE`. The NEWDOS/80 Version 2.0 Manual
(ZAP 078, PDF page 235) reads these disks with `SPT=18`, `GPL=6`, `DDSL=17` and
interface flag M ("TRSDOS Model I 2.3B or higher, or Model III"), and says the
directory counts cylinder 0 from its first sector as though it were double
density, so BOOT owns the whole cylinder though only 10 sectors exist; NEWDOS/80
can read and copy these disks but not format them.

Decoded as `TrsdosVersion.V2_7`, from 23 disks in `ira/lk-341-set-1` (the
`TRSDOS v2.7DD ...`, `TRSDOS v2.7SD ...`, `TRSDOS v2.8DD ...`, `Author I ...` and
`Auk's Computer Filing System ...` images) plus the three above. What we measured
beyond the list above:

- The HIT is dense, the same as 1.3's: `hitIndex = sectorIndex *
  dirEntriesPerSector + entryIndex`. Every HIT byte equals its entry's name hash
  on all four disks checked entry by entry. It occupies the first 128 bytes of
  the sector (16 entry sectors of 8); the rest holds a table we don't decode.
- The extent granule count is stored as is, not minus one as in the 2.3 family
  (`granuleCountBasis` 0, like 1.3): file sizes fit exactly that way.
- Dates are 1.3's: the low nibble of byte 1 is the month, byte 2 is the year minus
  1900, and there is no day. Read the 2.3 way, every day would come out as 10.
- File size uses the 1.3 rule: the EOF byte adds to the sector count. That's
  how the DOS itself reads files. Booted in our emulator, 2.8.0's `LIST
  FILER/V32` on `Auk's Computer Filing System` (count 1, EOF 98) shows two
  records, the second all 0xE5; under the 2.3 rule there would be one. Its DIR
  agrees: `telanoc/model1/M1_TD2.7DD_dir_pg1.gif` and `_pg2.gif` are photos of
  2.7DD's DIR of the HFE beside them, showing `TEST2/BAS` (count 57, EOF 151) as
  58 records and `PHONE/BLD` (count 0, EOF 22) as 1 record. But programs that
  keep their own file buffers wrote the 2.3 way, so through the DOS their
  files have a sector of junk at the end: every BASIC program on those two
  disks (Disk BASIC came from 2.3), including ASCII-saved ones like
  `FILER/V32`, which then no longer parse as BASIC; and `PRTVERF`, `STUDENT`,
  `TEACH` and `CHAIN/CMD` on `Author I`, `SCOPY/CMD` on Auk's, and
  `ST80III/CMD` on `TRSDOS v2.7DD`. Files written the DOS's way fit exactly:
  `MARQ/CMD` on the HFE, `AUTHOR/CMD` on `Author I` (both cut short under the
  2.3 rule), and `PHONE/BLD`, written by BUILD. We report what the DOS would
  read.
- Entries are 2.3's: 8 per sector, five extents of (cylinder, granule byte) pairs
  at bytes 22-29, 0xFF ending them, and bytes 30-31 the `FE nn` link to the next
  entry. There is no "(c) 1980 Tandy" filler, and no system files to count, so
  the 2.3 rule that fewer than two hash hits means no directory doesn't apply.
- 2.7SD is the single-density variant (the `TRSDOS v2.7SD` disk and the
  `Author I` disks): 10 sectors per track numbered from 1, granules of 2 sectors,
  five per track, and otherwise the same layout.
- The version banner is on cylinder 1, not on the single-density boot track:
  "TRSDOS version 2.7DD  Thu May 20, 1982", "TRSDOS version 2.7SD" or "TRSDOS
  version 2.8.0  Wed Dec 15, 1982". The decoder names the DOS from it.

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

**An entry whose HIT slot is 0 isn't a file**, even with its in-use bit set.
The DOS finds a file by its hash, so it can't reach that entry; it's left over
from an earlier directory, typically in a sector copied whole. `getDirEntries()`
drops these, and `evaluate()` ignores them: neither hit nor miss, and their extents
can be anything. TRSREAD and VDISK skip them too (Ira's report in
`ira/bad-crc`). Found on the RAPIDOS disks (`Dog Catcher`,
`Tournament Chess` and `willus/rapds13.dmk` share the same seven leftovers in
directory sector 10, three of them named like live files), on TRSDOS 2.3B (the
second SYS5/SYS), and on `Maxi Manager` (a garbage `81 NFMT/CBF` whose extents
reach lump 87, which made a two-sided reading win until it was ignored).

**A HIT can be wrong while the directory is fine.** On six TRSDOS 6 disks in
`peter/` (`Bobby Lee (100)`, `EBAY1024`, `EBAY1035`, the SuperScripsit master and
both `TRSDOS Hard Disk Initialization` sets) the HIT sector is a byte-for-byte
copy of a file sector, so no hash matches the valid entries on cylinder 20. On
`RemDisk 1` the whole HIT sector is shifted by one byte (`HIT[i + 1]` holds entry
`i`'s hash). When no candidate passes, `decodeTrsdos()` tries the 2.3-family
layouts again ignoring the HIT: every entry in use is a file, and one that
decodes counts as a hit. Since that's weak evidence, such a candidate also needs
DIR/SYS's extent to name its directory lump and a GAT that passes the strict
check, and the decoder logs a warning. All six TRSDOS 6 disks decode that way with
every file clean, as do four disks whose directories are damaged (`Torpedo
[Directory is Shot]`, the two `Elephant` disks with bad tracks in their names, and
`50VFRED.DMK`), most of whose files decode as programs (3 of 6 on `Torpedo`, 68 of
74 on `50VFRED`). Ignoring the HIT
also lists entries the DOS can't reach (see below), so it's only a fallback.

**An extended entry's (FXDE's) HIT byte is the hash of its file's name**, though
the FXDE itself has no name. `evaluate()` follows the FXDE's back links (byte 1)
to the primary entry and compares that entry's hash. Comparing the FXDE's own
blank name counted each one as a miss, which lost half a directory on two disks
in `ira/no-extract`: `DiskMan` (LDOS 5.1.3, a 500 KB file `DIR` with seven
FXDEs, all with HIT 0x5C) and `SmartNet ... [86-04-29 Drive 1]` (NEWDOS/80). The
misses made a reading of only side 0 of the directory cylinder win, dropping five
files and one.

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

**Blank system names can be confirmed from their slot.** Four Meta Technologies data
disks in `ira/lk-341-set-2` (Mingle II, Rebuild, Shrink, Supersede) have the names of
their four system entries overwritten with 11 spaces, but the HIT keeps the hashes. A
one-byte hash can't recover a name, but it can confirm the name that the DEC table
above says belongs in that slot. That confirms BOOT/SYS (0xA2), DIR/SYS (0x2C, the old
wrong hash) and SYS2/SYS (0x2C at DEC 0x04). It doesn't confirm DEC 0x03, which holds
SYS1's code under HIT byte 0x27 (SYS1/SYS hashes to 0x2F), so something changed that
byte too. `evaluate()` counts a confirmed name as a hit and an unconfirmed blank name as
neither a hit nor a miss; `getDirEntries()` names unconfirmed ones `BLANK1`, `BLANK2`,
... so that extracting them doesn't collide (a blank name extracts as "_").

**Those four disks aren't VTOS, despite the VTOS data-disk filenames.** The BOOT/SYS
password hashes (7F60/B21F) are shared by TRSDOS 2.x, NEWDOS 2.x, NEWDOS/80 and VTOS,
but DIR/SYS's access hash separates them: 0xE5F9 on these four and on the TRSDOS
2.0-2.3, NEWDOS 2.1, NEWDOS/80 and DoubleDOS disks in the collection, and 0x4296 (blank)
on the VTOS 3.0 and 4.0 disks. (The exceptions, such as `trsdos-2.3-sssd.jv1` and some
NEWDOS/80 disks, have 0x4296 or 0x3412 on every system file, so they don't point at VTOS
either.) GAT byte 0xCB is 0x21 (VTOS writes 0x30 or 0x40), and the
DIR/SYS HIT byte is the old 0x2C (VTOS writes 0xC4). The two hidden files on cylinder 16
are NEWDOS 2.1's SYS1/SYS and SYS2/SYS: same sizes (1166 and 1076 bytes), differing in
13 and 6 bytes (patches). VTOS 3.0.1's SYS2 is 1135 bytes. So they were made under
NEWDOS 2.1 and are reported as "TRSDOS 2.x".

## TRSDOS 1.3 system files

TRSDOS 1.3 has no directory entries for its system files. The HIT sector holds
their extents instead: after the 80 hash bytes and 144 bytes that are normally
zero, sixteen two-byte
slots at 0xE0, granule byte first (bits 7-5 the granule within the cylinder, bits
4-0 the count) and then the cylinder. Slot *n* is SYS*n*, 0 through 14, and slot
15 is 0xFF 0xFF, a terminator; a missing file is 0xFF 0xFF too. *Model III
TRSDOS Commented* (page 9) describes the table the same way, calls the files
system overlays 0-14, and says number 15 is unused; SYS*n* is our name for
overlay *n*. Measured on the 80 disks that decode in the 1.3 layout:

- **The count is the number of granules,** not less one, as in 1.3's directory
  entries: on a system disk SYS0's five granules (0:0-0:4) end where SYS5 begins
  (0:5), and SYS5's three (0:5, 1:0, 1:1) end where SYS7 begins (1:2).
- **Tandy's table** (43 disks, TRSDOS 1.1 to 1.3, including two CP-500 DOS500
  disks): SYS0 0:0+5, SYS1 16:0+2, SYS2 16:2+2, SYS3 16:4+3, SYS4 16:5+1, SYS5
  0:5+3 (11:2+3 on three disks), SYS6 18:0+6, SYS7 1:2+6, SYS8 19:0+6, SYS9 20:0+5,
  SYS10 15:0+2, SYS11 20:5+4, SYS12 15:2+2, SYS13 15:4+2, SYS14 21:3+1. Two disks
  have a different table (SYS5 0:5+1, SYS7 1:0+5, SYS8 1:5+7, no SYS11, ...).
- **SYS0 starts with the boot sector.** Its extent covers cylinder 0 sector 1,
  the boot sector, and the resident DOS follows as a load module from sector 2.
  Data disks have no table, or only SYS0 as 0:0+1, the boot granule.
- **SYS1-SYS14 are load modules,** mostly loading at 0x4E00 (0x5200 for SYS6,
  SYS9 and SYS11), each ending in a transfer record inside its extent.
- **SYS3's count is wrong.** It says three granules (16:4, 16:5, 17:0), but the
  module ends in its third sector, 16:5 is SYS4, and 17:0 is the GAT on the
  directory cylinder. The DOS reads a module until its transfer record, so the
  count doesn't matter to it. `getDirEntries()` clips each extent where the next
  system file or the directory begins, which gives SYS3 one granule. (On the
  CP-500 disks SYS4 lives at 3:5, so SYS3 clips at the directory, to two granules,
  the second of them unused.)
- **The table can outlive the files.** A disk made from a system disk keeps the
  table after user files overwrite the system files' granules: on `Model 4
  Diagnostics` six of them share granules with directory files, and on
  `difficult/trsdisk1.dmk` (1.2) SYS0 and SYS7 are inside `TETRS4/CMD` and the rest
  hold the format's 0xE5 filler. `getDirEntries()` drops a system file that shares
  a granule with a directory file, since the HIT vouches for the directory entry;
  the filler ones are still listed. The GAT can't settle these: CP-500 disk 1's
  GAT marks every system granule free, though all fifteen modules are intact.
- **Damaged tables** are filtered by range: on `peter/01 - [BAD DISK] 3D Maze 3D
  Bowl` slots 8-14 hold cylinders up to 240, or no granules, and are skipped, as
  are slots that start in the directory.

## Tandy's protection track

Many Tandy originals for the Model III have a 41st track, cylinder 40, that
no manual in the library mentions. It's Tandy's copy protection, which limits
the number of backups, not a bad read. Measured on 17 disks in
`ira/odderrors-420/`, and an identical copy of one of them in `ira/no-extract/`:

- **Layout.** Eighteen double-density 256-byte sectors with every ID and data
  CRC good. The ID fields say cylinder 0x28 and number the sectors **0x81-0x92**,
  that is 1-18 with bit 7 set, in the same 3:1 interleave as the other tracks.
  TRSDOS's FORMAT and BACKUP stop at cylinder 39 and number sectors from 1, so
  neither can make or copy this track.
- **Contents.** Each sector is 0xE5 filler ending in the 16 bytes
  `(c) 1980 Tandy  `. Sectors 0x90-0x92 hold 0x300 bytes of Z80 code,
  byte-identical on every disk that has it. Its messages are XOR 0x55, and
  decoded they name it "TRS-80 Protection Utility Ver 1.1" and ask which file to
  protect and how many backups to allow.
- **Marks.** On protected disks every sector has the 0xF8 deleted mark, which
  TRSDOS 1.x writes on every sector outside the directory (see "Deleted
  address marks" under "Evidence that turned out to be reliable"). Two disks (a Radio
  Shack data disk, and a DOSPLUS disk probably formatted over a Tandy blank)
  have the track with 0xFB marks and no code: formatted but never protected.
- **The DOS loads it.** On nine of the disks, TRSDOS 1.1 and 1.2-era system
  disks, a system sector on cylinder 1 starts with `LD DE,2890h / LD BC,0300h`
  and reads the three code sectors, cylinder 0x28 from sector 0x90. TRSDOS 1.3
  disks have the track and the same code, but no such loader, so where 1.3 reads
  it is unknown.
- **Not only Tandy's.** The track is on Random House, Snapp, and Rhino Robots
  disks, the last from 1983. On the three Snapp disks, sectors 0x81-0x8F hold
  scrambled, non-filler data, probably part of the program, so the track
  can't be ignored. One Model I disk (`Profile v1.0 ... [M1]`, TRSDOS 2.3) is
  single density everywhere else but has this track in double density, which a
  stock Model I can't write, so the track was probably put there when the disk
  was duplicated rather than by the DOS.

The track is numbered apart from the rest of the disk, so
`FloppyDiskGeometry` puts it in a sector-number group of its own (129-146)
rather than merging it with the disk's (1-18), which used to report sectors
19-128 as missing. The `sectors` map shows it as a table of its own.

## Leftovers from earlier formats

Disks were often formatted more than once. When the later format covers fewer
cylinders than the earlier one, or a copier formats only the cylinders it
copies, the cylinders past it keep the old format and whatever was written on
it. They're outside the file system (past the GAT's cylinder count, or CP/M's
tracks), so their errors damage no file, but `sectors --bad` lists them. Most of
what was left in Ira's `sectors --bad` run (`ira/odderrors-420/`) is this.

**The filler names the formatter.** Measured on `telanoc/`, whose disks were
each formatted by their DOS on real hardware: DOSPLUS 3.5 and DOSPLUS IV fill
new sectors with 0x6C in both densities; LDOS 5.3, LS-DOS 6.3, and MultiDOS 1.7
with `6D B6` repeated in double density and 0xE5 in single density; TRSDOS 2.3
and CP/M 1.4 with 0xE5; and TRSDOS 1.3 with 0xE5 ending in `(c) 1980 Tandy  `,
like the protection track above. The blank LDOS, LS-DOS and TRSDOS 6 disks in
`simple/trs80gp/formatted/` have `6D B6` too. Other DOSPLUS versions differ:
the free cylinders of most DOSPLUS 3.1, 3.3 and 3.4 disks in the collection
hold 0x00 or 0xE5. DOSPLUS 3.5 numbers double-density sectors 0-17 in a 3:1
interleave, and DOSPLUS IV in 2:1.
An IBM PC-DOS 160K format is eight 512-byte sectors numbered 1-8, filled with
0xF6, 654 bytes from one ID to the next (an 80-byte gap 3).

The leftovers in `ira/odderrors-420/`:

- **`CLOAD Magazine Issue 58 [Set 3]`**, cylinders 35-39: LDOS 5.1 on 35
  single-density cylinders (GAT 0xCC is 0) over a 40-cylinder double-density
  disk of the *TRS-Link* magazine. Its sidecar in `ira/oddity2/` (the same image)
  describes it. The six errors on cylinder 35 are where the single-density
  sector 7 of cylinder 34 was written over the old track, ID and all.
- **`Dunjonquest Hellfire Warrior v2.1 [Original]`** (Sets 1 and 2), cylinders
  35-39: TRSDOS 2.3 on 35 single-density cylinders, over a PC-DOS 160K format
  (0xF6 filler, 80-byte gap 3). Its ten CRC errors per disk are dropped bits
  (0xF6 read as 0xF4, 0xE4, 0x76) and, on cylinder 37, bit slips that turn the
  filler into 0xED, 0xDB, and 0xB7: an old recording that nothing rewrote. The
  two images were read separately, but their cylinders 35-39 have the same
  layout, and their errors fall in nearly the same places: sector 8 of every
  cylinder, sector 3 of 35 and 36, sector 7 of 37, and sector 1 of 38.
- **`LOAD-80 Issue 023`**, cylinder 40: DOSPLUS 3.4 on 40 double-density
  cylinders (GAT 0xCC is 5). Cylinder 40 is single density with nine sectors,
  numbered 0 and 2-9: the usual 2:1 order with sector 1's slot gone and the rest
  spread evenly. They hold 0x00, three of them with a few bits set. Who wrote it
  is unknown.
- **`Data Base Management System (Condor)`** (CP/M, double-sided), cylinders
  40-41 on both sides, **`SuperScripsit v1.1.0 [M3][Set 3]`** (TRSDOS 1.3),
  cylinders 40-41, and **`Xenos [Set 3]`** (TRSDOS 1.3), cylinders 40-42:
  0x6C filler, sectors 0-17 in DOSPLUS 3.5's 3:1 interleave. So these were
  blanks formatted by DOSPLUS to 42 cylinders, and a 40-cylinder disk was then
  copied onto them. (Xenos's cylinder 42 is an imaging artifact; see the next
  section.)
- **`WordStar with MailMerge v3.0 [Disk 2 of 2]`** (CP/M), cylinder 40, and
  **`TASMON v2.12`**, cylinders 35-39: `6D B6` filler, sectors 0-17, an
  LDOS-family format. TASMON's disk has been through at least three formats:
  that one, a double-density 1-18 format (with deleted marks on most of its
  tracks) left on cylinders 3, 4, 6, and 28-34, and the single-density 10-sector
  tracks that hold TASMON now, with a lone sector 0 on cylinder 0. `info` says
  "Unknown DOS with 2 files".

The last two groups have complete tracks numbered 0-17 next to the disk's 1-18
tracks of the same density and sector size. `FloppyDiskGeometry` used to give
each track the union of its numbering and its neighbors', 0-18 here, so
`sectors` reported their sector 18 as missing: 15 reports on five disks, and
none anywhere else in the collection. Now a track joins a sector-number group
only if its numbering fits inside the group's (as a damaged track's does), so
these tracks get a group, and a table in the map, of their own.

## Damage and imaging artifacts in Ira's sectors run

The rest of `ira/odderrors-420/`:

- **`NEWDOS-80 Patches for AJ v6.0a Mods`**: cylinder 39 is damaged. There's a
  signal all the way around, but it decodes only as bit-slipped `6D B6` filler
  (0xDB, 0xB6, 0x6D, 0x36), with five IDs in its first two-thirds, two of them
  followed by data with bad CRCs. Three of the missing sectors belong to
  `ZAPM3/JCL`.
- **`SuperScripsit v1.00.01 [M4][Set 03]`** (TRSDOS 6.2): cylinders 40-41 hold
  `6D B6`, formatted along with the rest. The GAT's 0xCC is 8 and its
  allocation table covers 43 cylinders, but the media block says 40 (0xFC is
  0x27), and the image has 42. Cylinder 41 is weak for about a third of a turn:
  six of the IDs there have bad CRCs, five of them with the cylinder byte read
  as 0x28 (bit 0 lost), and five have bad data CRCs. No file is there.
- **`Make-80 v1.2 [M1][Set 2][Disk 1 of 2]`**: a 35-cylinder single-density disk
  imaged in an 80-track drive that stepped once per track, so the image has 70
  tracks. Track 2*n* holds cylinder *n* (track 1 holds cylinder 1 too, and track
  3 one sector of it), and the odd tracks hold the noise between tracks. Four
  odd tracks near the hub pick up a few IDs of the cylinder before them, which
  make 40 of its 57 errors, and track 3 makes 9 more. `info` says "Unknown DOS
  with 1 file". The disk was once
  formatted with 80 cylinders, and some of that survives between the wider
  40-track tracks: track 9 is a whole single-density track whose IDs say
  cylinder 9, and track 8 ends with a sector of cylinder 8 where cylinder 4's
  sectors 2 and 6 should be. Six of the even tracks also end with a second
  copy of their first sector, cut off by the end of the track, which the reader
  used to take over the good one (see "An IDAM pointer can point past the end
  of its track").
- **`LOAD-80 Issue 023`**: cylinder 40's IDAM table, after its nine
  single-density pointers, has nine double-density ones copied from cylinder 39's
  table (offsets 0x0CB5 to 0x1765), which point into the single-density
  sectors. The imager didn't clear the table between tracks. Their ID CRCs fail,
  so the readers ignore them.
- **`Xenos [Set 3]`**: track 42 of its 43 is cylinder 40 again. Its IDs say
  cylinder 40, and it matches track 40 except for one byte before the first
  gap. `FloppyDiskGeometry` takes it as cylinder 42.

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
  cylinder. The SYS7 slot holds a second SYS5 entry with an identical extent,
  but its HIT byte is 0, so it isn't listed (see the HIT).
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
  byte 2 would cover them. The rule applies to the 2.3 family only: the two
  `Graphics-90` disks are in the 1.3 layout, made by some other tool, with a
  DIR/SYS whose extent says cylinder 0 though the directory (Tandy filler, 16
  and 20 hashes matching) is on 17.
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
- **1.3's GAT** (*Model III TRSDOS Commented*, pages 9-10): 0x00-0x5F
  allocation, one byte per cylinder; 0x60-0xBF a "track existence table", one
  byte per cylinder, not the 2.3 family's lockout bit map; 0xCE-0xCF the master
  password hash; 0xD0-0xDF the disk name and date; 0xE0-0xFF the AUTO command.
  The book says an existence byte is 0xFF when the cylinder doesn't exist or
  was locked out as flawed, otherwise zero, and BACKUP does treat 0xFF as a bad
  cylinder. But FORMAT doesn't mark missing cylinders: the table is all zero on
  88 of the 97 1.3-layout disks, including the bytes for cylinders 40-95. (The
  rest are dual-boot disks and one other, with 2.3-style values there.) No
  1.3 disk in the collection has a locked-out cylinder.
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
and then zeros. `ORCH80.DMK` is a 1980 Orchestra-80 distribution disk on an
UltraDOS data disk: its boot track says "ULTRADOS formatted diskette", and its
GAT has the ASCII text "U41" (UltraDOS 4.1) in 0xCB-0xCD where TRSDOS 2.3 writes
21 00 00. Read as LDOS fields that's version 5.5, 87 cylinders and two sides, on
a one-sided 35-cylinder disk. (UltraDOS 4.2's system disk, `ultdos42.dmk`, also
writes "U", 0x55, at 0xCB, followed by 05 01; there was no LDOS 5.5.) So trust 0xCC and 0xCD only
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
- The granule table (figure 5-2, page 47) allows **96 cylinders** on 5" media
  (LDOS 5.1 said 80), the size of the allocation table.
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
  but only one double-sided disk (`LOAD-80 Issue 85-03`). One disk added
  later disagrees: `SuperScripsit v1.00.01 [M4][Set 03]` (in
  `ira/odderrors-420/`) has 0xFC = 0x27 (40 cylinders) but 0xCC = 8 and an
  allocation table of 43 cylinders, on a 42-track image whose last two
  cylinders are formatted like the rest. It's the most
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

The decoder uses both checks (October 2026). A file whose extents hold fewer
sectors than its size needs costs a point of score, which rejects granules
that are too small: `PowerFILE` read as NEWDOS/80-style 5-sector granules,
`GPL=3`, where the DOS used 6, and lost the end of four system files. Among
candidates still tied, fewer granules per lump sort first, which rejects
counts that are too large: `Dungeon Escape` (MultiDOS, 2 per track) read as
4 per two-track lump, with its directory at the same sector, and every file
came from the wrong track; and `m2-lsdos-blank.dmk` now reads as 3 granules
of 10 sectors, not 6 of 5.

**DOSPLUS II** (MicroPower's, for the Model II) is the exception: six granules of
5 sectors on the 30-sector tracks of an 8" double-density disk, where LS-DOS on the
same disks uses three of 10 (*DOSPLUS II and EDAS for the Model II*, PDF page 104).
Measured on the three DOSPLUS II disks in Pete's archive: free GAT bytes read 0xC0,
and DIR/SYS and SYS0/SYS are each 30 sectors in an extent of 6 granules. Read with
three granules, the 2.3 generator's only choice until October 2026, the decoder took
a two-sided reading (6 granules per lump) and every file past its first lump had
missing sectors. So for 30-sector tracks `generateTrsdos23Candidates()` also tries
six granules. It doesn't try every count that divides the track: with 4 granules of
9 sectors on two sides, a lump has 8 granules and no unused GAT bits, so the strict
check passes any GAT, and that reading beat the right one on four LDOS and MultiDOS
disks. GAT byte 0xCB is 0x10, as on MultiDOS 1.x, so only the system disk is named,
from SYS0's banner, "DosPLUS II - Series A.00".

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

`Trsdos.nameAndVersion` follows that order, except for the boot sector hashes
(October 2026). What it needed beyond the above:

- **Search every system file, not just SYS0, and join the load records first.**
  A banner can straddle a CMD record header, which splits it in the raw bytes
  ("DISK OPE" ... "RATING SYSTEM"). Bytes past the transfer address can be
  leftovers: `NEWDOSPL.dmk`'s SYS0 has a stale "NEWDOS+ DISK OPERATING SYSTEM -
  VER 2.2" there, while its loaded banner is "NEWDOS - VERSION 2.2". MultiDOS
  names its system files DOS0-DOS9/SYS, UltraDOS SYS00-SYSFF/SYS, and
  `trsdos3a.dmk`'s banner ("TRSDOS - DISK OPERATING SYSTEM - VER 3.0") is in
  SYS8.
- **Banners seen:** NEWDOS 2.1 and 3.0 ("NEWDOS - DISK OPERATING SYSTEM - VER
  3.0"; 3.0's also mentions TRSDOS 2.1, so try it first); NEWDOS/80 v2 draws its
  name in graphics characters, leaving only "APPARAT, INC." and "VERSION 2.0"
  (also 2.5, "2.X" and "2/4") as text; Percom DoubleDOS says "DBLDOS - DISK
  OPERATING SYSTEM - VER 4.23"; VTOS 3.0.1, 4.0 and 4.0.1 are negated like
  TRSDOS 2.x; Cornsoft's DOSPLUS says "DOS PLUS 3.4a" (and writes 0x40 at
  0xCB); DOSPLUS 3.5 says "3.50". NEWDOS/86 and NEWDOS/90 (W. S. and D. S.
  Sands's extensions of NEWDOS/80 v2.0, 1984-1990) keep NEWDOS/80's banner and
  disk format and add "a NewDos86 SYSTEM disk" (or "NewDos90") in SYS6/SYS, so
  their system disks are named by that and their data disks stay NEWDOS/80
  v2.0. They also add SYS22-SYS29 and SYS5HELP/SYS.
- **A banner has to fit the layout.** `Manufacturing and Inventory Control`
  carries TRSDOS 2.3's SYS0 on a NEWDOS/80-formatted disk with `GPL=8` lumps,
  which TRSDOS 2.3 can't read. Lumps that aren't whole cylinders belong to
  NEWDOS/80, MultiDOS and Percom DoubleDOS (which also starts its data area at
  cylinder 1).
- **Boot-track evidence for data disks:** Model III TRSDOS writes "TRSDOS
  version 1.3" (or "version 1.2"); UltraDOS "ULTRADOS DISK OPERATING SYSTEM
  VERSION 4.2" or "ULTRADOS formatted diskette", with the version in ASCII at
  0xCB-0xCD on the latter ("U41"); RAPIDOS "RAPIDOS Ready" and "Version 1.3".
  MultiDOS 1.4-1.7 boot sectors start with 3B FE, which identifies their data
  disks, whose GATs say 0x16 (MultiDOS 1.6) and which hold a mixed-case
  `NoDOS/Ind` file.
- **0xCB values that don't name a DOS:** 0x22 and 0x50 are written by the
  formatter on Kim Watt's utility disks (Super Utility, Power-Copy, Make-80,
  Lazy Writer), not by TRSDOS 2.2 (which writes 0x21) or LDOS 5.0; 0x55 is
  UltraDOS's "U"; the "Not A System Disk:" formatter writes 0x31-0x34 without
  being DOSPLUS; 0x40 is DOSPLUS 4.0, DOSPLUS 3.4a or VTOS 4.0. These name a
  data disk "Unknown DOS" rather than a wrong one.

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
    16-17  update (owner) password hash; 18-19 access (user) password hash,
           or on LDOS 5.3 and LS-DOS 6.3 the time (see "Time stamps (LDOS
           5.3 and LS-DOS 6.3)")
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
  month in byte 1 of a NEWDOS/80 entry is really flag bits. LDOS 5.3 and LS-DOS
  6.3 extend the year in bytes 18-19 (see "Time stamps (LDOS 5.3 and LS-DOS 6.3)").
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
- **Bit 7 on a primary entry.** Four Sunburst disks for the Model III (`Thinking
  Skills`, `Teasers by Tobbs`, and both copies of `WhatsIt Corporation`) use a
  MultiDOS whose system files are dated 08/82 and 01/83 (`DOSRES/sys`, `INTERP/sys`,
  `OPEN/sys` and others, with a directory file named `Index`). Every entry on them has
  bit 7 set: 0xFF on the system files, 0xBE on BASIC/CMD, 0xB0 on the user files.
  They're primary entries all the same: each name hashes to its HIT byte, and byte 1
  holds a month with a plausible date in byte 2, where an FXDE has a DEC. Presumably
  the bit hides the files from DIR and COPY while the DOS still finds them through
  the HIT. `decodeDirEntry()` clears the bit when the entry's own non-blank name
  matches its HIT byte; no FXDE elsewhere in the collection matches that way.
- **Deleting a file** clears bit 4 of byte 0 and the HIT byte and frees the
  granules, leaving the rest of the entry intact. A HIT byte of 0 means a free
  slot in every one of these DOSes.

## Time stamps (LDOS 5.3 and LS-DOS 6.3)

LDOS 5.3 and LS-DOS 6.3 drop the access (user) password and keep the time of
day and a five-bit year in directory bytes 18-19. (The manual calls them "x.3",
which we avoid, since TRSDOS 1.3 and 2.3 are unrelated.) The *LDOS & LS-DOS
Reference Manual* (1992) describes the behavior but not the bits. COPY and
BACKUP from an older disk to a 5.3 or 6.3 disk remove the access password and
set the new date and time, COPY with a time of midnight (PDF pages 102 and 62).
DATECONV converts an older data disk and marks it as a 5.3 or 6.3 disk; run on
one that already is, it changes only the entries that still have the old blank
access password, which protects real time stamps (page 115). RESET with
DATE=OFF returns an entry to the old style and blanks the password (page 211).

The layout, measured: byte 18 is the high byte and byte 19 the low byte,

    bits 15-11  hour, 0-23
    bits 10-5   minute, 0-59
    bits 4-0    year minus 1980, so 1980-2011

and byte 2 keeps the day and the low three bits of the same year, so an older
DOS shows 1991 as 1983. The month stays in byte 1.

**Which disks.** GAT byte 0xCB is 0x53 or 0x63 on every disk that names itself
LDOS 5.3 or LS-DOS 6.3 (52 disks), and on two NEWDOS 3.0 disks; no other DOS
writes those values. That's the only disk-level signal we use, and it's needed:
on the other DOSes' disks, 11 of over 3,000 dated entries pass the checks below.
Four are on a TRSDOS 6.2 disk, midnight stamps on files presumably copied there
under LS-DOS 6.3, and seven are on MultiDOS disks, which put other things in
these bytes.

**Which entries.** On those disks `decodeDirEntry()` takes bytes 18-19 as a time
stamp when they aren't the blank hash 0x4296, byte 1 has a month (1-12), and the
fields check out: hour below 24, minute below 60, and the year's low three bits
equal to byte 2's. Of the 1,474 entries on the 52 disks, 1,205 pass (357 of them
system files), 169 have the blank hash (files not yet converted), 67 have no
month, and 33 fail. The NEWDOS 3.0 disks' 27 entries are all blank or have no
month. The years that pass run from 1980 to 1999; 689 of them are 1988 or later,
years byte 2 alone can't express (1983 becomes 1991, 1982 becomes 1990, and so
on), which is the evidence for the bit order. Many stamps are exactly 00:00, as
COPY sets them.

**The 33 that fail** keep their bytes as an access password and their date from
bytes 1-2. Most are system files that share one value per disk, on the same few
files (BOOT/SYS, SYS0, SYS3, SYS6, SYS7, and BACKUP/CMD, which isn't flagged as a
system file): 0x2673 on three Model III LDOS 5.3.1 system disks, 0x6BA3 on a
Model I one, 0x0A45 on a Model 4 LS-DOS 6.3.1 one. Read as times they're
plausible (14:25, 20:27, 08:40), but their years are one off from byte 2's, in
both directions. Whether they're passwords or stamps that a mastering tool
wrote isn't settled. Ten of the 33 aren't system files: the four BACKUP/CMDs,
two CONFIG/SYS, SYSTEM/JCL, FORMAT/CMD, and two files on `Ghosts of Blackwood
Manor` (a 2023 release) that are also one year off.

**System files get no date** on these disks, in `decodeDirEntry()`: most of the
failures are system files, so a stamp on one could be a coincidence, and nobody
needs their dates. Their bytes 18-19 stay as the access password. The rule
follows the GAT byte, so it also undates the system files on the two NEWDOS 3.0
disks.

## Password hashes

Passwords are stored as a 16-bit hash, LSB first: the master password in GAT
bytes 0xCE-0xCF, and each file's update and access passwords in directory bytes
16-19 (on LDOS 5.3 and LS-DOS 6.3 disks bytes 18-19 usually hold a time stamp
instead; see "Time stamps (LDOS 5.3 and LS-DOS 6.3)"). *Machine Language Disk I-O* (PDF page 118) gives the algorithm as Z80.
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
The 1.3 disks hold 0x8FD3 (nine disks) and 0x5CEF (the blank
`m3-trsdos-blank.dmk`), because **TRSDOS 1.3 hashes differently**: its encoder
(*Model III TRSDOS Commented*, PDF pages 71-72, at 5107H) subtracts where 2.3's
XORs. Restated, and checked against a transcription of the listing on 20,000
random passwords:

    hi = lo = 0xFF
    for each byte c, last to first:
        t  = lo ^ ((lo & 7) << 5)
        x  = ((t - ((c << 8) | hi)) * 4) & 0xFFFF
        hi, lo = t ^ (x >> 8) ^ c, (x & 0xFF) ^ (((x * 2) & 0xFFFF) >> 8) ^ hi
    hash = (hi << 8) | lo

"PASSWORD" hashes to 0x8FD3 and blank to 0x5CEF, so the 1.3 disks' master
passwords are the same defaults as the 2.3 family's. Being 16 bits, a hash has thousands of short passwords that match,
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
the name still has to be compared (see "The HIT").

Two details worth having:

- A HIT byte of 0 means the slot is free, and bit 4 of the entry's first byte
  must then be 0 as well. Consistent checks, useful for scoring.
- **Byte 0x1F holds the number of directory sectors beyond 10.** The GAT page
  claims instead that NEWDOS/80 keeps "tracks above 35" there, which the disks
  disprove: it is 0 on all seven, including the 80-cylinder pair where the track
  reading would require 45. The NEWDOS/80 manual (page 98) confirms it: the
  extra entry sectors, 0, 5, 10, 15 or 20. Across all the NEWDOS/80 disks we see 0,
  5, 10 and 20 (the "FRED" disks).

  **The directory can be larger than its lump.** Its size (`DDGA`) doesn't depend
  on `GPL`, so with `GPL=2` a 15-sector directory runs into the next lump. The
  decoder used to cap the directory at one lump, which silently dropped every
  entry past it: on about 20 disks (the `NEWDOS-86` helpdisks and utility disks,
  `RACS`, `Medicare System`, `peter/034.dmk` and `049.dmk`), from one file to 40.
  `generateNewdos80Candidates()` now also tries the size the HIT asks for: byte
  0x1F, or enough sectors to reach the highest HIT column in use, if that's
  more. The second matters on `peter/TRS-80 Format [Set 1]`, whose 0x1F and
  deleted marks say 10 sectors but whose HIT lists two files, hashes matching, in
  entry sectors 8 and 9 (October 2026).

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
   24; seven of the 31 were later dropped as leftover entries, see the HIT). The sixth, `DS023.DMK`, changes reading without getting better or
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
   (stored E0 42) in the 2.3 family and D3 8F under 1.3's hash (see "Password
   hashes").
5. **DIR/SYS's extent** gives the directory's size, 3 granules for a side-0-only
   directory and 6 for a whole double-sided cylinder.
6. **Deleted address marks.** 2.3-family directory sectors are all marked
   (10 of 10 single density, 18 of 18 double). JV1's mark is synthesized by
   our reader for track 17, so it is never evidence. The Model I controller
   could write 0xFA, which Model III hardware can't distinguish from 0xFB, so
   on a 2.3-family disk a missing mark means "no information".
   **TRSDOS 1.x marks the other way round:** everything the DOS writes gets
   0xF8 except the directory, which gets 0xFB. SYS0's write routine issues
   write command 0xA5 (bit 0 set, so 0xF8), and clears bit 0 only when the
   track is 17 (code at 4582H, and at 461DH `CP 11H`, commented "directory
   track?" in *Model III TRSDOS Commented*, page 27); FORMAT writes 0xFB
   everywhere. Measured on the 97 decodable 1.3-layout disks that record
   marks: the directory is all 0xFB on 86 (most of the rest are single-density
   dual-boot disks), and file sectors are all 0xF8 on 79 of the 94 with files,
   including TRSDOS 1.1's and 1.2's system files. Free sectors are mixed, being
   formatted blanks or freed files. Most exceptions are dual-boot disks, whose
   Model I side writes 0xFB; three (`trsdos-1.3-ssdd-2.dmk`, `-3`, and
   `difficult/trsdisk1.dmk`) have only 0xFB files, probably written by
   something other than TRSDOS. So on a 1.3 disk an 0xF8 means file data, not
   directory.
   NEWDOS/80 has a SYSTEM option (BN) choosing whether single-density directory
   sectors are written for Model I TRSDOS or for Model III NEWDOS/80, but not both
   (manual, page 189). TRSDOS 6 marks the whole directory cylinder with 0xF8
   and relies on it to notice a changed disk (*Programmer's Guide*, page 45).
7. **The "(c) 1980 Tandy" string:** on all sixteen directory sectors of every
   1.3 disk Tandy's TRSDOS wrote, and on 0 of 16 for everything else. Not every
   1.3-layout disk has it, though: about 40 in `ira/lk-341-set-1` have zeros
   (`Alcor C`, whose disk name is TRS80DSK 03/10/22, so written by a modern
   tool), spaces, or another notice: " A BRAND X DISK ", "(c) 1980 Pirates",
   "PROLOGICA 1982" (the Brazilian CP-500's DOS500), "DSORT! (c)85 PEB". So the
   string is sufficient but not necessary: without it, `evaluate()` takes the
   1.3 layout when it has at least one hash hit and at least twice as many hits
   as misses. The ratio keeps TRSDOS 2.7 disks out of the 1.3 layout, since their
   32-byte entries line up with a 48-byte reading once by chance (1 hit, 1 miss),
   while `Abacux X` (45 hits, 7 garbage slots) passes. (The 2.7 layout has no
   filler either, so it takes the same floor.)
8. **The conventional cylinder** (17 of 35, 20 of 40, 40 of 80).

A directory slot whose first byte has the in-use bit set but whose name isn't
printable is garbage, not a file: such slots carry sector counts in the tens of
thousands and extents pointing at cylinders up to 252 (`Abacux X`, `102A -
Foibles`, `MLTDOS4P`). Count them as misses rather than rejecting the whole
candidate: `Abacux X` has 45 good hashes and 8 garbage slots, while a wrong
candidate, such as reading file data on side 1 of `dospls34`'s directory
cylinder, still loses because it reads mostly garbage. (This note predates the
code: `evaluate()` rejected the candidate until October 2026, when following it
decoded RAPIDOS 2.0, NEWDOS-86, TRSDOS 6.2 and LOAD-80 disks in
`ira/lk-341-set-1`.)

**The GAT's AUTO command doesn't always end in 0x0D.** DOSPLUS 3.x ends it with
0x03 (`Micro-80 Bulletin Board System`, `VersaReceivables`, the `Electric
Pencil` disks), and `Le Script` leaves the field 0xFF. Rejecting the GAT for
those lost every candidate on those disks.

**Nor is it always printable, so it's no evidence at all.** It's what the user
typed, and that includes control characters: `1C 1F` (home, clear screen) on
`Sands of Mars` and `ST80-III`, and a line feed between two commands on `Super
Directory v2.1`. Since October 2026 `decodeGatInfo()` shows such bytes as "."
instead of rejecting the GAT. The name and date are still checked, with two
allowances: **the date may be all 0xFF** (unused filler, on `Creative Computing
Games Pack 1`), and **the name and date may hold graphics characters**
(0x80-0xBF), which NEWDOS/80 lets you type: "Tony", 0x80, "G/M" on `Green
Machine BBS`, "Data", 0x84, "isk" on two `NEWDOS-86` utility disks. Each of these
rejected a directory whose hashes all matched.

A blank 2.3-family disk usually offers at least one matching hash, but not
always two: TRSDOS 2.x's DIR/SYS hash is wrong (see the HIT, and accepting
that is what gives `m1-trsdos-blank.dmk` its second hit), MultiDOS and
UltraDOS have no BOOT/SYS entry, and TRSDOS 2.3B has neither. So require at
least one hit or, failing that, a
strict GAT pass, since a blank 2.3B data disk may offer no hashes at all. A blank
1.3 disk (`m3-trsdos-blank.dmk`) has no directory entries either, and is carried
by the Tandy string and the GAT instead. A GAT full of zeros is not an
empty disk, it's the wrong cylinder — that was the old bug on `NEWDOS90.dmk`.

## CP/M

Every CP/M has the same directory and allocation; only the disk parameter block
(DPB) differs, and it lives in the BIOS, not on the disk. So the decoder keeps a
table of known formats (`CPM_FORMATS` in `Cpm.ts`) and scores each candidate
layout by how consistent its directory is.

**Directory entries** are 32 bytes, filling the first blocks of the data area
(the blocks AL0/AL1 mark). Byte 0 is the user number, 0-15, or 0xE5 for unused.
CP/M 3 also uses 16-31 for passwords, 0x20 for the disk label, and 0x21 for date
stamps. Bytes 1-11 are the name and extension in 7-bit ASCII, padded with
spaces; the high bits of the extension are R/O, SYS (hidden from DIR), and
archived. Byte 12 (EX) holds the low 5 bits of the extent number and byte 14
(S2) the rest. Byte 15 (RC) is the number of 128-byte records in the entry's
last logical extent. Bytes 16-31 are 16 8-bit block numbers, or 8 16-bit
little-endian ones when the disk has more than 256 blocks.

**Extents**: a logical extent is 16K, and one entry holds EXM+1 of them. EXM is
the block size in K minus 1 with 8-bit pointers, or the block size in 2K minus
1 with 16-bit ones. A file's size is (extent number × 128 + RC) × 128 from its
last entry, so sizes are whole records, and text files end at the first Ctrl-Z
(0x1A). The blocks of every entry must hold exactly the records it claims:
ceil(((EX & EXM) × 128 + RC) / (block size / 128)). That rule rejects wrong
layouts reliably.

**Clipping text files**: `findCpmTextEnd()` in `Cpm.ts` clips a file at its first
Ctrl-Z only when all four hold. (1) The extension isn't a known binary one (COM,
REL, OVL, ...) and its second character isn't Q, Z, or Y (squeezed, crunched, and
LZH files). (2) There is a Ctrl-Z. (3) It's in the last record, or in the
second-to-last record with only Ctrl-Zs after it in that record: Digital Research's
`DUMP.ASM` fills a record with Ctrl-Zs, and the directory counts one more record
of stale data after it. An earlier Ctrl-Z means a damaged file (`PROBE.TXT` has a
repeated block whose good text comes after one; QuickTerm's `WHATS.NEW` starts
with junk), and those stay whole. We can't require all the bytes after the
Ctrl-Z to be Ctrl-Zs: `TRANS.HLP` has leftover text after its first. (4) At least
95% of the bytes before it are text (printable ASCII, tab, LF, FF, CR) once bit 7
is masked off. Real text files score 0.998-1.000, and WordStar's `.DOK` files
have bit 7 set on 11-17% of their bytes. Binaries such as `DUMP.COM` and Lifeboat's
`BOOT.COM` have a Ctrl-Z in their last record by chance (a random 128-byte record
contains 0x1A about 40% of the time), so the text test and the extension are what
keep them whole. `readFile()` and `getSize()` are clipped by default; `getRecordSize()`
and the sector map keep the whole records.

**Skew** usually can't be measured from the directory. On 256- or 512-byte
sectors, a sparse directory has all its entries in the first logical sector, so
any skew finds them, and it has to come from the format table. A 128-byte
sector holds only 4 entries, so a few files spread over several sectors and
show the skew (see Lifeboat).

**Montezuma Micro CP/M 2.2** (Model 4). mloewen's first 12 disks are one of each
format the system offers, and each one's `PROBE.TXT` has the DPB. All 12 follow
the same rules:

- 2K blocks, 128 directory entries (2 blocks), skew 2 on both 256- and 512-byte
  sectors (physical order 1, 3, 5, ..., 2, 4, 6, ...), sectors numbered from 1.
- System disks reserve 2 tracks (OFF = 2) and data disks none. Each side counts
  as a track: SPT is one side's sectors in records (36 for 18 × 256, 40 for
  10 × 512), and double-sided disks alternate sides track by track.
- DSM is the data area divided into 2K blocks, rounded down, minus 1. EXM is 1
  on 40-track disks and 0 on 80-track double-sided ones, whose DSM is over 255.

| File | Format | Sectors | Sides × tracks | OFF | DSM | EXM |
|---|---|---|---|---|---|---|
| FORMAT1 | Standard system | 18 × 256 | 1 × 40 | 2 | 84 | 1 |
| FORMAT2 | Standard data | 10 × 512 | 1 × 40 | 0 | 99 | 1 |
| FORMAT3 | Standard DS system | 18 × 256 | 2 × 40 | 2 | 174 | 1 |
| FORMAT4 | Standard DS data | 10 × 512 | 2 × 40 | 0 | 199 | 1 |
| FORMAT5 | 80T system | 18 × 256 | 1 × 80 | 2 | 174 | 1 |
| FORMAT6 | 80T data | 10 × 512 | 1 × 80 | 0 | 199 | 1 |
| FORMAT7 | 80T DS system | 18 × 256 | 2 × 80 | 2 | 354 | 0 |
| FORMAT8 | 80T DS data | 10 × 512 | 2 × 80 | 0 | 399 | 0 |
| FORMAT9 | Extended system | 10 × 512 | 1 × 40 | 2 | 94 | 1 |
| FORMAT10 | Extended DS system | 10 × 512 | 2 × 40 | 2 | 194 | 1 |
| FORMAT11 | Extended 80T system | 10 × 512 | 1 × 80 | 2 | 194 | 1 |
| FORMAT12 | Extended 80T DS system | 10 × 512 | 2 × 80 | 2 | 394 | 0 |

The decoder's parameters match all 12 DPBs, and the six utilities copied onto
every disk (`D`, `NULU`, `PIP`, `PROBE`, `SWEEP`, and `VDO.COM`) read
byte-identical from all 12. `PROBE.COM` takes two entries on the 80-track
double-sided formats. FORMAT5, 6, and 11 are single-sided disks in images
flagged double-sided (see "Image formats"). Ira's two DBTools disks
(`[DSDD40 Data]`) are in the Standard DS data format.

`PROBE.TXT` is damaged on the disk on 11 of the 12 (all but FORMAT1): its block
list repeats its first blocks, as in `34,35,34`, and block 34 holds the end of
the text, so the first 2K is gone. Whatever captured PROBE's output wrote it
that way; the DPB at its end survives.

mloewen's FORMAT13-16 are the formats of earlier Montezuma versions, all
18 × 256, 40 tracks, 2K blocks, and 128 entries, with the same six utilities
(byte-identical to the 12 above once read with the right layout) and the same
damaged `PROBE.TXT`. Their reserved tracks hold only a boot sector that says
there's no CP/M on the disk, so nothing on them names the version.

| File | Version | Sides | OFF | DSM | Skew |
|---|---|---|---|---|---|
| FORMAT13 | 1.26 and 1.30 | 1 | 2 | 84 | 4 |
| FORMAT14 | 1.26 and 1.30 | 2 | 2 | 174 | 4 |
| FORMAT15 | 1.32 | 2 | 2 | 174 | 2 |
| FORMAT16 | 1.42 and 1.44 | 2 | 4 | 170 | 2 |

- FORMAT15 is exactly the Standard DS system format (FORMAT3).
- FORMAT13 and 14 have the DPBs of FORMAT1 and 3, but skew 4 (physical order
  1, 5, 9, 13, 17, 3, 7, ...). PROBE doesn't print the translation table, so
  the skew was measured: only skew 4 reads the six utilities intact. With
  skew 2 the directory takes in data sectors and is rejected.
- FORMAT16 (342K) reserves 4 tracks, two cylinders. Read with one side and 2
  reserved tracks, its directory looks the same but the files are garbage,
  which is how it decoded before OFF 4 was a candidate.
- The two skews can tie: on a disk whose directory reads cleanly both ways,
  nothing in the directory tells them apart, and the table's order picks
  skew 2.

**Montezuma "Super Data"** (220K). Ira's three `CP-M Public Domain Disk C354`,
`C900` and `C901` disks (`ira/lk-410-to-do`, labeled "40T SS DD 220K M M Super
Data") are in a format not among the 12 above, worked out from the disks with
no DPB:

- Every track has five 1024-byte sectors (1-5) and one 512-byte sector (6), 44
  records, since six 1K sectors don't fit on a 5¼" double-density track
  (`CpmFormat.lastSectorSize`).
- No reserved tracks, 2K blocks, 128 entries, 8-bit pointers, EXM 1: 40 tracks
  of 5.5K make 110 blocks, the 220K of the label.
- Skew 2 over all six sectors, which puts the short one last: physical order 1,
  3, 5, 2, 4, 6. Measured from the files: every text file reads cleanly but one
  (below), and three squeezed files (`MEX.DQC`, `MEX.HQP`, `MXO-RS20.AQM`)
  unsqueeze with good checksums. `MDM740.AQM` unsqueezes to clean text from
  start to `END`, but its checksum is off by 0x72.
- Blocks aren't aligned to sectors: track 0's records 32-43 begin block 2, and
  block 3 starts halfway through track 1's first sector, so the BIOS addresses
  records, not sectors (see "Records, not sectors" below).
- `M7LIB.DOC` on C354 is damaged on the disk: its text stops mid-word at the end
  of its first block, and its last three records (sector 6 of track 22) hold the
  start of some other program. No sector on the disk continues the text, so
  it's not the layout.

**10 × 512 with no skew** (`Turbo Pascal System v2.00A ... [No Preset Terminal]`
in `ira/lk-410-to-do`): Montezuma's extended layout (sectors numbered from 1, 2
reserved tracks, 2K blocks, 128 entries) on 35 cylinders, but the data tracks
are interleaved physically (1, 8, 5, 2, 9, 6, 3, 10, 7, 4) and the BIOS uses no
skew. With skew 1 all 19 files read and the text files are clean; with
Montezuma's skew 2, 14 entries are bad. The boot sector says "Not a SYSTEM
Disk", which isn't Montezuma's message, so the vendor is unknown, and the
table's entry ("Unknown vendor") comes after Montezuma's so it wins only when
skew 2 fails.

`Hi-Tech Z-80 CP-M C Compiler V3.09 [Disk 0]` (`ira/lk-410-to-do`) is a
Montezuma 18 × 256 system disk whose 24 directory entries all have user byte
0xE5: every file was erased, so there's nothing to extract, and it stays
undecoded like a blank disk.

**Lifeboat CP/M 1.4** (Model I; telanoc's README adds "Small Systems
Software"). telanoc's system disk (`m1_cpm14_ss_sd_35.hfe`) is single-sided,
35 cylinders, all single density. Its 3 system tracks have 10 sectors of 256 bytes, numbered 0-9; the
rest have 18 sectors of 128 bytes, numbered 1-18. No DPB was available, so the
layout was worked out from the disk:

- 1K blocks and 64 directory entries (2 blocks), 3 reserved tracks, so 72
  blocks and 8-bit pointers. STAT.COM's 24 records take 3 blocks, which fixes
  the block size.
- Skew 4, wrapping to the next free sector as cpmtools does: physical order 1,
  5, 9, 13, 17, 3, 7, 11, 15, 2, 6, 10, 14, 18, 4, 8, 12, 16. The directory's
  four used sectors are physical 1, 5, 9, and 13, and STAT's first block
  (logical sector 16, its `JP` and the Digital Research copyright) is physical
  12.
- All 13 files read, matching `DIR` in trs80gp (`cpm_dir.gif`) in order. Most
  `.COM` files start with a jump to 43xxH-46xxH, which fits a TPA at 4200H (a
  guess: the Model I has ROM at 0, so CP/M can't load programs at 100H).

The blank data disk (`_data`) has an empty directory, so it stays undecoded
like any blank CP/M disk.

Two Lifeboat-layout disks are truncated images (see "Truncated images" below):

- `C Compiler (1983)(Software Toolworks)[CP-M]` (`ira/lk-410-to-do`) has all
  tracks 18 × 128, so it's a data disk (skew 4 reads `CLIBIO.C` cleanly). The
  DMK header says 43 tracks, but the file holds only 27, and four of the eight
  entries point at blocks past the end. Read as 40 tracks, `C.COM` is intact and
  the other files report their missing sectors.
- `ira/bad-disks/Omikron CP-M v2.2 ... [48K Memory][Set 1]` has 35 cylinders,
  but `SHOW.COM` and `H14DVR.COM` use blocks 72 and 73, past block 71, the last
  of a 35-track disk. A 35-track BIOS never allocates them, so the disk was
  written on 40 tracks, and the image stops at 35.

**Holmes Engineering CP/M 2.2** (Model I with Holmes's VID-80 80-column board).
mloewen's `Holmes-Engineering-VID80/holmes-cpm.dmk` is single-sided, 40 tracks,
double density throughout, with 10 sectors of 512 bytes numbered 0-9. The
`PROBE.TXT` next to it gives the DPB:

- SPT 40 (one track of 128-byte records), 1K blocks (BSH 3), EXM 0, DSM 194
  (39 data tracks), 64 directory entries, and OFF 1.
- AL0 is F0, reserving 4 blocks, though 64 entries fill only 2. The system
  doesn't fit on track 0, so it spills into blocks 2 and 3 (track 1, sectors
  4-7: the end of the BDOS and the BIOS jump table), and AL0 keeps files out of them.
  No entry points at them, so the decoder needn't know.
- No skew: the directory is track 1, sectors 0-3, and DDT.COM's first block
  (block 4) is sectors 8 and 9. PROBE says there's a translation table, but
  the files read intact without one. Eleven binaries (ASM, D, DDT, DUMP, ED,
  LOAD, NULU, PIP, STAT, SWEEP, and XSUB) are byte-identical to the Montezuma
  disks' copies, including files that cross tracks. SUBMIT differs by a 2-byte
  patch, and SYSGEN is the machine's own.
- Track 0, sector 0 is blank (E5). Sector 1 is the boot loader, with the banner
  "HOLMES VID-80(tm) 62k CP/M vers 2.2", and the CCP and BDOS follow.
- `DUMP.ASM`'s last record is padded with zeros, not Ctrl-Z, so it keeps its
  whole records (4,224 bytes, of which the text is 4,164).

**Digital Research CP/M Plus** (Model 4, sold by Radio Shack as 26-2216;
labeled "v1.00.00" or "v3.0"). 41 disks in `ira/bad-disks`, all single-sided,
40 tracks (five images claim two sides but have nothing on side 1). Measured
from the disks, not from a DPB:

- Track 0 is double density, 18 sectors of 256 bytes numbered from 1: the
  boot track. Every other track has 8 sectors of 512 bytes, also numbered
  from 1. One reserved track, so the directory starts at track 1, sector 1.
- 1K blocks (SID.COM's entry has 0x40 records in blocks 2-9), one byte per
  block number, 156 blocks, and 64 directory entries (blocks 0 and 1).
- No skew: text files (CPM3.LIB, Z80.LIB, PORTS.LIB) read cleanly across every
  sector and block boundary.
- Digital Research serialized each copy. The same utility (PIP, DIR, SET, and
  ten others) on different disks differs only in 2-4 bytes at 0x7C-0x7F, and
  CPM3.SYS (16,128 bytes unbanked, 23,552 banked) in the same way at
  0x113-0x116, which also confirms the layout: any misplaced sector would
  differ in whole blocks.

**Model II CP/M** (8" disks). Measured on the 30 CP/M images in Pete's Model II
archive (see "IMD"). Every vendor reserves two tracks (cylinder 0, FM 26 × 128,
and cylinder 1) and puts the directory at the start of cylinder 2. Three
layouts cover all but one disk:

- **Standard 8" single density** (IBM 3740): FM, 26 × 128 on every track, skew
  6, 1K blocks, 64 entries. The WordStar disk, the Corvus utility disks, the
  Pickles & Trout ACP disk and TriSoft's CP/M-68K distribution disks.
- **Lifeboat and Aton** ("extended density"): 8 sectors of 1024 bytes (Lifeboat
  manual, PDF page 18), 2K blocks, 128 entries, skew 3, as in cpmtools' `trs5`
  (Lifeboat) and `trse` (Aton) disk definitions. STAT.COM reads byte-identical
  from Aton 2.23I, Aton 2.25B and Lifeboat 2.25, and every text file on them is
  clean. The two vendors share the layout, so a disk's name says both.
- **Pickles & Trout and Digital Research's CP/M Plus**: 16 sectors of 512 bytes,
  2K blocks, 128 entries, no skew (the sectors are interleaved physically). The
  P&T manual gives 128 entries for single-sided double density and 192 for
  double-sided (PDF page 10), and the two reserved tracks (page 64); the CP/M
  Plus manual says its 512-byte format is P&T's (page 9). PIP.COM and STAT.COM
  are byte-identical on P&T 2.2mH and TriSoft's boot disk.

The double-sided formats' 192 entries aren't in the table: the one double-sided
disk, Aton 2.25B, uses only 38 of them, so a reading with 128 finds every file.
CP/M Plus's 1024-byte format reserves four tracks (page 9) and isn't in the
table either, since no disk uses it. FMG CP/M 2.21 (26 × 256, interleave 1,
10, 19) doesn't decode.

**Records, not sectors.** The BIOS hands the BDOS 128-byte records, and
blocks are counted in records, so `Cpm` maps each record of a data track to a
sector and an offset in it (in skew order), rather than assuming that blocks
start on sectors. The sector map (`getFileSectorPositions()`) lists each sector
a file uses once, in order of first use: a sector can hold parts of two files on
Super Data disks, and a damaged block list can repeat blocks (`PROBE.TXT` on
mloewen's disks).

**Truncated images.** The image's cylinder count can be less than the disk's,
when the imager stopped early, and then the directory points at blocks past
the end. So each layout is also tried as a 35-, 40-, and 80-cylinder disk
(whichever are bigger than the image), with the sectors past the end reported
missing. When readings tie on score and missing sectors, the image's own size
wins.

**Formats are matched by sectors per track as well as sector size**
(`CpmFormat.sectorsPerTrack`). Montezuma's entry has 512-byte sectors and skew
2. On a P&T disk its directory reads the same as with no skew, since all the
entries are found either way, so the tie would go to Montezuma, the earlier
entry, and every file would come out scrambled. The track lengths keep each
format to its own disks.

## Percom MicroDOS

Percom's Model I MicroDOS (James Stutsman, 1979) shares nothing with the TRSDOS
layouts: no GAT, no HIT, no granules, and no extents. `MicroDos.ts` decodes the
Model I disks that have a directory. Ira's report on set 1
(`report-cantread.txt`) says VDISK extracts these disks.
Measured on the 21 Percom disks (tagged `percom`: 20 in `peter/`, and the
manual disk in `ira/lk-341-set-1`), and confirmed by the BASIC source of
Percom's file manager (FILEMGR), which is on the manual disk (`MicroDOS Disk
Operating System Systems Manual (1979)`) and is the code that maintains the
directory:

- **Sectors are numbered absolutely**, cylinder × 10 + sector, on single-sided,
  single-density disks of 10 sectors per track. The boot sector starts `FE 00
  31 FC`.
- **Every sector starts with a byte count.** Byte 0 is the number of data
  bytes that follow (1-255): 0xFF in a full sector, less in the last sector of
  a file. The bytes past the count are stale, and a count of 0 means the
  sector holds nothing. MicroDOS BASIC's GET and PUT read and write one sector
  as one string of up to 255 characters, and the count is its length. (The
  boot sector's first byte, 0xFE, is Z80 code that also reads as a count of
  254; nothing treats it as a count.)
- **The directory is absolute sectors 20-29** (cylinder 2), always. Each sector
  holds five 45-byte entries starting at byte 1. Byte 0 is 0xE1 (225, the
  length of the five entries); it's the count byte of the previous rule,
  because FILEMGR writes the sector from a 225-character string. The file
  manager writes all ten sectors, so the ones past the sentinel still start
  with 0xE1.
- **An entry** is a 10-character name padded with spaces, a 2-byte start
  sector and a 2-byte end sector (little-endian, absolute, inclusive), a type
  byte (`P` for a program, `D` for data), and a 30-character remark.
- **A name of `%%%%%%%%%%` ends the directory**, so there are at most 50
  files. FILEMGR's initialize command writes just the sentinel, and `Percom
  MicroDOS v1.21` has exactly that: an empty directory.
- **A file is one contiguous run of sectors**, and its contents are the data
  bytes of each sector in order. The DOS and the directory are
  listed as data files of their own: `MICRODOS` 0-19, `DIRECTORY` 20-29, then
  `MENU` 30-31, `PATCHER` 40-42, `FILEMGR` 50-72, `DISKTEST` 80-89,
  `UTILITIES` 100-125, `NOTEBOOK` 150-172 and `NOTEBOOKFL` 200-399 on most
  system disks. Files start on round numbers with gaps between them, so free
  space isn't tracked; the user picks the sectors when adding an entry. We treat
  an entry as a system file if it starts at sector 0 or 20.
- **Program (`P`) files are Level II BASIC in memory format**: the tokenized
  lines (next-line pointer, line number, tokens, 0) without the 0xFF byte that
  starts a TRSDOS BASIC file. We prepend 0xFF to get an ordinary BASIC file. All
  the program files on the 12 disks decode this way. One (TRANS80) is a BASIC
  loader with machine code appended after the program's end.
- **There are no dates, passwords, or attributes** beyond the type letter. The
  version strings the disks print disagree with each other, so we don't report
  a version.

Twelve of the 21 Percom disks have this directory: MicroDOS 1.00 through 2.20,
OS-80 1.5, and the manual disk. The rest don't have one:

- **Five Model I disks have the same boot sector but no MicroDOS directory**
  (no sentinel anywhere): Electric Crayon, Letter Generator, Paymaster, WORP-1,
  and `Percom MicroDOS v1.12 [Hacked by Ron McPeake]`. They use the same
  sector format (byte 0 counts the data bytes). The first four hold turnkey
  programs at fixed sectors with no names anywhere, so there's nothing to
  decode as files. The hacked 1.12 has a directory of its own in absolute
  sectors 20-21 (count 0xDD): 45-byte entries of a name, the first and last
  sector as decimal text (`22 32 `), the type letter and a 28-character
  remark, ended by blanks. It lists only DIRECTORY (22-32) and UTILITIES
  (33-59), numbers that don't match where the directory is, so it's left
  alone.
- **Four Model III disks** (OS-80 III 1.0 and two of 2.02, MicroDOS 2.10) are
  double density with 18 sectors per track, and their boot sector starts `00
  00 6D B6`. They use the same byte-count sector format, but only sector 1 of
  cylinder 0 is meaningful (the others are `6D B6` filler). Empty sectors have
  a count of 13 and the text `HELLO SAILOR!`. They have no directory: their
  BASIC addresses files by absolute sector (`LOAD 10055`, `GET A$,10020`), and
  their menu program lists the files in DATA lines.

## Model II TRSDOS

Tandy's TRSDOS for the Model II, versions 1.1, 1.2 and 2.0 (2.0a, 2.0b), decoded
by `ModelIITrsdos.ts`. It isn't the Model I/III TRSDOS, though Model III TRSDOS 1.3
and Model I 2.7DD descend from it (see "Which DOSes share a layout"), so the
decoder calls it "Model II TRSDOS 1.x" or "2.0". The 2.0 manual (*Model II Disk
Operating System Reference Manual*) gives the geometry and the fields of a
directory record but no byte layout; the rest was measured on the 137 disks in
Pete's archive that hold it, all of which decode.

- **Geometry:** 77 cylinders, one side. Cylinder 0 is FM, 26 × 128; the rest are
  MFM, 26 × 256, sectors 1-26 (2.0 interleaves them physically). A granule is 5
  sectors, 5 per cylinder; sector 26 is never used (manual, PDF page 174).
- **The directory** is 5 granules (sectors 1-25) on cylinder 44 unless FORMAT's
  `DIR=` put it elsewhere, with an alternate copy on cylinder 52, or the directory
  plus 8 (PDF pages 120-121). Three SCRIPSIT disks have it on cylinder 1. Cylinder 0
  sector 2 says where: byte 0 is the directory cylinder, byte 1 the layout (1 or 2,
  below), bytes 2-9 "TRSDOS  ", and byte 10 a BCD version (0x20 on 2.0, 0x12 on
  1.2, 0 on 1.1), which isn't reliable: six 2.0-layout disks say 0x12.
- **Two directory layouts.** 1.x keeps the GAT in sector 1 (a byte per cylinder at
  0x00 with the unused high bits set, so 0xE0 is free; a 77-byte table at 0x4D;
  the directory cylinder at 0x9A, then 0x01), the HIT in sector 2, and entries from
  sector 3. 2.0 puts the HIT at 0x00-0x5F of sector 1 and the GAT at 0x60 plus the
  cylinder (low 5 bits the granules, 0x40 the directory cylinder, 0x20 the
  alternate, 0x80 locked out), the directory cylinder at 0xAD, then 0x02, and
  entries from sector 2: 96 of them. The manual (PDF page 2) says 1.x and 2.0
  can't read each other's disks. Four disks have a 1.x-style ID sector over a 2.0
  directory, converted ones, so the decoder picks the layout by content.
- **The HIT** uses the Model I hash ("The HIT"), dense: entry sector times 4 plus
  the entry. 0 marks a free slot. Every in-use entry on every disk matches.
- **Entries** are 64 bytes, four per sector:

      0      attributes: bit 7 system file, bit 5 program; other bits are the
             "user attribute byte" of the manual's RAMDIR record (PDF page 226),
             set by applications (0x02, 0x10, 0x40, ...)
      3      EOF: offset of the first byte of the last record
      4      LRL, 0 meaning 256
      5-15   name and extension
      16-19  update and access password hashes, the 2.3 family's (0x4296 blank)
      20-21  ERN: the relative sector holding the last record
      22-53  sixteen extents: a cylinder, then bits 7-5 the granule and bits 4-0
             the count minus 1; 0xFF ends them. No extended entries.
      54-56  created: year - 1900, month, day
      57     protection level, 0-7 (6 or 7 on system programs)
      58-60  updated, the same way

- **File size** is ERN × 256 + EOF + LRL, which follows from the manual's
  definition of EOF. Checked by content: text files end exactly at their last
  carriage return, every fixed-record file is a whole number of records, 1,123
  load modules end inside the file (one more, `TO2` on `DIAGNOST.IMD`, runs 36 bytes
  past the end, on the disk's last granule), and `BASIC` on 2.0a (ERN 69) owns exactly the
  14 granules that 70 sectors need. An empty file has ERN 0xFFFF, EOF 0xFF and no
  extents.
- **Versions** can't be told apart beyond the layout: the ID sector (cylinder 0
  sector 1, the disk name and the master password hash, "PASSWORD" being E0 42 as
  in the 2.3 family) is the same on 2.0, 2.0a and 2.0b.

## TRSDOS-II

TRSDOS-II 4.1-4.4, for the Model II, 12, 16 and 6000, decoded by `TrsdosII.ts`.
It shares nothing on disk with Model II TRSDOS. The *TRSDOS-II Reference Manual*
gives commands and the RAM directory record but no byte layouts; this was
measured on the 35 TRSDOS-II disks in Pete's archive (31 single-sided, 4
double-sided), all of which decode, with every file read to exactly its size.

- **Geometry:** cylinder 0 side 0 is FM 26 × 128; everything else is MFM 16 × 512,
  sectors 1-16. **The allocation unit is a 256-byte half sector** (a granule
  here), 32 per track: granule g is in track g / 32, sector (g % 32) / 2 + 1, half
  g % 2. Tracks run side 0, side 1, then the next cylinder, and on double-sided
  disks cylinder 0 side 1 holds data. Granules below 32 are cylinder 0 side 0.
- **Parameter block:** cylinder 0 sector 3, 128 bytes, big-endian. 0x00 disk name,
  0x08 master password hash (little-endian; E0 42 is "PASSWORD", FORMAT's default,
  manual PDF page 75), 0x13 and 0x17 the root directory and its backup, 0x1B and
  0x1F the allocation bitmap and its backup, 0x23 the number of granules (3
  bytes), 0x26 the device type (0x15 floppy, 0x10 double-sided floppy, 0x05 hard
  disk), 0x30 a version byte (0x41-0x43, which doesn't follow the DOS version), and
  0x31 the directory type, 3. Sides come from the granule count, not the device
  type: three double-sided disks say 0x15.
- **Files** are found by number: a file number (3 bytes) is the granule holding its
  block table, 64 four-byte runs of a count and a start granule (3 bytes),
  ended by a zero.
- **Directories:** the root lists only SYSTEM/DIR and USER001/DIR, each with a
  backup block table at 0x33 of its root entry. The backups (of the root, the
  subdirectories and the parameter block's files) are often stale, so they're
  used only when the primary can't be read.
- **Entries** are 64 bytes:

      0x00   flags: 0x80 system, 0x40 Z80 program, 0x20 data (including 68000
             programs), 0x04 variable-length records; 0 a free slot
      0x02   name and extension, "NAME/EXT", 23 bytes; byte 0x19 is "*" on 4.4
      0x1A   created: minutes since January 1 (3 bytes) and year - 1900
      0x1E   modified, the same way
      0x26   privilege (16 bits): the low 3 bits the protection level (manual,
             PDF page 51)
      0x28   EOF (32 bits): offset of the first byte of the last record;
             0xFFFFFFFF for an empty file
      0x2C   LRL (16 bits); in a variable-record file, the last record's length
      0x2F   block table granule
      0x3C   update and access password hashes (little-endian, 0x4296 none)

- **File size** is EOF + LRL, as in Model II TRSDOS. Variable-length records start
  with a length byte that counts itself, and walking them from 0 lands exactly on
  EOF on all 19 such files. Files are often over-allocated, with stale data after
  the end.
- **Programs** (flag 0x40) are ordinary CMD load modules: all 911 decode.
- **System files** are the ones in SYSTEM/DIR, which is what FILES/DIR "SYS" shows
  (PDF page 72). The 0x80 flag isn't set on all of them.
- **Version:** system disks through 4.3 say it on cylinder 0 sector 1 ("TRSDOS disk
  operating system version 4.2."); 4.4 disks don't, but SYSTEM/SYS says
  "TRSDOS-II ver. 04.04.00". Four data disks have neither.

## Xenix tar disks

Many of Tandy's Xenix distribution floppies (Model 16 and 6000) hold a plain tar
archive rather than a file system, decoded by `XenixTar.ts`. Measured on Pete's
archive: 71 of its 156 Xenix images decode this way, 5,043 members, each matching
Python's `tarfile` field for field. The rest hold a Xenix file system (a
superblock in block 1), which we don't read.

- **Layout:** cylinder 0 side 0 is FM 26 × 128 filler; the data tracks are MFM 16 ×
  512. The archive starts at linear track 1 (cylinder × sides + side), so at
  cylinder 1 on single-sided disks and at cylinder 0 side 1 on the four
  double-sided ones, and runs through the sectors in ID order.
- **Old tar headers:** only regular files and hard links, no directories, no ustar.
  Numbers are octal, space-padded, ended by a space or NUL, and the size field can
  have stale digits after its NUL (`132000\0` then `1654 `), which `bsdtar`
  rejects and GNU tar accepts. Archives end with a zero block (one ends at 0xE5
  filler). None is cut off by the end of the disk, though the decoder would
  report such a member's missing sectors as damage.
- **Files split across disks (extents).** Every disk of a set is a complete
  archive of its own: no member runs off the end of a disk, and no tar disk
  starts in the middle of a member. A file that doesn't fit is instead split
  into *extents*, each stored as a member with the same name on consecutive
  disks. Four files do this in Pete's archive: `bin/awk` across TRS-XENIX
  1.3.0's `XNX130D3` and `XNX130D4`, and `vtrek`, `adventure` and `nethack`
  across the seven-disk `Xenix_Games` set (whose README says the archive spans
  all the disks). Other headers leave these bytes zero:
  - Bytes 257-260 hold the extent number from 1, and 261-264 the extent count
    (only "1" and "2" seen, NUL-terminated, so decimal or octal can't be told).
    Bytes 265-276 hold the whole file's size in octal, NUL-terminated: `vtrek`'s
    extents are 46,080 and 15,070 bytes, and the field is `167336`, which is
    61,150. The size field is the extent's own size.
  - These are the bytes where ustar puts its magic, so these headers aren't
    mistaken for ustar.
  - Every first extent fills its disk up to block 1,214 of the 1,216 in the
    stream, leaving two blocks for the zero blocks that end the archive. That
    holds on `GAMES3`, too, which has 78 cylinders (1,232 blocks), so `tar` was
    told the volume size rather than finding the end of the disk.
  - No other header field marks the split, and an archive that holds only a
    later extent (`XNX130D4`) looks like any other archive.
  - `XenixTar.ts` reads the fields into `XenixTarFile.extent`. `trs80-tool
    extract` writes a first part with a warning, and appends each later part
    to the file that the earlier parts made in the output directory, so
    extracting the disks in order into one directory rebuilds the file.
- **Half-imaged disks:** the 3.2.0 `AlternateSet` folder's `XNX320D2` and
  `XNX320D3` look like continuation disks, since each starts in the middle of a
  member, but they aren't. They're the double-sided D2 and D3 read single-sided:
  track *n* of each holds cylinder *n* side 0 of the double-sided disk, so every
  other track of the archive is missing.
- **Tar after a file system:** `XNX320FM` (in both 3.2.0 folders) has a Xenix
  file system whose superblock gives 1,256 blocks, followed by what looks like a
  26-member tar archive (games, such as `usr/games/wof`) starting at stream
  sector 1,500 and ending in a zero block. We don't read it, because the decoder
  only looks for an archive at the start of the data tracks.
- **Stale headers:** eight Xenix file system disks have a valid tar header at
  cylinder 1 sector 1 followed by file system data. One header followed by junk
  isn't an archive, so they're rejected.
- **Names** are Unix paths, so a file's name contains "/", which the `FloppyDirEntry`
  interface takes to separate directories. `extract` and the web app's ZIP export
  recreate them.

## UCSD Pascal

FMG Corporation's UCSD Pascal II.0 for the Model I (1979) keeps a volume of the
UCSD Pascal (the operating system that UCSD Pascal runs on) on a TRS-80 floppy, decoded by `UcsdPascal.ts`. Measured on the three FMG disks in
`UCSDPascal/` in the regression suite: `TRS-80` (the system disk), `UTILS1` and
`XUTIL`.

- **Disk:** 35 cylinders, one side, single density, 10 sectors of 256 bytes
  numbered 0-9. Cylinder 0 is a TRS-80 boot track and isn't part of the volume;
  its sector 1 loads `SYSTEM.TRS-80` by name. The volume starts at cylinder 1.
- **Blocks** are 512 bytes, two sectors. Numbering the volume's sectors from 0 at
  cylinder 1, block *b* is sectors 2*b* and 2*b* + 1. Sector *s* is on volume
  track *t* = floor(*s*/10) (cylinder *t* + 1) as logical sector *L* = *s* mod 10.
- **Interleave and skew:** within a track the logical sectors are in physical order
  0, 2, 4, 6, 8, 1, 3, 5, 7, 9 (an interleave of 2, which is `makeSkewTable(10, 2)`
  in `Cpm.ts`), and each track after the first is rotated by a further 6:
  physical sector = (order[*L*] + 6*t*) mod 10. For example, block 0 is cylinder 1
  sectors 0 and 2; block 2 is sectors 8 and 1; block 3 is 3 and 5; block 4 is 7 and
  9; block 5 is cylinder 2 sectors 6 and 8; block 6 is cylinder 2 sectors 0 and 2.
  This is the same scheme as UCSD's standard 8" layout (interleave 2, track skew 6,
  starting at track 1), adapted to 10 sectors per track.
- **Directory:** blocks 2-5, little-endian words, 26-byte entries. Entry 0 is the
  volume header: first block (0), next block (6, the block after the directory),
  file kind (0), the volume name as a Pascal string (length byte 1-7, then 7
  bytes), `eovBlock` (the volume's block count), the number of files (0-77), the
  load time, the last boot date, and 4 unused bytes. `eovBlock` is 170 on all three
  disks, which is 34 tracks, so the volume is cylinders 1-34.
- **A file entry** is its first block, the block after its last (exclusive), a
  kind word (the low 4 bits are the kind; the rest is status and filler), the
  name as a Pascal string (length 1-15, then 15 bytes), `lastByte` (bytes used in
  the last block, 1-512), and the date word: month in bits 0-3, day in bits 4-8,
  years since 1900 in bits 9-15. A month or day of 0 means no date.
- **Kinds:** 0 untyped, 1 bad blocks, 2 code, 3 text, 4 info, 5 data, 6 graf, 7
  foto, 8 secure directory.
- **Files are contiguous** and sorted by first block, and don't overlap. A file's
  size is (next block - first block - 1)*512 + `lastByte`. Names include their
  dots (`SYSTEM.PASCAL`, `READ.ME.TEXT`). The p-System has no system attribute, and
  the `SYSTEM.` naming convention also covers the user's work file, so we don't
  hide any file.
- **Text files** (kind 3, named `.TEXT`) start with a 2-block (1,024-byte) editor
  header, then 1,024-byte pages. Each line ends in CR (0x0D), and a page is padded
  with NULs after its last whole line, so a line never crosses a page. A DLE
  (0x10) followed by the byte 32 + *n* stands for *n* spaces; the editor writes
  one at the start of every line for its indentation, with 32 (no spaces) when
  there is none, and a line's literal spaces after that are kept.
  `ucsdPascalTextToHost()` turns this into host text. In `READ.ME.TEXT` the header is
  all zeros except for a leading 0x01, and the text begins "FMG/UCSD PASCAL USER:".
- **Unwritten directory sectors** hold the 0xE5 fill, so the decoder reads only
  the sectors that `(files + 1)*26` bytes need. `XUTIL`'s nine files take two
  sectors.
- **How it was verified:** on all three disks every block a file owns has data
  and every free block is untouched 0xE5 fill. `READ.ME.TEXT` (text, 11 Jun 1979,
  blocks 127 up to 131; the text itself starts at block 129 with "FMG/UCSD PASCAL
  USER:") reads continuously across a track boundary only with the skew of 6.

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

**The JV3 decoder rejects non-JV3 files reliably**, because each of the 2,901
headers must be free or name a plausible sector (cylinder < 100, sector < 40),
and no two may name the same one. Run on 31,498 files of 8,704 bytes or more
(every image in the regression suite, plus system binaries, libraries and
fonts), it accepted only real JV3 images: the `.jv3` files, two sdltrs `.dsk`
files, and eight in `ira/lk-341-set-1` (and their copies in `ira/bad-disks`)
that are JV3 despite a `.dmk` name, such as `Pro-MC Library` and `TRSDOS v6.02
... [Patched]`. So `decodeTrs80File()` tries JV3 when a `.dmk` file doesn't
decode as DMK, as `.dsk` already did.

**DMK** stores raw track bytes. The 16-byte header is write-protect, track
count, little-endian track length, flags. Flag bit 4 is single-sided, bit 6 is
single-density size, bit 7 is ignore-density. **Bits 6 or 7 mean single-density
bytes are stored once; otherwise every single-density byte is doubled**, with
CRCs computed over the un-doubled bytes. Track length includes the 128-byte
header (0x1900 is the usual double-density value, 0x0CC0 single density; the
spec's max is 0x2940, but see below). Each track has 64 IDAM pointers, LSB/MSB, bit 15 for double density,
bit 14 undefined, offsets masked with 0x3FFF and including the header, in
ascending order and zero-terminated. Verified across the 84 DMK files present at
the time (the five NEWDOS/80 additions were checked the same way and agree): no
entries after a terminator, none out of order, and every file's doubling matches
its flags (checked by recomputing IDAM CRCs at both strides). Sector size codes
are 128, 256, 512, 1024.

**Track lengths can exceed the spec's 0x2940.** Eric Smith's dmklib (and its
`rfloppy` imager) stores an 8" double-density track as 0x2900 bytes plus the
header, so 0x2980, and sizes other tracks as `rate × 7500 / rpm` plus the header,
about 0x3154 for a 3½" high-density disk. The reader accepts up to 0x4000, all
that the pointers' 14-bit offsets can reach. None of the collection's 691 DMK
images (October 2026) is over 0x2940.

**Size codes use only their low two bits**, as on the WD179x, so a code above 3
means `128 << (code & 3)`, which is also what the emulator's FDC does. (The
FD1771's non-IBM mode instead reads 16 × N bytes, but the Model I DOSes don't use
it.) No ID with a good CRC in the collection has a code above 3.

**Double-density CRCs cover A1 A1 A1, whatever the image stores before the
mark.** The controller finds an MFM address mark by its sync bytes, so they're
always 0xA1 to it, but some imagers caught the first one partway and stored
0x14, 0x15, or 0xA9 instead. Of the 655,822 double-density ID and data fields in
the collection's DMK images, 12 have a CRC that fails over the stored bytes and
passes over three 0xA1s: in `peter/Cornsoft-Brix-Development-newshell2-bath3`
and `bath4`, `diffs/Cornsoft-Micro-SynthDev-newshell-bath6`, and
`peter/Col 2 - 038 - No Box - 25 [T1-4 T2-1]`. None goes the other way, so the
reader uses constant 0xA1s for double density. (No real IDAM is within three
bytes of its track's start, where the stored sync bytes would be at the end of
the track instead.) The data mark search accepts any 0xF8-0xFB byte, not only
one after an 0xA1; in the collection that never picks a byte before the real
mark, and the 57 marks it finds with no 0xA1 before them are all on bad ID
fields that aren't really there (`MultiDOS II`, `Modem-80 v3.0`,
`Variable Finder`, described below).

**An IDAM pointer can point past the end of its track.** On
`ira/no-extract/TRSDOS v2.1 ... [Set 6].dmk`, track 17's last pointer is 4 bytes
before the end, a partial re-read of sector 0. Its ID field runs into track 18's
header, whose bytes decode as cylinder 17, sector 4, with no data mark, and
replaced the real sector 4 (a directory sector holding SYS0/SYS). The reader
drops pointers whose 7-byte ID field doesn't fit in the track. A real FDC would
have found the real sector anyway, since it searches again when no data mark
follows an ID. Of the 182 duplicate IDs in the collection at the time, none
other had a later copy that is worse than an earlier one; see the next note for
disks added since. Since then `Make-80 v1.2 [M1][Set 2][Disk 1 of 2]` (in
`ira/lk-410-crazy-errors/`) has six: tracks that end with a re-read of their
first sector, whose ID fits in the track but whose data mark doesn't, so the
later copy, with no data, replaced the good one. They're the only ones in the
collection. So a copy with no data field no longer replaces one that has one
(see the rule at the end of the next note).

**A data field can run past the end of its track too.** The reader treats a
data field whose data and CRC don't fit in the track as missing, just as it
drops ID fields that don't fit; otherwise its bytes, and its CRC, would come from
the next track's header. In October 2026 that was 62 data fields in 7 images, all
belonging to junk IDs (cylinder bytes that don't match the track): most on
`Make-80` above, the rest on `Macro-Mon`, `VS-100 Driver Disk [Set 3]`,
`MultiDOS II`, `High Resolution Driver Disk [Disk 1 of 2]`, and two of the stale
pointers in the next note. No decoded file changed.

**An IDAM pointer can be stale.** On `ira/basic-course/`, normal tracks hold 18
double-density sectors whose IDs are 342 bytes apart, starting at offset 175. A
few tracks hold only 17 or 16, spread out evenly (362 or 384 bytes apart), so
whatever wrote them laid out only the sectors it had: cylinder 37 of
`Model III Basic Course [Disk 1 of 2]` lacks sector 13, cylinder 39 of
`[Disk 2 of 2]` lacks 1 and 16, and cylinder 32 of `Monty Plays Monopoly`
lacks 5. Each of these tracks still has 18 pointers. The extra ones are the
18-sector layout's last slots (175 + 16 × 342 = 5647 and 175 + 17 × 342 = 5989),
which the writer didn't clear as the DMK spec requires, and on `Disk 2` they
come after the real pointers, out of order. At those offsets there's no ID mark
and no sync, only gap filler (`4E`, read as cylinder, side, and sector 78, with
a size code meaning 512 bytes) or sector data (`E5`). They have bad ID CRCs, so
the geometry ignores them, but they're kept as IDs. The sectors around them are
intact, with good CRCs. Yet Super Utility, run on these images, reports CRC errors
in exactly the sectors that hold a stale pointer (sector 18 on the first and
third disks, 15 and 18 on the second), so some software trusts the pointers. A
pointer whose byte isn't 0xFE is a sign of one.

**An IDAM pointer can point at data.** On `French Teacher #1 ... [Set 2].dmk`,
every track ends, after sector 9's gap, with about 50 bytes of what looks like
the formatter's own Z80 code (the same bytes on every track), and the imager
recorded each 0xFE byte in it as an IDAM: sectors 11, 66, and sometimes 22, all
with bad ID CRCs and no data mark. A real FD1771 wouldn't see them, since a data
0xFE lacks the address mark's missing clock bits. Counted as sectors, they made
the track span 67 and nothing decoded. Its 350 real sectors match Set 1's except
for the GAT's date (11/30/79 against 04/05/83). `Variable Finder` and
`Modem-80 v3.0` (Sets 1 and 3) are worse: after each track's ten single-density
pointers come eight double-density ones, back at lower offsets (so pointers
aren't always in ascending order), every 342 bytes, with bad CRCs, no data mark,
and sector numbers such as 0, 229, and 255. Those made the span 256, and the
ones claiming sector 0 replaced the real sector 0 of their track, which hid the
directory on cylinder 5. So two rules: `TrackGeometry` takes a track's sector
range, density, and size only from IDs whose CRC is good; and in both the DMK
reader's and the geometry's sector maps, a later duplicate doesn't replace an
earlier one whose ID CRC is good unless its own is too, nor (since `Make-80`,
above) an equally good one that has a data field when it has none. The bad IDs
stay in the geometry's sector list. These rules also let `MultiDOS II ... [Incomplete].dmk`
decode.

**A track whose IDs are all bad is unformatted.** Imagers also find 0xFE bytes
in the noise of tracks that were never formatted. `BFBDEM Basic Faster and
Better Demonstration` has 36 formatted cylinders in a 40-cylinder image, and
cylinders 36 to 39 hold 2 to 8 such IDs each. `Special Disk Formatter (Breeze
Computing)` formats only cylinders 0 to 4, and 17 of cylinders 5 to 34 hold
one to three. Every one of them has a bad ID CRC, a cylinder byte that doesn't
match its track, and almost never a data mark after it. Their sector numbers
(0 to 254) gave those tracks spans of up to 255, and gave the Breeze disk a
modal span of 1. So a track with no good ID gets no `TrackGeometry`, as if it
were blank, though its IDs stay in the sector list. A boot track like that
means the disk has no geometry and isn't decoded.

Some DMK files are **one track short** of what the header promises. Five in the
collection (`LD4-631.DSK`, the trs80gp sample, which is a DMK despite its
extension; `willus/ND80M3V3.dmk`; and `mloewen/FORMAT5`, `6`, and `11`) are
single-sided disks in images flagged double-sided. Every side-1 track is present
but unformatted, except the last one, which is missing. The reader loads the
whole tracks that are there and treats the rest as unformatted, without a
warning, since it's harmless.

**SCP** is raw flux. There are no SCP images in the collection, so that reader is
entirely untested.

**HFE** (HxC Floppy Emulator, also written by Gotek drives running HxC or
FlashFloppy) stores each track as its raw cell stream, one bit per half-cell,
already clocked. All 31 images in the collection (`telanoc/model{1,3,4}`) are
version 1 (`HXCPICFE`, format revision 0); v3 (`HXCHFEV3`) isn't supported. The
512-byte header is followed by a track list at `trackListOffset * 512` (u16 at
offset 18, in 512-byte blocks) of 4-byte entries: track data offset (u16, in
blocks) and track length (u16, bytes, both sides together). The sides are
interleaved in 512-byte blocks, 256 bytes of side 0 and then 256 of side 1, and
each side gets `floor(length/2)` bytes. Bits are stored least significant first.
Track lengths differ from track to track (24,932-25,006 on one image), so use
each track's own.

**Every image is clocked at 250 kbit/s, so one HFE bit is one MFM half-cell, even
on single-density disks.** A double-density byte is 16 cells, alternating clock
and data; the sync byte 0xA1 with its missing clock is the raw pattern 0x4489.
A single-density byte is 32 cells, four per data bit (clock, 0, data, 0), and an
address mark is a byte whose clock is 0xC7 instead of 0xFF. Since the cells are
already clocked, marks are found by pattern at every bit offset, which decides
the density per sector, not per track. That reads the single-density boot track
followed by double-density data tracks (Model I doublers) with no special case.
Treat each side's stream as circular: a sector whose data runs past the end
continues from the start.

**The header lies about everything but the layout.** The encoding field says
MFM on every single-density disk, and one image says FM at 249 kbps and 0 RPM.
Four single-sided images say 2 sides with side 1 blank, and several say 41 tracks
with the last one empty. So the geometry comes from the decoded sectors, not
the header. With that, all 31 images decode with every ID and data CRC valid.

**MFM data can contain a false FM address mark.** The bytes F5 7E followed by a
byte of 0x80 or more produce exactly the raw cells of an FM ID mark, and this
happens for real on 4 tracks of 2 images, producing fake sectors with bad CRCs.
Once a sector is accepted, the reader ignores every mark that starts before the
end of its data CRC. It must not instead drop sectors with bad CRCs, because
copy-protected disks have them on purpose.

**IMD** (Dave Dunfield's ImageDisk) stores sectors, like JV3, but per track. It's
the usual format for Model II and other 8" disks, because it records each track's
data rate. After an ASCII header (`IMD 1.18: dd/mm/yyyy hh:mm:ss\r\n`, then a
free-form comment) and a 0x1A byte, the tracks follow until the end of the file.
Each track has five header bytes:

- **Mode:** 0-2 is FM and 3-5 is MFM, at 500, 300 and 250 kbit/s.
- **Physical cylinder.**
- **Head:** the physical side is bit 0. Bit 7 means a cylinder map follows, and
  bit 6 a head map.
- **Sector count.**
- **Size code:** the size is 128 << n. 0xFF means a table of 16-bit sizes follows,
  which MAME supports but no image in the collection uses.

Then come the sector numbering map (the ID-field sector numbers in physical order,
so interleave survives), the optional cylinder and head maps (ID-field values that
differ from the physical position), and one record per sector. A record's type
byte decides what follows:

- **0:** no data (the ID was found, the data wasn't).
- **Odd (1, 3, 5, 7):** the full data follows.
- **Even (2, 4, 6, 8):** one fill byte follows.
- **Deleted data mark:** 3, 4, 7 and 8.
- **Data error:** 5 to 8.

There are no gaps, CRC bytes, or exact data marks, so an F9 or FA mark is lost:
it's deleted or not. The reader leaves type-0 sectors out of the geometry, and,
like the HFE reader, describes sectors by their physical position but returns
them with their ID-field position.

**Measured on the 368 IMD images in Pete's Model II archive** (13 copied into
`model2/`):

- **Versions:** the headers run from 1.08 to 1.18, and some were written by
  converters (`IMD DMK ...`, `IMD TD 1.5 ...`, the HxC software, and keirf's
  Disk-Utilities).
- **Model II layouts:** cylinder 0 is FM, 26 × 128, numbered 1-26 (the IBM 3740
  format). The data cylinders are MFM:
  - 26 × 256 for TRSDOS 1.x and 2.0.
  - 16 × 512 for TRSDOS-II 4.x and Xenix (most of the archive).
  - 8 × 1024 for Lifeboat and Aton CP/M.
  - 30 × 256 numbered from 0, after a 27 × 128 FM cylinder 0 also numbered from
    0, for LS-DOS 6 and DOSPLUS II.
- **Other layouts:** some CP/M disks are FM 26 × 128 throughout. A few Model
  I/III/4 disks are 5¼" at 250 kbit/s.
- **Map use:** one image (`model2/CPMPLUS4.IMD`) uses a cylinder map, and none
  uses a head map.
- **Missing signature:** 11 images don't start with `IMD`, because someone
  replaced the signature line with a comment. Find the 0x1A; don't check the
  signature.
- **HxC empty tracks:** the HxC software writes empty tracks (0 sectors, on
  side 1 of single-sided disks) with mode 0x81 or 0x82, so the mode is only
  checked on tracks that have sectors.
- **Damaged files:**
  - `model2/TD2BLANK.IMD` and one other image end with a stray 0x0A, probably from a
    text-mode transfer.
  - Two AXX-2037 diagnostics images (`model2/AXX-2037-051286-WORK.IMD`) have 77
    good tracks followed by appended junk.
  - The reader keeps every complete sector before the first invalid header or
    record, and logs a warning for the rest. It doesn't set the file's error,
    because an error stops the disk from being opened at all.
- **Not IMD:** one `.IMD` is really an HxC `HXCMFM` file.

## Hard disk images

Hard disks are `HardDisk` objects, not `FloppyDisk`s: a flat array of 256-byte
sectors addressed by (cylinder, head, sector), with none of a floppy's recording
details. Each partition is a `HardDiskPartition`, which implements `DiskVolume`
(the part of a floppy that the TRSDOS decoder uses), so the same `Trsdos` class
reads floppies and partitions. Only LDOS 5 and LS-DOS 6 partitions are read.
Everything below was measured on the images in `disks/hard/`, and agrees with *The
Programmer's Guide to TRSDOS Version 6* (`TRSDOS/`), the drive control table (DCT)
in section 4.2, PDF pages 32-35.

### The HDV file

The format of xtrs, FreHD and sdltrs. Matthew Reed designed it for his emulator;
his spec is at <https://www.trs-80.com/sub-tips-file-formats.htm#HDV1>. George
Phillips' xfile (<https://48k.ca/xfile.html>) is a public reader for HDV1, HDV2,
DREM and `.emu` images.

- **Layout:** a 256-byte header, then 256-byte sectors in cylinder order, head by
  head within a cylinder: byte offset = 256 + ((cylinder × heads + head) × 32 +
  sector) × 256. Every disk has 32 sectors per track, numbered from 0.
- **Header:** bytes 0-1 are `56 CB`. Byte 2 is the version, `0x10` (xtrs, FreHD) or
  `0x11` (David Keil's emulator, which Reed's spec doesn't mention); we accept
  those two. Byte 4 is 1 (header blocks) and byte 6 is the media type, 0 for a
  hard disk. Bit 7 of byte 7 is write protect. Bit 0 of byte 8 means auto-boot,
  and then byte 11 says which DOS. Reed's spec defines 0-3, and FreHD's boot ROM
  (`frehd.inc` in the FreHD source, <http://www.vecoven.com/trs80/trs80.html>)
  defines all six: 0 = LS-DOS 6.3.1, 1 = Model III LDOS 5.3.1, 2 = CP/M,
  3 = Model III NEWDOS/80 2.5, 4 = Model I LDOS 5.3.1, 5 = Model I NEWDOS/80 2.5.
  Byte 11 matches that table on every sample (`m1-ldos531-keil.hdv` has 4, Model
  I LDOS, and `m1-newdos80v25.hdv` has 5) except `m1-dosplus35-keil.hdv`, a Model
  I DOSPLUS 3.5 image, which has 6, a value FreHD 2.14 doesn't define. Byte 29 is the sectors
  per cylinder, 0 meaning 256. Byte 26, if not zero, is the heads; otherwise the
  heads are the sectors per cylinder ÷ 32. Byte 26 is 0 in every sample.
- **Where the images deviate from the spec:**
  - Byte 5 must be 4 according to the spec, but FreHD's firmware writes 1 when it
    creates an image, so we don't check it.
  - The cylinder count (bytes 27-28) is wrong in most images: one says 203
    cylinders and holds 840. Only the file length is trustworthy, so cylinders =
    ceil((length - 256) / (heads × 32 × 256)).
  - A file can end partway through a cylinder (`m4-lsdos631.hdv` stops after head
    3 of its last cylinder, and its four partitions use only heads 0-3), so
    sectors past the end of the file don't exist.
  - The checksum (byte 3) matches the spec's formula in no sample. We ignore it.
  - Unused sectors hold filler (`E5`, `FF`, `6DB6` or `00`), so a sector's mere
    existence is no evidence of anything.
- **F48:** bit 1 of byte 8 marks the 8-inch FreHD's extension for the Model II
  (xfile documents it): bits 3-2 give the sector size and byte 29 becomes sectors
  per head. No sample uses it, and we reject such images.

### Partitions

A partition is a block of whole cylinders and whole heads: a cylinder offset, a
head offset, a cylinder count and a head count. The samples split either by head
(each partition one head across every cylinder: `m1-ldos531-keil.hdv`,
`m3-ldos531.hdv`, `m4-lsdos631.hdv`) or by cylinder (every head, over a run of
cylinders: `hxchard-lsdos6-6part.hdv`, `m4-lsdos631-st251.hdv`,
`hxchard-ldos5-6part.hdv`).

LDOS sees a partition as a floppy with one side and long tracks: logical cylinder
*c* has `heads × 32` sectors, and logical sector *s* of it is physical sector
*s* % 32 of head (head offset + ⌊*s* / 32⌋) of cylinder (cylinder offset + *c*).
The lump model (see "The lump model") then applies unchanged: one allocation
side, a lump is a cylinder, `granulesPerLump` is the granules per cylinder,
`sectorsPerGranule` is `heads × 32` ÷ that, and `firstDataCylinder` is 0.

- **Boot sector:** logical (0, 0), the partition's first sector. It starts
  `00 FE`, and byte 2 is the directory cylinder, relative to the partition, as on
  floppies. Every partition of every LDOS and LS-DOS sample has this. DOSPLUS's
  system partition starts `F3 FE`, as DOSPLUS floppies do (see "Boot sector
  prefixes"), so we accept any first byte and mask byte 2 with 0x7F.
- **Directory:** the GAT is sector 0 of the directory cylinder and the HIT is
  sector 1, then up to 32 entry sectors; a cylinder with fewer sectors has fewer.
  They run across heads, so with 6 heads, entry sectors 30 and 31 are on head 1.
- **Trap:** sector 3 of each partition's cylinder 0 holds a copy of its GAT (a
  stale one on some disks), followed by filler where the HIT should be. Only
  accept a GAT at sector 0 of the cylinder that the boot sector points to.
- **GAT fields:** the allocation table is one byte per cylinder from byte 0x00,
  for up to 203 cylinders, and there is no lockout table at 0x60. The cylinder
  count is `GAT[0xCC] + 35`, the granules per cylinder `(GAT[0xCD] & 7) + 1`, and
  bit 7 of 0xCD marks a data (non-system) partition. The version at 0xCB is 0x53
  (LDOS 5.3) or 0x63 (LS-DOS 6.3) in the samples; `hxchard-ldos5-6part.hdv` says
  0x63 too.
- **Media data block:** `GAT[0xF5]` is 3, followed by three letters naming the
  driver, then `GAT[0xF9..0xFF]`, which are bytes 3-9 of the DCT:
  - 0xF9 FLAG1. Its low 2 bits are bits 8-9 of the partition's starting cylinder.
    Bits 3-2 were set on every sample, meaning unknown.
  - 0xFA FLAG2. Bits 3-0 are the starting head, for partitions split by head
    (guide, page 33). Bit 5 is DBLBIT (below). Bit 4 was set on every sample, and
    the guide's meaning (an "alien" controller) doesn't obviously fit.
  - 0xFB CURCYL, which the guide leaves to the hard disk driver. With the `RSH`
    driver it is the low 8 bits of the starting cylinder.
  - 0xFC MAXCYL, the cylinder count minus 1 (page 33).
  - 0xFD: bits 7-5 are heads minus 1, bits 4-0 sectors per track minus 1 (always
    31) (page 34).
  - 0xFE: bits 7-5 are granules per cylinder minus 1, bits 4-0 sectors per granule
    minus 1.
  - 0xFF DIRCYL, equal to the boot sector's byte 2 on every sample.

  Every sample but one has the letters `RSH`. `hxchard-ldos5-6part.hdv` has `DCT`,
  and its CURCYL is 0 even for the partition at cylinder 170, so the block doesn't
  say where that partition starts. We trust the block only with `RSH`, and
  otherwise take the cylinder count and granules from 0xCC and 0xCD and the heads
  as the disk's heads minus the candidate's head. That assumes the partitions are
  split by cylinder, which is all that the sample without the block needs.
- **Without the block, the GAT's version decides.** It must be one of the LDOS
  and TRSDOS 6 versions (0x50-0x53 and 0x60-0x63, as in "GAT bytes 0xCB-0xCD"),
  whose 0xCD gives the granules, or DOSPLUS 3's (0x31-0x35, below). A GAT with any
  other version doesn't count.
- **DOSPLUS 3.5** (`m1-dosplus35-keil.hdv`, a Model I disk) uses the LDOS
  layout: six partitions by cylinder, at 0, 170, ..., 850, each with all 8 heads,
  170 cylinders (`GAT[0xCC] + 35`) and its directory on cylinder 85. Its GAT has
  version 0x35 and no media data block, and **leaves 0xCD at 0**, so the
  granules per cylinder aren't recorded. Its files show them: granule offsets
  run 0-7, and files of up to 32 sectors (BOOT/SYS, BASIC/CMD) take one
  granule, so a granule is a track of 32 sectors and a cylinder has one per
  head. Read that way, 53 of the system partition's 66 files decode as CMD
  programs, and every file on the disk reads cleanly except STARTREK/CMD in the
  second partition, whose CMD records run past its 15 sectors into filler, so
  the file itself is cut short. Read as one
  granule per cylinder, which is what 0xCD = 0 would mean on LDOS, the
  directories still pass the hash check but have impossible extents. Only one
  DOSPLUS hard disk is known, so "a granule is a track" is measured on 3.5
  alone; we apply it to DOSPLUS 3.1-3.5 (0x31-0x35). The first two partitions
  are both named VOL-1.
- **DBLBIT:** bit 5 of FLAG2, and of GAT byte 0xCD, means each logical cylinder is
  two physical cylinders, for drives of 204 to 406 cylinders (guide, pages 33-34).
  No sample sets it. We skip such partitions.

### Partitions found

| Image | Cylinders × heads | Partitions |
|---|---|---|
| `m4-lsdos631-st251.hdv`, `hxchard-lsdos6-6part.hdv` | 840 × 6 | Six by cylinder at 0, 140, ..., 700: 140 cylinders, 6 granules of 32 sectors, directory on cylinder 70, HARDA-HARDF, LS-DOS 6.3 |
| `hxchard-ldos5-6part.hdv` | 1028 × 8 | Six by cylinder at 0, 170, ..., 850: 170 cylinders, 8 granules of 32 sectors, directory on cylinder 85, HARDA-HARDF, `DCT` media block |
| `m1-ldos531-keil.hdv` | 1024 × 8 | Eight by head, 203 cylinders each, 8 granules of 4 sectors, directory on cylinder 101, M1LDVOL1-8, LDOS 5.3 (version 0x11 header) |
| `m3-ldos531.hdv` | 203 × 4 | Four by head, otherwise the same: LDM3HDA-D |
| `m4-lsdos631.hdv` | 203 × 8 | Four by head (heads 0-3; the file ends after head 3 of cylinder 202): M4LSDOSA-D, LS-DOS 6.3 |
| `m1-dosplus35-keil.hdv` | 1024 × 8 | Six by cylinder at 0, 170, ..., 850: 170 cylinders, 8 granules of 32 sectors, directory on cylinder 85, VOL-1, VOL-1, VOL-2 to VOL-5, DOSPLUS 3.5 |
| `m1-newdos80v25.hdv`, `m3-newdos80v25.hdv`, `m3-newdos80v25-st251.hdv` | | Not read yet; see "NEWDOS/80 on hard disks" |
| `m4-mmcpm22.hdv` | | Not read yet; see "Montezuma CP/M on hard disks" |

On these 4-sector granules, BOOT/SYS's directory entry says 5 sectors but its one
extent holds one granule (4 sectors), so its file is a sector short (the usual
"fewer sectors than the size says" anomaly).

### NEWDOS/80 on hard disks (not read yet)

Measured on the three NEWDOS/80 2.5 disks in the suite and four more from the
same FreHD CD (`FreHDCD.zip`: `M1 Floppy Boot images/Newdos80-25/hard4-0`,
`M1 Quinnterface images/newdos25`, `M3 Diskless Auto Boot images/newdos3D` and
`FreHD_Self_Boot_Start_Files.zip`'s `newdos3D`). The rule below put a GAT
(version 0x82, a date, and a HIT starting `A2 C4`) exactly where predicted for
all 39 partitions on the seven. The NEWDOS/80 manual doesn't cover hard disks.

- **Partitions are by head:** each is one head, from cylinder 0 to the end of
  the disk, and every head's cylinder 0 sector 0 is a boot sector (`00 FE`, then
  the directory lump). Sectors run along the head: logical sector *n* is sector
  *n* % 32 of cylinder ⌊*n* / 32⌋ on that head.
- **The PDRIVE table** (cylinder 0, head 0, sector 2, as on floppies; see
  "PDRIVE") has a slot for each partition, recognizable by `SPT` = 32. In those
  slots:
  - byte 6 ÷ 8 is the head (0x00, 0x08, ... 0x28; 0x38 for head 7);
  - byte 5 is `GPL`, 8 on every disk;
  - **byte 3 is the sectors per granule**, not the track count it is on
    floppies: 18 on the ST251 disks, 5 for head 0 and 22 for the other heads on
    the 8-head disks;
  - byte 0 is `DDSL`, and byte 1 a lump count (187, or 103 for the 8-head disks'
    head 0), which overstates what the head holds.
- **The directory lump comes from each partition's own boot sector,** not from
  the table: on `M1 Floppy Boot images/Newdos80-25/hard4-0`, the table says 80
  for every head but heads 1-5 were formatted with 35. A lump is `GPL` × byte 3
  sectors, so lumps don't line up with tracks (lump 35 of 144-sector lumps
  starts at sector 16 of a track), which the lump model already handles.
- A slot can name a head that was never formatted: on the two Model I disks,
  slot 8 names head 7, whose first sector is 0xFF filler and which has no GAT.
  Such slots must be skipped.
- Unknown: whether the GAT holds 187 lumps (more than a floppy's), and what the
  table's other bytes (2, 7, 11, 13-15) mean on a hard disk.

### Montezuma CP/M on hard disks (not read yet)

Measured on `m4-mmcpm22.hdv` and three more images from the FreHD CD
(`M4 Floppy Boot images/MM CPM 2.2/hard4-0` and `hard4-1`, and
`M4 Diskless Auto Boot images/cpm`), all 306 cylinders × 6 heads (ST225-like):

- **The BIOS in the system cylinders holds the Disk Parameter Blocks.** The hard
  disk's is SPT=64 (128-byte records, so a track of 32 256-byte sectors),
  BSH=6 (8 KB blocks), EXM=3, DSM=915, DRM=511 (512 entries, two blocks,
  AL0 = 0xC0), CKS=0 and OFF=2; the BIOS also has a floppy DPB (SPT=36). Block
  numbers in the directory are 16-bit.
- **Two logical drives of 3 heads each,** which together fill the disk: 2 + 916
  × 8 KB / 8 KB per track = 918 tracks = 306 × 3. Drive A is heads 0-2 and drive
  B heads 3-5.
- **A drive's CP/M track *t* is cylinder *t* % 306 of head (first head + ⌊*t* /
  306⌋):** tracks run down a head, one cylinder at a time, then move to the next
  head. That puts drive A's directory (track 2) at cylinder 2, head 0, where it
  is on all three system images, and drive B's at cylinder 2, head 3, where
  there's a nearly empty directory. `hard4-1`, a data drive without a BIOS, has
  directories at both places, each holding only `BADTRACKTBL` (user 15), which
  Montezuma's formatter writes.
- Sector 7 of cylinder 1, head 0 has a copy of some directory entries
  (`HDRS5M/COM` and so on) that don't fit this layout. It isn't the directory.
- Unknown: whether other Montezuma configurations (`HDRS5M` versus `HDRS15M`,
  other drives) split heads differently. Reading the DPBs from the BIOS, rather
  than assuming 3 heads, would cover that.

## Disks worth remembering

As of October 14, 2026 the collection is 665 images: 598 DMK, 32 HFE, 13 DSK,
13 IMD, 5 JV1, 4 JV3, all with sidecars and snapshots. `model2/` holds the IMD
images, a sample of Pete's Model II archive (see its `README.md`). Of its
Model II disks all decode, though `RACM2DEV.IMD` has an empty directory. The biggest part is `peter/` (152): Ira's set
of disks that trsread and trstools couldn't read but VDISK could (see its
`README.md`). Thirteen byte-identical copies were removed when it was added,
and their names kept as aliases. `telanoc/` holds all 31 HFE images, made by
Discord user telanoc with each DOS on a Model I, III, or 4; the file names say
the DOS, sides, density, and cylinders, and the `README.md` says which boot.
`quentin/` holds disks from Quentin Barnes;
its first, `DISK-take3.dmk`, has 128-byte sectors (a CP/M-style layout, not a
TRS-80 DOS) and made 3.0.0 throw, because the GAT sector was shorter than the
lump count. `Moon Rover ... [Dual Boot].dmk` boots on both the Model I and III:
cylinder 0 has a single-density sector 0, which the Model I ROM boots, followed
by double-density sectors 1-17, of which the Model III ROM boots sector 1; the
other cylinders are single density, 10 sectors. Its file system is an empty
LDOS 5.1 data disk (directory on cylinder 20), and the game lives in raw
sectors the GAT doesn't mark as used.

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
  NEWDOS/80's. Its GAT byte 0xCB is 0x82, NEWDOS/80 v2's, and its SYS6/SYS
  banner names it NEWDOS/90 (see "Identifying the DOS").
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
- `ira/bad-crc/`: disks where our files' CRCs differed from TRSREAD's and
  VDISK's. Six were our bugs (above, and the HIT). In two the other tools are
  wrong. `AIDS Plus-II` is a double-sided DOSPLUS allocation (6 granules per
  cylinder in the GAT) imaged single-sided, so every granule on side 1 is
  missing; VDISK substitutes the next cylinder's side 0, which holds other
  files, and TRSREAD is inconsistent. On the two `High Resolution` disks,
  SYS13/SYS links to an extended entry (DEC 0x67) that is all zeros though the
  HIT still holds SYS13's hash there; both tools read the zeros as an extent
  (lump 0, granule 0) and append two sectors of the boot track.
- `ira/no-extract/`: 42 disks that TRSREAD and VDISK extracted files from and
  an older trs80-tool didn't. 2.9.1 found no OS on 13, threw on one, and found
  the wrong layout on many more; by 3.2.0 all decoded, and the FXDE hash and DMK pointer fixes
  above recovered the rest. What's left can't be read by any tool:
  `Network 3 ... v2.1.4 [Incomplete]` has noise on tracks 8 and 9;
  `SmartNet ... [84-11-xx Drive 1]` is an 80-cylinder file system imaged at 42
  cylinders, so four files run off the end; and the hacked MultiDOS's DOS/SYS
  claims 36 sectors from a 10-sector boot track, so it's read short (the
  BOOT/SYS rule now covers DOS/SYS, MultiDOS's boot file). The NEWDOS-86 and
  NEWDOS-90 system disks are named by their banners; their utility disks have
  no system files and stay NEWDOS/80 v2.0.
- `ira/DMK-Images-From-v342/`: Ira's comparison of TRSREAD, trs80-tool 3.4.2 and
  VDISK over 7,684 images: the 48 that only we couldn't read, the 6 no tool could,
  and the 2 where only our CRC differed. All 56 are byte-identical to disks already
  in the suite. Our `response.txt` there says which we now read and why the rest are
  left. Two notes from it: on `PageIt v2.0`, BASIC wrote its program the 2.3 way
  (count 42, EOF 32, ending at byte 10,528), so under the 1.3 size rule the
  directory claims a sector its extents don't hold; we read the 42 sectors there
  are, and TRSREAD and VDISK add 32 bytes of the sector after the extent. And
  `Super Utility + Copy Utility [Set 3]` keeps its directory on cylinder 3, as
  boot byte 2 says, while DIR/SYS's extent points at cylinder 17, every sector of
  which has a CRC error: copy protection, left undecoded.
- `Newclock-80 [Set 1]` and `AITech LISP v2.0 [Set 1]` (in `ira/lk-341-set-1`,
  tagged `no-boot-track`): DMK images whose track 0 has no IDAMs. Its bytes
  aren't a decodable track either: on Newclock the 1 bits are mostly 3 or 9
  apart, which fits neither FM nor MFM. The other tracks are fine. Newclock
  Set 1's tracks 1-34 hold the same sector data as `ira/newclokd`'s Set 2,
  except for the disk name and date in the GAT, so Set 2 shows what's missing:
  BOOT/SYS, and TIMESET's first granule (cylinder 0 sectors 5-9). AITech is
  LDOS 5.3 and loses BOOT/SYS and SYS0/SYS, while its 17 user files are clean.
  Both decode since October 2026, when the readers stopped requiring a boot
  track for files whose extension names the format.
- `ira/Montezuma-1.42`, `ira/Montezuma-2.32`, and `ira/QuickTerm`: Montezuma
  CP/M disks where TRSREAD's files differed from ours, and ours are right on
  all three. TRSREAD cuts files with text extensions (`.DOC`, `.ASM`, `.BUG`,
  `.NEW`) at the first Ctrl-Z and leaves the rest whole records; on 1.42 every
  difference was that cut, CRC for CRC. We now clip text files too (see
  "Clipping text files"), by content as well as extension, so our 1.42 files
  match TRSREAD's. 2.32 is a single-sided file system
  (2 reserved tracks, 85 blocks) in a double-sided image, and TRSREAD reads it
  double-sided, so all its files are scrambled. QuickTerm (342K format, OFF 4)
  matches except `WHATS.NEW`, which is damaged on the disk: its 30 records
  start with 244 bytes of junk (a Ctrl-Z run at byte 162) and stop mid-word,
  and the rest of block 32 is 0xE5. TRSREAD's cut leaves only the junk. 2.32
  also has a live entry with a blank name and extension `PRN` and no records
  (ASM run without a filename makes ` .PRN` and ` .HEX`); we count it as a bad
  entry and skip it, and TRSREAD lists it as `.PRN`.
