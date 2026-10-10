# Floppy decoding: known gaps

Things we've learned (mostly recorded in `FLOPPY_FORMATS.md`) that the code
doesn't do yet. Too small for GitHub issues, too important to lose. Check items
off by deleting them when the code catches up, and add new ones as they turn up.
Each item names the evidence disks, all in `~/mine/trs80-floppy-regress/disks`.

Last updated October 8, 2026, after the switch to the lump model (the commit
following f7008d4). "Where things stand" at the end has the regression results.

## Finishing the lump model

`logicalToPhysical()` now uses the single (lump, granule, sector) → linear →
(cylinder, side, sector) mapping from "The lump model" in `FLOPPY_FORMATS.md`,
for every family. Done: the linear mapping, `firstDataCylinder` (NEWDOS-style
candidates only), TRSDOS-family `granulesPerLump` = granules per cylinder, the
linear HIT index, and a GAT sliced to `lumpCount`. What's left:

- [ ] **One side unless proven otherwise.** The 2.3 and NEWDOS generators try
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
- [ ] **NEWDOS directory size** (the `granulesPerDir` TODO in its generator,
      which uses a whole lump). The 2.3-family generator now tries a side-0
      directory on double-sided disks, as DOSPLUS writes (`dospls34.dmk`,
      `willus/PRODUCER.dmk`, Cornsoft-Brix `bath4`), and a whole cylinder, as
      LDOS does. NEWDOS still needs it: the German `NEWDOS-80 v2.0 ...` disk and
      `peter/2-06.dmk` have `GPL=6` GATs (bytes 0xC0, 0xCF), but the `GPL=6`
      candidate reads a whole lump (30 sectors) of directory where the real one
      is 10 or 20, hits garbage and is rejected, so they decode with smaller
      lumps instead (same directory, same files, and the German disk now has 14
      impossible extents). NEWDOS records the directory size itself, in HIT
      byte 0x1F (extra entry sectors beyond 8); use that.
- [ ] **(Granule size, `GPL`) as candidate parameters for every family.** MultiDOS
      uses TRSDOS-style lumps on `MLTDOS4P.dmk` but `GPL=2` with 5-sector granules
      on its pseudo-density disks; several non-NEWDOS disks (`BUSINESS`, `COMREF`,
      an Infocom loader) need 5-sector granules too.
- [ ] **Use the on-disk PDRIVE table as a hint**: try its `GPL` and `DDSL` first,
      but trust the media over its `SPT`, and its `SPT` over its `TD`.
- [ ] **The lockout table** is still read from 0x60 for `cylinderCount` bytes. On
      NEWDOS there is none, and past 96 lumps that range is GAT
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
- [ ] **Boot byte 2 as evidence.** It names the directory cylinder (or NEWDOS's
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
      2 in NEWDOS, which puts SYS14-29 in entries 2 and 3) and cover only the
      first eight directory sectors; see the table in "The HIT".
- [ ] **Protection level names** follow LDOS 5.1 and NEWDOS (3 unused, 4 write)
      for the whole 2.3 family. TRSDOS 6 and LS-DOS number them like 1.3 (1
      remove, 3 write, 4 update), so their files show "UNUSED" for write.
- [ ] **File dates exist only on the LDOS line.** `decodeDirEntry()` reads
      bytes 1-2 as a date for every 2.3-family disk, but NEWDOS keeps flags in
      byte 1 and zero in byte 2, and TRSDOS 2.3 has no dates.
- [ ] **File typing of system files.** On NEWDOS disks DIR/SYS is reported as a
      `BasicProgram`, because the GAT's first byte is 0xFF, and zero-length files
      (`TESTDAT4` on `NEWDOS1D.dmk`) are too. That's `decodeTrs80File()`'s
      sniffing, not the DOS decoder, but it shows up in every NEWDOS report.
- [ ] **Truncated DMKs aren't read.** `trs80gp/LD4-631.DSK` (LS-DOS 6.3.1,
      Model 4) and `willus/ND80M3V3.dmk` (NEWDOS/80) both have headers saying
      40 tracks double sided but hold 79 tracks, one short; willus's archive
      has a third (`pwrtol03`, 35 tracks, also one short). Read the tracks that
      are there instead of rejecting the file.
- [ ] **A `.dmk` extension only tries the DMK reader**, while `.dsk` sniffs.
      `willus/ld1-531.dmk` is really JV1 and `willus/l808709a.dmk` JV3; about 30
      of willus's `.dmk` files are like that. Fall back to `decodeDsk()`.

## Unresolved disks

None of these blocks anything. Several now produce a decoding, but the
regression suite has no snapshots for them, so each needs checking by hand
against the layout found when the lump model was verified.

- `peter/Col 2 - 030 - No Box - No Label.dmk`: now decodes as NEWDOS/80, `GPL=2`,
  directory lump 17, with all 24 system files clean. Earlier notes said its boot
  byte names cylinder 61; reconcile that.
- `peter/52VFRED.DMK`: decodes (`GPL=8`, double-sided, 9 code files clean), but
  its GAT reads 0x25 in every used lump, which isn't a granule bitmap. No
  candidate passes the strict GAT check, so it falls back to the best score.
- `peter/Super Dos  [VDISK OK] [IRA334].dmk`: side 1 of cylinder 17 holds a
  second directory, left over from an earlier format, with 40 entries against
  38 in the real one on side 0. Read double-sided with `GPL=2` lumps, that one
  outscores the real one, and only 8 of its 31 CMD and SYS files are CMD
  programs, against 27 read single-sided. The report calls all 40 files clean,
  because bytes that aren't a CMD program at all get no decode error.
  Preferring the directory the boot sector names would fix it.
- Percom OS-80, OS-80 III and MicroDOS (17 disks): a different DOS altogether
  (boot `FE 00` at sector 1), not decoded.

## Regression suite housekeeping

- [ ] `disks/peter/` and `disks/planet-makruk/` are untracked, and their 172
      images have no sidecars or snapshots.
- [ ] `disks/willus/` (25 disks, October 2026) has sidecars but no snapshots
      and isn't committed yet.
- [ ] The snapshots haven't been updated since the switch (see "Where things
      stand"). Their `rejections` arrays still hold the old reasons, including
      "Model 4", which no code produces any more; `--update` will clear them.
- [ ] The five `newdos80/` disks with PDRIVE sidecars have no snapshots yet. All
      five now decode to exactly their PDRIVE settings with every file clean, so
      they're ready for `--update` and for facts.
- [ ] `migrate-geometry.mjs` has done its job and can be deleted.
- [ ] Decide what `dirTrack` means for NEWDOS (lump or cylinder) before adding
      facts for the verified NEWDOS disks.

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

Latest, after trying both allocation sides (October 10, 2026), still before any
`--update`: 56 same, 16 better, 0 worse, 32 changed and 197 new; 247 of 301
disks decode. The three that were worse are fixed: the Cornsoft SynthDev disks
read single-sided again and match their snapshots apart from the name, and
`dospls34.dmk` decodes with all 38 files clean. Across the whole collection,
`PRODUCER.dmk` and Cornsoft-Brix `bath4` decode now too. Three disks that
allocate two sides but were imaged with one (`F05 - Monas Main Disk 2`, Brix
`bath3`, `willus/dwfontu8.dmk`) now report the side-1 sectors as missing,
where they used to read the wrong cylinder without complaint.

The rest of this section is the state after the switch.

`node regress.ts run --ignore-rejections` after the switch, before any
`--update`, and after accepting TRSDOS 2.x's 0x2C DIR/SYS hash: 82 same, 15
better, 3 worse, 4 changed, and 172 new (the untracked `peter/` and
`planet-makruk/` disks plus the five `newdos80/` disks, which have no
snapshots); 226 of 276 disks decode.

- **Worse (3), all items above:** the two Cornsoft SynthDev disks (allocation
  sides) and `dospls34.dmk` (directory size). `issue-1/m1-trsdos-blank.dmk`
  is back to its snapshot.
- **Changed (4):** three double-sided LDOS disks whose `granulesPerTrack` went
  from 3 to 6 (the report field names above), and `MLTDOS4P.dmk`, whose 90
  warnings now print sector positions in the new `cylinder:side:sector` form.
- **Better (15):** every NEWDOS disk in the snapshots now decodes cleanly:
  `NEWDOS90.dmk` (59 files; it used to find a garbage directory),
  `NEWDOS1D.dmk`, `newdos80-2.0-ssdd.dmk`, `newdos80-working.dmk`,
  `hustle_hscore_work_4-26-82.dmk`, `NEWDOS_80sssd_jv1.DSK` (no more truncated
  files) and `StarTrek-NEWDOS80.dsk` (22 files, up from 8). Also
  `ldos-5.3.0-ssdd-crc-boot-sector.dmk`, `ldosutil.dmk` and `trsdisk1.dmk` now
  decode, and five disks that used to throw no longer do.
- **Among the new disks,** the German NEWDOS disk (cylinder 0 single density on
  both sides), `73BFRED.DMK`, `52VFRED.DMK` and `newdos80-DSSD-80T.dmk` decode.
  39 of the 172 don't.
