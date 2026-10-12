# Floppy decoding: known gaps

Things we've learned (mostly recorded in `FLOPPY_FORMATS.md`) that the code
doesn't do yet. Too small for GitHub issues, too important to lose. Check items
off by deleting them when the code catches up, and add new ones as they turn up.
Each item names the evidence disks, all in `~/mine/trs80-floppy-regress/disks`.

Last updated October 10, 2026, after merging the NEWDOS/80 work (the lump model)
into `floppy-decode`. "Where things stand" at the end has the regression results.

## Finishing the lump model

`logicalToPhysical()` now uses the single (lump, granule, sector) → linear →
(cylinder, side, sector) mapping from "The lump model" in `FLOPPY_FORMATS.md`,
for every family. Done: the linear mapping, `firstDataCylinder` (NEWDOS/80-style
candidates only), TRSDOS-family `granulesPerLump` = granules per cylinder, the
linear HIT index, and a GAT sliced to `lumpCount`. What's left:

- [ ] **One side unless proven otherwise.** The 2.3 and NEWDOS/80 generators try
      both allocation sides, and `compareTo()` breaks ties toward one side (see
      "Allocation sides are not media sides" in `FLOPPY_FORMATS.md`). So a double-sided disk with
      nothing on side 1 reads as single-sided when its GAT is full or fails the
      strict check. Reading is unaffected, but writing would never use side 1.
      When writing arrives, the LDOS line's media block and 0xCD bit 5 can
      settle it: they say one side on `willus/fractl5.dmk`, and two on
      `ldos-5.3-dsdd-80-tracks.dmk`.
- [ ] **Read the GAT's media block** (0xF5-0xFF, "\x03LSI" or "\x03631" then
      seven Drive Control Table bytes; see "What the TRSDOS 6 manuals add" in
      `FLOPPY_FORMATS.md`). It gives density, sides, sectors per track, granules
      per track, granule size, cylinders and the directory cylinder, and was
      right on all 18 disks that have it, data disks included, and on 124 of
      135 of willus's (100 of them double-sided; the others disagree with the
      decoder's side count, not with the disk). Use it as the
      first candidate's parameters, or as a score bonus for candidates that
      agree with it, like PDRIVE.
- [ ] **Directory size is tried, not read.** The 2.3-family generator tries a
      side-0 directory on double-sided disks (DOSPLUS) and a whole cylinder
      (LDOS); the NEWDOS/80 generator tries every size from 2 granules to the lump.
      Ties go to the smaller one, once fewer granules per lump haven't decided
      (that rule fixed `m2-lsdos-blank.dmk`, which used to show a 15-sector
      DIR/SYS). Reading the size would be firmer: DIR/SYS's own extent where
      there is one, or NEWDOS/80's HIT byte 0x1F (extra entry sectors beyond 8).
- [ ] **(Granule size, `GPL`) as candidate parameters for every family.** MultiDOS
      uses TRSDOS-style lumps on `MLTDOS4P.dmk` but `GPL=2` with 5-sector granules
      on its pseudo-density disks; several non-NEWDOS/80 disks (`BUSINESS`, `COMREF`,
      an Infocom loader) need 5-sector granules too.
- [ ] **Use the on-disk PDRIVE table as a hint**: try its `GPL` and `DDSL` first,
      but trust the media over its `SPT`, and its `SPT` over its `TD`.
- [ ] **The lockout table** is still read from 0x60 for `cylinderCount` bytes. On
      NEWDOS/80 there is none, and past 96 lumps that range is GAT
      (`newdos80-DSSD-80T.dmk`).
- [ ] **The report's field names** predate lumps: `dirTrack` holds the directory
      lump and `granulesPerTrack` holds granules per lump (6 on double-sided
      TRSDOS-family disks). Rename them (`dirLump`, `granulesPerLump`) with a
      one-time snapshot migration, like `migrate-geometry.mjs`, or document them.

## Gaps independent of the switch

- [ ] **The hit floor.** The `hashHits < 2` floor in `evaluate()` would reject
      a blank TRSDOS 2.3B data disk, which may have no entries at all, and a
      blank MultiDOS or UltraDOS disk, which has no BOOT/SYS. Use "≥1 hit, or a
      strict GAT pass". (`issue-1/m1-trsdos-blank.dmk` passes now that TRSDOS
      2.x's 0x2C DIR/SYS hash counts as a hit. The 1.3 blank disk,
      `m3-trsdos-blank.dmk`, has no entries, but the floor applies only to 2.3.)
- [ ] **Boot byte 2 as evidence.** It names the directory cylinder (or NEWDOS/80's
      starting lump) on all 76 decoded Model I/4 disks, but candidates don't use
      it. A score bonus, not a gate, so game disks just go without.
- [ ] **Garbage directory slots reject whole candidates.** An in-use slot with an
      unprintable name returns "can't decode directory entry filename" and a
      score of −1. Count it as a miss instead (`Abacux X ... [M3][Original].dmk`
      has 45 good hashes and 8 garbage slots). Also `willus/l808212a.dmk`
      (DOSPLUS 3.3, 26 hits) and `willus/wdhddr12.dmk` (LDOS line, 9 hits), and
      five more LOAD-80 disks like the first in willus's archive.
- [ ] **The GAT's AUTO command must be printable**, or the GAT is rejected.
      `willus/epenc2zm.dmk`, an Electric Pencil disk with 14 hits and no misses,
      fails only on that. Accept or ignore a garbage AUTO field.
- [ ] **What `nameAndVersion` still can't tell.** It reads system-file banners,
      then boot-track strings, then only the 0xCB values no other DOS has been
      seen to write, and says "Unknown DOS" otherwise (see "Identifying the
      DOS" in `FLOPPY_FORMATS.md`). On data disks: 0x21 is "TRSDOS 2.x" even when
      NEWDOS 2.1 or DoubleDOS formatted it; 0x53 is "LDOS 5.3" even when
      NEWDOS 3.0 did; LDOS 5.1/5.3 and TRSDOS 6.x get no third digit; NEWDOS/80
      data disks are "v1.0" or "v2.0" (the versions Apparat advertised), though
      0x80 also covers 1.1 and 0x82 covers 2.5; and the Kim Watt, "Not A System
      Disk:" and Planet Makruk disks are "Unknown DOS". A table of boot sector hashes, labelled from the
      banners of system disks that share them, would name most data disks
      (FORMAT writes the same boot sector on both). MultiDOS's version is never
      given: its banners and 0xCB disagree. NEWDOS/80 v2's banner gives "2.X"
      and "2/4" on some disks, and the second falls back to "v2.0".
- [ ] **`TrsdosGatInfo`'s LDOS fields are unused.** With `Trsdos14GatInfo` and
      `generateLdosCandidates()` gone and the report no longer printing them,
      `cylinderCount`, `granulesPerTrack`, `sideCount` and `density` (and the
      `isDataDisk` local in `decodeGatInfo()`) have no readers. Only `osVersion`
      (0xCB) is used, for naming. If they come back, set them only when the
      consistency test in "GAT bytes 0xCB-0xCD" passes.
- [ ] **`decodeTrsdosWithRejections()` returns `rejections: []`**, so the
      regression reports lost their rejection reasons when scoring arrived.
- [ ] **`hitNumberToDirEntry()`'s comment** describes TRSDOS 2.3's fixed system
      slots (BOOT/SYS at sector index 0, DIR/SYS at 1); 2.3B puts SYS0 there.
      The reservations also differ by DOS (16 DECs in LDOS, 16 or 2 in TRSDOS 6,
      2 in NEWDOS/80, which puts SYS14-29 in entries 2 and 3) and cover only the
      first eight directory sectors; see the table in "The HIT".
- [ ] **Protection level names** follow LDOS 5.1 and NEWDOS/80 (3 unused, 4 write)
      for the whole 2.3 family. TRSDOS 6 and LS-DOS number them like 1.3 (1
      remove, 3 write, 4 update), so their files show "UNUSED" for write.
- [ ] **File dates exist only on the LDOS line.** `decodeDirEntry()` reads
      bytes 1-2 as a date for every 2.3-family disk, but NEWDOS/80 keeps flags in
      byte 1 and zero in byte 2, and TRSDOS 2.3 has no dates.
- [ ] **File typing of system files.** On NEWDOS/80 disks DIR/SYS is reported as a
      `BasicProgram`, because the GAT's first byte is 0xFF, and zero-length files
      (`TESTDAT4` on `NEWDOS1D.dmk`) are too. That's `decodeTrs80File()`'s
      sniffing, not the DOS decoder, but it shows up in every NEWDOS/80 report.
- [ ] **A `.dmk` extension only tries the DMK reader**, while `.dsk` sniffs.
      `willus/ld1-531.dmk` is really JV1 and `willus/l808709a.dmk` JV3; about 30
      of willus's `.dmk` files are like that. Fall back to `decodeDsk()`.
- [ ] **Rename `TrsdosVersion`.** It isn't a version: it picks between the two
      on-disk layouts, the TRSDOS 2.3 family (TRSDOS 2.x, LDOS, TRSDOS 6,
      LS-DOS, DOSPLUS, NEWDOS/80, MultiDOS, VTOS) and Model III TRSDOS 1.x.
      Something like `DosFamily` with members named after the layouts rather
      than `V2_3` and `V1_3`, `Trsdos.version` to match (it's next to
      `nameAndVersion`, which really is a version), and
      `trsdosVersionToString()`, which still returns "Model I" and "Model III".
      Those were machine names in name only: the report's `os.model` field was
      dropped for it (report version 3), and the report's `rejections` entries
      still carry the same label as `model`. The `Trsdos` class itself covers
      every family, so it may want a broader name too. TRSDOS 2.7DD would be a
      third family (see "Unresolved disks").
- [ ] **`TODO` comments in `Trsdos.ts` and `FloppyDisk.ts`** (October 2026):
  - `readFile()` skips a sector it can't read, so everything after it in the
    file shifts. Fill the gap (with zeros, say) so that offsets stay right.
  - `decodeExtents()` stops at 0xFF or 0xFE, which is right when the cylinder
    byte comes first; whether TRSDOS 1.3 (granule byte first) marks the end the
    same way is unverified.
  - `decodeExtents()` has a disabled check of extent cylinders against the
    geometry's cylinders. `evaluate()` now checks extent lumps against
    `lumpCount`, so delete it.
  - `decodeGatInfo()` computes `isDataDisk` (GAT byte 0xCD bit 7) but nothing
    uses it, and it only checks 0x60 though TRSDOS 6.2 writes 0x62. The
    comment says data disks reserve two directory entries for system files
    but not which; "Reserved DECs" in `FLOPPY_FORMATS.md` says 0x00 and 0x01.
  - `FloppyDiskGeometry.advanceTrackPosition()` and `advanceSectorPosition()`
    predate the lump model and nothing calls them; delete them.
  - `getFileSectorPositions()` assumes 256-byte sectors (`BYTES_PER_SECTOR`),
    which is fine while other sizes are out of scope.
  - Cleanups: `decodeDirEntry()` repeats `isActive()`; `logicalToPhysical()`
    has a debug parameter and `getDirEntries()` a dead debugging block, both
    marked for removal; `getDirEntries()` silently drops entries that don't
    decode (see "Garbage directory slots" above); `findFile()` decodes the
    whole directory for each lookup.

## Unresolved disks

None of these blocks anything. Each disk's sidecar in the regression suite says
more.

- `ira/no-extract/SmartNet ... [84-11-xx Drive 1].dmk`: the DMK header says 42
  tracks, but the file holds a 43rd track's side 0 (cylinder 42, all 18 sectors
  with good IDs) after them. Files reach cylinder 45, so reading that track would
  recover 18 of the 156 missing sectors. Decide whether the reader should load
  whole tracks past the header's count.
- `ira/no-extract/Dot Writer ... [M4].dmk` (both): GAT byte 0xCB is 0x40 with no
  "VTOS" or "DOSPLUS" on the boot track, so the DOS is "Unknown DOS". The files
  read cleanly.

- `peter/Col 2 - 030 - No Box - No Label.dmk`: now decodes as NEWDOS/80, `GPL=2`,
  directory lump 17, with all 24 system files clean. Earlier notes said its boot
  byte names cylinder 61; reconcile that.
- `peter/52VFRED.DMK`: decodes (`GPL=8`, double-sided, 9 code files clean), but
  its GAT reads 0x25 in every used lump, which isn't a granule bitmap. No
  candidate passes the strict GAT check, so it falls back to the best score.
- Percom OS-80, OS-80 III and MicroDOS (20 disks in `peter/`, tagged `percom`,
  including four applications on Percom-formatted disks): a different DOS
  altogether (boot `FE 00` on the Model I ones), not decoded.
- Six TRSDOS 6 disks in `peter/` (`Bobby Lee (100)`, `EBAY1024`, `EBAY1035`,
  the SuperScripsit master, and both `TRSDOS Hard Disk Initialization` sets):
  cylinder 20 holds valid directory entries, but the HIT sector is a
  byte-for-byte copy of a file sector elsewhere on the disk, so no hash
  matches and nothing decodes. Ira says VDISK reads them, so a disk whose HIT
  matches nothing but whose entries all decode cleanly might deserve a
  fallback that scores the entries without the HIT.
- Tandy's TRSDOS 2.7DD (`quentin/TRSDOS v2.7DD ...`, `simple/trsdos-2.7-ssmd.dmk`,
  and its byte-identical copy `difficult/TRSDOS27-Percom-Double-Dos.DSK`, whose
  "Percom" is wrong): a third layout, mixing TRSDOS 1.3's sector numbering,
  granules, GAT and HIT with the 2.3 family's 32-byte entries and extents (see
  "TRSDOS 2.7DD" in `FLOPPY_FORMATS.md`). Neither family reads it: as 1.3 the
  GAT decodes and passes the strict check, but 1.3 expects 48-byte entries and
  "(c) 1980 Tandy" in each directory sector; as 2.3 the GAT is looked for in
  sector 0, which these tracks don't have. Do it as a third family when
  `TrsdosVersion` becomes a family (see that item). To settle then: whether the
  extent count is stored minus one, as in the 2.3 family (the directory's file
  sizes will tell), and treating cylinder 0 as 18 sectors of which only 10
  exist, as the BOOT/SYS rule in `getFileSectorPositions()` already does.

## New formats

In planned order, though HFE may come before CP/M. People on a TRS-80 Discord
asked for all of these after the 3.0.0 release.

- [ ] **More CP/M formats.** `Cpm.ts` reads Montezuma Micro CP/M 2.2 (see
      "CP/M" in `FLOPPY_FORMATS.md`); each further format is mostly a new
      entry in `CPM_FORMATS`, checked against real disks.
      - Omikron CP/M on the Model I was also requested, though it's more of a
        novelty: it needed the Omikron Mapper board, which rearranges the
        Model I's memory map so CP/M gets RAM at address 0. We have no Omikron
        disks; ask the Discord.
      - telanoc's HFE images include Lifeboat CP/M 1.4 (`m1_cpm14_ss_sd_35.hfe`),
        which needs the HFE reader first.
      - Archive listings mention 288K and 352K Montezuma disks, which match
        none of the 12 formats in the table. They may be other BIOSes'
        formats that Montezuma could read.
      - The table assumes double-sided disks alternate sides track by track.
        Other BIOSes go up side 0 and back down side 1, or use side 0 then
        side 1; add a field to `CpmFormat` when one turns up.
      - CP/M 3 date stamps (user 0x21 entries) aren't read, so files have no dates.
      - `peter/104 Elephant ... CP-M 2.2 ...` is far shorter than its header
        says (39,184 bytes of a promised 287,248), and its six tracks have no
        sectors, so there's nothing to read.
- [ ] **HFE images** (HxC Floppy Emulator, also used by Gotek drives running
      HxC or FlashFloppy firmware). One person has many. Each track is stored as
      its FM/MFM bit-cell stream, so gaps, address marks and CRCs survive. There
      is a 512-byte header (`HXCPICFE`, or `HXCHFEV3` for v3) with track and
      side counts, encoding, bit rate and RPM, then a track offset table, then
      the tracks.
      - Unlike SCP's flux timings, the bits are already clocked. So this could
        skip `decodeFlux()`'s timing step in `ScpFloppyDisk.ts` and reuse the
        clocked-bytes-to-sectors part.
      - Mixed density must work: Model I doubler disks have a single-density
        boot track.
      - The official spec is thin and v3 is documented only in the HxC source.
        MAME's `hxchfe_dsk.cpp` is a second reference.
      - We'd need some of that person's images for the suite.
- [ ] **Finish SCP.** The reader in `ScpFloppyDisk.ts` is untested (no SCP
      images in the suite). Flux transitions that are slightly out of spec
      make it hard. Three known limits:
      - It reads only one revolution (`DEFAULT_REV_NUMBER`), though SCP
        files usually hold several. The first cheap win is to try each
        revolution and keep the first copy of each sector whose CRCs pass.
      - When no revolution passes, the CRC can guide the decoding. Try
        reassigning the most ambiguous transitions (those nearest a cell
        boundary) to the neighbouring cell length until the CRC matches.
      - `guessDensity()` picks one density per track, so a mixed-density track
        (a single-density sector 0 followed by double-density sectors, as on
        Model I doubler disks and Moon Rover's dual boot) probably loses
        some of its sectors.

## Regression suite housekeeping

- [ ] The five `newdos80/` disks with PDRIVE sidecars decode to exactly their
      PDRIVE settings with every file clean, so they're ready for facts.
- [ ] `migrate-geometry.mjs` has done its job and can be deleted.
- [ ] Decide what `dirTrack` means for NEWDOS/80 (lump or cylinder) before adding
      facts for the verified NEWDOS/80 disks.

## How the lump model was verified (to repeat after the switch)

Two independent checks, both using only `readSector()` from the library:

1. **Against the old decoder.** For every file in every snapshot, re-read the
   file from its recorded `extents` through the linear mapping, and compare
   SHA-256 with the snapshot. Result: 2,284 of 2,300 identical; the 16 others
   decode cleanly under the model where the old decoder had errors.
2. **Independently, on all 276 images.** Locate the directory from the boot
   byte, decode the directory entries directly, and judge by internal
   consistency: hash hits, the strict GAT check, every CMD/SYS/BAS file decoding
   cleanly with `decodeTrs80File()`, no two files claiming the same sector, and
   every extent's granules marked in the GAT. Skip slots with unprintable names.

After the switch, check 1 was repeated through the real `Trsdos` class: build
it from each snapshot's recorded layout (`granulesPerLump` = granules per track ×
sides for TRSDOS-family disks), then `getDirEntries()` and `readFile()` every
file. Result: 2,294 of 2,300 identical, the six others all on `dospls34.dmk`.

The probe scripts (`partA.ts`, `partB2.ts`, `classA.ts` and friends) are in the
Claude Code session scratchpad, which won't survive; the descriptions above are
enough to rebuild them.

## Where things stand

October 11, 2026, after the 3.0.0 release: the regression suite has 291 disks,
every one with a sidecar and a snapshot, and all of them match (`node
regress.ts run` is all `same`). 239 decode. Most of the 52 that don't are in
`peter/`: the 20 Percom disks and the six TRSDOS 6 disks whose HIT
holds file data (see "Unresolved disks"), four with garbage directory slots
(see that item), two with damaged directories, and a truncated DMK. `node
regress.ts list` shows each disk's notes.

Against the old decoder (`floppy-decode` before the merge), compared file by
file across the whole collection, nothing got worse that wasn't wrong before:
the disks it no longer decodes were all zero-file readings, and the three that
lost clean files are double-sided allocations imaged single-sided, which now
report their side-1 sectors as missing instead of reading the wrong cylinder.
