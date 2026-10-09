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

- [ ] **Allocation sides from the DOS, never `geometry.sideCount`.** Signals, in
      order: a GAT byte with a clear bit above the single-sided granules; GAT
      byte 0xCD bit 5, but only on the LDOS line and when the byte is consistent
      (see "GAT bytes 0xCB-0xCD" in `FLOPPY_FORMATS.md`); any extent with granule
      offset ≥ granules per track. A full
      GAT gives no signal (`ldos-5.3.0-dsdd.dmk`). The 2.3 and NEWDOS
      generators all still use `geometry.sideCount`, which corrupts six files on
      each of `Cornsoft-Micro-SynthDev.dmk` and `...-newshell-bath6.dmk`:
      double-sided images used single-sided (and see `DS023.DMK` below). Trying both side
      counts as candidates may be simplest, letting the score and the GAT check
      decide.
- [ ] **Directory size from DIR/SYS's extent** (the `granulesPerDir` TODO in every
      generator, which currently uses a whole lump): 3 granules on `dospls34.dmk`
      (side 0 only), 6 on double-sided LDOS. Without DIR/SYS (TRSDOS 2.3B), try
      both and break ties toward the smaller one. This is why `dospls34.dmk` is no
      longer decoded: with 2 sides and 6 granules, the directory reaches side 1,
      where SYS10-12 live, and their bytes look like garbage entries. With 3
      granules it scores 38 and all 38 CMD/SYS files decode cleanly.
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

- [ ] **The hit floor.** The `hashHits < 2` floor in `evaluate()` rejects
      `issue-1/m1-trsdos-blank.dmk`, which has exactly one hit because TRSDOS 2.x
      writes 44 into DIR/SYS's HIT slot. Use "≥1 hit, or a strict GAT pass"; a
      blank TRSDOS 2.3B data disk may have no entries at all, and a blank 1.3 disk
      (`m3-trsdos-blank.dmk`) has none.
- [ ] **`CHECK_GAT_HIGH_BITS`.** It now gets granules per lump and checks exactly
      `lumpCount` bytes, lump 0 included (which obeys the rule on all 108 disks
      checked), so it's ready to enable: it passes all 86 real directories and
      rejects all 3,663 wrong ones. Make it a strong penalty rather than a hard
      reject, since a damaged GAT fails it
      (`Col 2 - 028 - No Box - Scripsit [T11-T12-T13 BAD].dmk`).
- [ ] **Boot byte 2 as evidence.** It names the directory cylinder (or NEWDOS's
      starting lump) on all 76 decoded Model I/4 disks, but candidates don't use
      it. A score bonus, not a gate, so game disks just go without.
- [ ] **Garbage directory slots reject whole candidates.** An in-use slot with an
      unprintable name returns "can't decode directory entry filename" and a
      score of −1. Count it as a miss instead (`Abacux X ... [M3][Original].dmk`
      has 45 good hashes and 8 garbage slots).
- [ ] **DOS naming in `getNameAndVersion()`.** 0xCB is a BCD version except for
      NEWDOS/80: 0x80 (v1) currently reports "TRSDOS 8.0" (eleven disks, e.g.
      `NEWDOS1D.dmk`, which now decodes), and 0x82 (v2) reports "NEWDOS/80" with
      an empty version, so the summary reads "NEWDOS/80  (Model I)". DOSPLUS 3.3-3.5 (0x33-0x35, boot prefix `F3 FE` or the high
      bit set on the directory byte) reports "TRSDOS 3.x". TRSDOS 2.3B writes 0
      and reports "TRSDOS 0.0"; its boot sector has the fingerprint `16 00 1E 05`
      (2.3 has `57 1E 04`).
- [ ] **`TrsdosGatInfo`'s LDOS fields are unused.** With `Trsdos14GatInfo` and
      `generateLdosCandidates()` gone and the report no longer printing them,
      `cylinderCount`, `granulesPerTrack`, `sideCount` and `density` (and the
      `isDataDisk` local in `decodeGatInfo()`) have no readers. Only `osVersion`
      (0xCB) is used, for naming. If they come back, set them only when the
      consistency test in "GAT bytes 0xCB-0xCD" passes.
- [ ] **Identify the DOS from better evidence than 0xCB**: the SYS0/SYS banner,
      then a table of boot-sector hashes, then distinctive boot messages, then
      0xCB (see "Identifying the DOS" in `FLOPPY_FORMATS.md`). This would fix the
      naming items above, and tell DOSPLUS IV (0x60) from TRSDOS 6.0.
- [ ] **`decodeTrsdosWithRejections()` returns `rejections: []`**, so the
      regression reports lost their rejection reasons when scoring arrived.
- [ ] **`hitNumberToDirEntry()`'s comment** describes TRSDOS 2.3's fixed system
      slots (BOOT/SYS at sector index 0, DIR/SYS at 1); 2.3B puts SYS0 there.
- [ ] **File typing of system files.** On NEWDOS disks DIR/SYS is reported as a
      `BasicProgram`, because the GAT's first byte is 0xFF, and zero-length files
      (`TESTDAT4` on `NEWDOS1D.dmk`) are too. That's `decodeTrs80File()`'s
      sniffing, not the DOS decoder, but it shows up in every NEWDOS report.
- [ ] **`trs80gp/LD4-631.DSK`** (LS-DOS 6.3.1, Model 4) isn't recognized as a
      floppy image at all: it used to throw "Inconsistent densities" and is now
      a `RawBinaryFile`.

## Unresolved disks

None of these blocks anything. Several now produce a decoding, but the
regression suite has no snapshots for them, so each needs checking by hand
against the layout found when the lump model was verified.

- `peter/055 - DosPlus IV Master.dmk` and its two siblings: now read as
  TRSDOS-style `GPL=2` with only 3 files; the best reading found earlier had 3 of
  14 hashes. Probably still wrong; possibly a Model 4 layout.
- `peter/Col 2 - 030 - No Box - No Label.dmk`: now decodes as NEWDOS/80, `GPL=2`,
  directory lump 17, with all 24 system files clean. Earlier notes said its boot
  byte names cylinder 61; reconcile that.
- `peter/Manufacturing and Inventory Control v3.0 ...`: now reads as NEWDOS/80
  `GPL=2`, double-sided, directory lump 140, with 1 of 13 CMD/SYS/BAS files
  failing. Its PDRIVE table says `GPL=8`, `SPT=36`, so the reading is suspect.
- `peter/52VFRED.DMK`: decodes (`GPL=8`, double-sided, 9 code files clean), but
  its GAT reads 0x25 in every used lump, which isn't a granule bitmap, so it
  will fail the strict GAT check once that's enabled.
- `peter/DS023.DMK`: decodes with NEWDOS-style `GPL=2` lumps on two sides
  (directory lump 72, 12 code files clean), although it was verified earlier as
  a TRSDOS-family disk used single-sided. Check which reading is right once
  allocation sides come from the DOS.
- Percom OS-80, OS-80 III and MicroDOS (17 disks): a different DOS altogether
  (boot `FE 00` at sector 1), not decoded.

## Regression suite housekeeping

- [ ] `disks/peter/` and `disks/planet-makruk/` are untracked, and their 172
      images have no sidecars or snapshots.
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

`node regress.ts run --ignore-rejections` after the switch, before any
`--update`: 81 same, 15 better, 4 worse, 4 changed, and 172 new (the untracked
`peter/` and `planet-makruk/` disks plus the five `newdos80/` disks, which have
no snapshots); 225 of 276 disks decode.

- **Worse (4), all items above:** the two Cornsoft SynthDev disks (allocation
  sides), `dospls34.dmk` (directory size), and `issue-1/m1-trsdos-blank.dmk`
  (the hit floor).
- **Changed (4):** three double-sided LDOS disks whose `granulesPerTrack` went
  from 3 to 6 (the report field names above), and `MLTDOS4P.dmk`, whose 90
  warnings now print sector positions in the new `cylinder:side:sector` form.
- **Better (15):** every NEWDOS disk in the snapshots now decodes cleanly:
  `NEWDOS90.dmk` (59 files; it used to find a garbage directory),
  `NEWDOS1D.dmk`, `newdos80-2.0-ssdd.dmk`, `newdos80-working.dmk`,
  `hustle_hscore_work_4-26-82.dmk`, `NEWDOS_80sssd_jv1.DSK` (no more truncated
  files) and `StarTrek-Trsdos-8.2.dsk` (22 files, up from 8). Also
  `ldos-5.3.0-ssdd-crc-boot-sector.dmk`, `ldosutil.dmk` and `trsdisk1.dmk` now
  decode, and five disks that used to throw no longer do.
- **Among the new disks,** the German NEWDOS disk (cylinder 0 single density on
  both sides), `73BFRED.DMK`, `52VFRED.DMK` and `newdos80-DSSD-80T.dmk` decode.
  39 of the 172 don't.
