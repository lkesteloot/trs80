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
      Ties go to the smaller one, which on Model II's 30-sector tracks lets
      six 5-sector NEWDOS/80 granules beat three 10-sector ones
      (`m2-lsdos-blank.dmk`, which then shows a 15-sector DIR/SYS). Reading the
      size would be firmer: DIR/SYS's own extent where there is one, or NEWDOS/80's
      HIT byte 0x1F (extra entry sectors beyond 8).
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
- [ ] **What `getNameAndVersion()` still gets wrong.** It now maps 0xCB to
      NEWDOS/80 1 and 2, VTOS 3.0, DOSPLUS 3.1-4.0 and TRSDOS 2.x (0x21), and
      recognizes MultiDOS and UltraDOS by strings in the boot track, DOSPLUS IV
      the same way when 0xCB is 0x60, and TRSDOS 2.3B by its boot fingerprint.
      Still wrong, all needing the SYS0 banner or other evidence: NEWDOS 2.1 and
      `NEWDOSPL.dmk` ("TRSDOS 2.x"), NEWDOS 3.0 (`newdos30.dmk`, `NEWDOS-3.dmk`,
      "LDOS 5.3"), the 1.2 disks ("TRSDOS 1.3"), MultiDOS v1.2P ("LDOS 5.5"; no
      boot string), and `trsdos-6.2-ssdd-crc-weird-version.dmk`, whose 0xCB of
      0x35 makes it "DOSPLUS 3.5" although its media block says TRSDOS 6.2.
      Unverified: 0x22 and 0x50 on Kim Watt's utility disks, 0x16 on two disks,
      and 0x00 on the Planet Makruk disks. Wrong, found in willus's archive:
      0x40 is VTOS 4.0 too (`willus/vtos40.dmk`, `vtos401a.dmk`), not just
      DOSPLUS 4.0; DOSPLUS IV system disks don't always say "DOSPLUS" in the
      boot track (`willus/dp4bare.dmk` is "TRSDOS 6.0"; the SYS0 banner says
      DOSPLUS IV); MultiDOS 1.5 writes "(c) 1982 C.E.C." (`willus/MDOS15.dmk`, "TRSDOS
      0.0"); `willus/rapds13.dmk` is RAPIDOS ("TRSDOS 6.0"); and 0x32 is real
      DOSPLUS 3.2 only with DOSPLUS's `F3 FE` boot sector
      (`willus/dsp1321a.dmk`). The other 0x32 disks, all six of ours, share a
      boot sector that says "Not A System Disk:" and isn't DOSPLUS's; the same
      formatter also writes 0x34.
- [ ] **`TrsdosGatInfo`'s LDOS fields are unused.** With `Trsdos14GatInfo` and
      `generateLdosCandidates()` gone and the report no longer printing them,
      `cylinderCount`, `granulesPerTrack`, `sideCount` and `density` (and the
      `isDataDisk` local in `decodeGatInfo()`) have no readers. Only `osVersion`
      (0xCB) is used, for naming. If they come back, set them only when the
      consistency test in "GAT bytes 0xCB-0xCD" passes.
- [ ] **Identify the DOS from better evidence than 0xCB**: the SYS0/SYS banner,
      then a table of boot-sector hashes, then distinctive boot messages, then
      0xCB (see "Identifying the DOS" in `FLOPPY_FORMATS.md`). This would fix the
      naming item above. On TRSDOS
      6 and LS-DOS, the system information sector's version byte and the media
      block's "LSI" or "631" tag help too. `trsdos-1.2.dmk` reports 1.3.
      TRSDOS 2.x's SYS0 banner is stored negated, so a banner search must try
      that form too.
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
- [ ] **Truncated DMKs aren't read.** `trs80gp/LD4-631.DSK` (LS-DOS 6.3.1,
      Model 4) and `willus/ND80M3V3.dmk` (NEWDOS/80) both have headers saying
      40 tracks double sided but hold 79 tracks, one short; willus's archive
      has a third (`pwrtol03`, 35 tracks, also one short). Read the tracks that
      are there instead of rejecting the file. `peter/104 Elephant ... CP-M
      2.2 ...` is far shorter (39,184 bytes of a promised 287,248), and CP/M
      anyway.
- [ ] **A `.dmk` extension only tries the DMK reader**, while `.dsk` sniffs.
      `willus/ld1-531.dmk` is really JV1 and `willus/l808709a.dmk` JV3; about 30
      of willus's `.dmk` files are like that. Fall back to `decodeDsk()`.
- [ ] **Rename `TrsdosVersion`.** It isn't a version: it picks between the two
      on-disk layouts, the TRSDOS 2.3 family (TRSDOS 2.x, LDOS, TRSDOS 6,
      LS-DOS, DOSPLUS, NEWDOS/80, MultiDOS, VTOS) and Model III TRSDOS 1.x.
      Something like `DosFamily` with members named after the layouts rather
      than `V2_3` and `V1_3`, `Trsdos.version` to match (it's next to
      `getNameAndVersion()`, which really is a version), and
      `trsdosVersionToString()`, which still returns "Model I" and "Model III".
      Those were machine names in name only: the report's `os.model` field was
      dropped for it (report version 3), and the report's `rejections` entries
      still carry the same label as `model`. The `Trsdos` class itself covers
      every family, so it may want a broader name too.

## Unresolved disks

None of these blocks anything. Each disk's sidecar in the regression suite says
more.

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

October 10, 2026, after merging `newdos80` into `floppy-decode`: the regression
suite has 288 disks, every one with a sidecar and a snapshot, and all of them
match (`node regress.ts run` is all `same`). 238 decode. Most of the 50 that
don't are in `peter/`: the 20 Percom disks and the six TRSDOS 6 disks whose HIT
holds file data (see "Unresolved disks"), four with garbage directory slots
(see that item), two with damaged directories, and a truncated DMK. `node
regress.ts list` shows each disk's notes.

Against the old decoder (`floppy-decode` before the merge), compared file by
file across the whole collection, nothing got worse that wasn't wrong before:
the disks it no longer decodes were all zero-file readings, and the three that
lost clean files are double-sided allocations imaged single-sided, which now
report their side-1 sectors as missing instead of reading the wrong cylinder.
