# Floppy decoding: known gaps

Things we've learned (mostly recorded in `FLOPPY_FORMATS.md`) that the code
doesn't do yet. Too small for GitHub issues, too important to lose. Check items
off by deleting them when the code catches up, and add new ones as they turn up.
Each item names the evidence disks, all in `~/mine/trs80-floppy-regress/disks`.

An item marked **Decided** records a choice rather than unfinished work, and says why. Revisit it when
someone asks for it, or when the reason no longer holds.

Last updated November 12, 2026. "Where things stand" at the end has the regression results.

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
      The write gate now takes a one-side reading of a two-sided image as proven on the
      LDOS line when the GAT's 0xCD bit 5 says one side (`gatProvesSides()`), and no
      LDOS-line disk in the suite is read as one side against a GAT that says two. What's
      left is the other DOSes, whose 0xCD isn't reliable (DOSPLUS, MultiDOS, NEWDOS/80,
      RapiDOS, VTOS, TRSDOS 2.x), and the media block (next item) as a second opinion for
      TRSDOS 6 and LS-DOS. 12 two-sided images remain `SIDES_UNPROVEN` for those reasons.
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
      (LDOS); the NEWDOS/80 generator tries every size from 2 granules to the lump,
      plus one larger size if the HIT asks for it (byte 0x1F, or its highest
      column in use; see "HIT sector" in `FLOPPY_FORMATS.md`). Among candidates that tie on the
      score, the one whose directory is exactly DIR/SYS's extent sorts first
      (`Trsdos.dirSysConfirmsSize`), so two-sided LDOS-line disks read as a whole-cylinder
      directory and the gate's `DIRECTORY_SIZE_UNPROVEN` no longer fires on any disk in the
      suite. What's left: a disk without DIR/SYS in its directory, or whose DIR/SYS disagrees
      with the HIT, still falls back to "ties go to the smaller one" (which fixed
      `m2-lsdos-blank.dmk`'s 15-sector DIR/SYS before), and `peter/TRS-80 Format [Set 1]` lists
      files past what 0x1F says, so the HIT alone isn't firm either.
- [ ] **(Granule size, `GPL`) as candidate parameters for every family.** MultiDOS
      uses TRSDOS-style lumps on `MLTDOS4P.dmk` but `GPL=2` with 5-sector granules
      on its pseudo-density disks; several non-NEWDOS/80 disks (`BUSINESS`, `COMREF`,
      an Infocom loader) need 5-sector granules too.
- [ ] **Use the on-disk PDRIVE table as a hint**: try its `GPL` and `DDSL` first,
      but trust the media over its `SPT`, and its `SPT` over its `TD`.
      `readPdriveTable()` (`Pdrive.ts`) reads it now, though only for display.
- [ ] **The lump count follows the image, not the file system.** `lumpCount` comes from
      the image's cylinder count, so an 80-cylinder image of a 40-cylinder disk decodes
      with 80 lumps. The 2.3-family formatters mark the GAT bytes past the disk's end as
      used with no owner, which `trim` uses to find the end; GAT byte 0xCC on the LDOS
      line and the media block record it outright. TRSDOS 1.3 has no such marker.
- [ ] **The lockout table** is still read from 0x60 for `cylinderCount` bytes. On
      NEWDOS/80 there is none, and past 96 lumps that range is GAT
      (`newdos80-DSSD-80T.dmk`).
- [ ] **The report's field names** predate lumps: `dirTrack` holds the directory
      lump and `granulesPerTrack` holds granules per lump (6 on double-sided
      TRSDOS-family disks). Rename them (`dirLump`, `granulesPerLump`) with a
      one-time snapshot migration, like `migrate-geometry.mjs`, or document them.

## Gaps independent of the switch

- [ ] **Programs that run past their EOF byte: what `check` misses.** `check`
      notes them and `repair --fix-program-sizes` fixes them (see "Programs
      that run past their EOF byte" in FLOPPY_FORMATS.md); `extract` still
      clips them to the directory's size, on purpose. Left over:
      - The entry-point test (inside a load block) skips programs that
        transfer to a DOS or ROM address, such as `PASLIB/V22` on
        `ira/lk-410-crazy-errors/Small C v2.1 ... [Disk 2 of 4].dmk`, which
        transfers to 0x402D (the DOS's return) and is 14 bytes past its size.
        Allowing known DOS entry points would catch it.
      - About 25 programs in the suite read as truncated and don't come out
        clean even with the rest of their last sector (`DRAGON/CMD` and others
        on `peter/F05 - Monas Main Disk 2.dmk`, the Post Man files on
        `ira/lk-341-set-1`, `FASTER/CMD`), so they're something else.
      - `repair` can't run on NEWDOS 2.1 disks or disks whose DOS is unknown,
        so it can't fix their programs (the NEWDOS 2.1 FORMAT/CMD and
        SYS0-SYS2/SYS, and LISP Set 3).

- [ ] **TRSDOS 2.x's extended entries (FXDEs) have an unknown HIT byte.** On
      LDOS, TRSDOS 6 and DOSPLUS disks an FXDE's HIT byte is its primary's name
      hash, but not on the TRSDOS 2.x disks that have FXDEs (see "An FXDE" in
      FLOPPY_FORMATS.md). Until it's known, `TrsdosWriter.addFile()` refuses a
      file that would need one under TRSDOS 2.x rules. A real TRSDOS 2.3 does
      write the primary's hash (measured in trs80gp; see "An FXDE" in
      FLOPPY_FORMATS.md), so the refusal could be lifted for 2.3 once `check` and
      `repair` agree and the disks with other HIT bytes are explained.
      Users see it as a refusal to add (or rename) a file on a TRSDOS 2.x disk
      when free space is so fragmented that the file needs more than 4 extents
      (a run of up to 32 granules is one extent, so contiguous files never do).
      To lift it for 2.3: write the primary's hash in each FXDE's HIT byte, make
      `check` and `repair` expect that under TRSDOS 2.x rules, and test our FXDEs
      under real TRSDOS 2.3 (DIR, COPY, KILL) as was done for LDOS 5.3.1 and
      LS-DOS 6.3.1. The other 2.x versions stay refused until their disks are
      explained.
- [ ] **TRSDOS 1.x entries with bit 7 set read as orphaned extended entries.**
      `TrsdosDirEntry.isExtendedEntry()` tests bit 7 of byte 0, but 1.3's
      directory has no extended entries and calls that bit unused. Entries with
      the bit set, a good name and valid extents are on about 18 disks (the
      `Network 3` and other `no-extract` disks, `Computer Talk`), so the decoder
      drops real files (PB/ORG, EDIR/CMD, KILL/CMD) and `check` calls them
      orphans, which keeps those disks repair-only. `TrsdosWriter.repair()` leaves
      such entries alone for that reason. Treating bit 7 as plain data on the
      1.3 layout, in `decodeDirEntry()`, would list the files and clear the
      findings.
- [ ] **Stray sector IDs inflate `TrackGeometry`'s range.** Its first/last
      sector numbers include stray IDs (copy protection writes a few sectors
      numbered far outside the track's numbering, e.g. 124-126 on a 0-9 track,
      or 255 on a 0-17 track). `sectors` uses the expected range
      (`getExpectedSectorRange()`) instead, but decoding still sees the raw one
      in two places: `cylinder0Differs`, which makes NEWDOS/80 candidates skip
      cylinder 0, and the BOOT/SYS filter in `Trsdos.ts`, which drops sectors
      past the end of a short boot track. Neither hurts any disk in the suite:
      the stray IDs turn on `cylinder0Differs` for 42 disks (VTOS, Talking
      Adventure, Tic-Toc-80, Purge Master), none of them NEWDOS/80. An
      experiment in October 2026 that made first/last the core range changed
      no decoding on any disk, and made the geometry worse on
      `difficult/ORGADV1M.DMK` (boot sector 0 became 111) and the two
      `super-utility` disks (41 sectors per track became 1), so leave it
      until a disk needs it. `info`'s verbose "sectors X to Y" and
      `info --json`'s per-track `firstSector`/`lastSector` also show the raw
      range.
- [ ] **Images made by stepping an 80-track drive once per track** of a 40-track
      disk. `Make-80 v1.2 [M1][Set 2][Disk 1 of 2]` has 70 tracks, track 2*n*
      holding cylinder *n* and the odd tracks noise, so the DOS isn't
      identified and one file is found. A
      reader could notice that the even tracks' IDs say half their track number
      and read only those, as a real 40-track drive would (NEWDOS/80's PDRIVE
      has a flag for the opposite case, a 40-track disk in an 80-track drive
      stepping twice). One disk so far.
- [ ] **`sectors --bad` doesn't say when a sector is outside the file system.**
      Most of what `ira/odderrors-420/` still reports is on cylinders past the
      DOS's own (past GAT byte 0xCC + 35, or CP/M's tracks), where "There is no
      file at this sector" is true but doesn't say that the DOS never uses that
      cylinder. `FloppyFileSystem` could expose its cylinder count, and
      `sectors` could say "outside the file system" there, or list those
      cylinders apart. Similarly, "missing" covers both a sector with no ID
      and an ID with no data mark after it.
- [ ] **The hit floor.** The `hashHits < 2` floor in `evaluate()` would reject
      a blank TRSDOS 2.3B data disk, which may have no entries at all, and a
      blank MultiDOS or UltraDOS disk, which has no BOOT/SYS. Use "≥1 hit, or a
      strict GAT pass". (`issue-1/m1-trsdos-blank.dmk` passes now that TRSDOS
      2.x's 0x2C DIR/SYS hash counts as a hit. The 1.3 blank disk,
      `m3-trsdos-blank.dmk`, has no entries, but the floor applies only to 2.3.)
- [ ] **Boot byte 2 as evidence.** It names the directory cylinder (or NEWDOS/80's
      starting lump) on all 76 decoded Model I/4 disks. Candidates use it only to
      accept a DIR/SYS that points elsewhere (`Super Utility [Set 3]`, see
      "Cylinders, sides, and allocation" in `FLOPPY_FORMATS.md`). A score bonus,
      not a gate, would help 1.3 and 2.3B directories, which have no DIR/SYS, so
      game disks just go without.
- [ ] **Garbage directory slots reject whole candidates.** An in-use slot with an
      unprintable name returns "can't decode directory entry filename" and a
      score of −1. Count it as a miss instead (`Abacux X ... [M3][Original].dmk`
      has 45 good hashes and 8 garbage slots). Also `willus/l808212a.dmk`
      (DOSPLUS 3.3, 26 hits) and `willus/wdhddr12.dmk` (LDOS line, 9 hits), and
      five more LOAD-80 disks like the first in willus's archive.
- [ ] **Intact files whose extents are shorter than their size.** About 30 files
      have fewer sectors in their extents than `getSize()` needs, so `readFile()`
      clips them. That's why file damage doesn't include this check. Groups:
      - **TRSDOS 1.x, one sector short:** BASIC programs that decode cleanly
        (`PageIt v2.0 ...[M3].dmk`, `Education Demo VS v1.0 ...[M3]...dmk`, the
        `Network 3 Student` disks). Maybe the last-sector byte counts as it does
        on 2.3 on some 1.x versions; see `getSize()`.
      - **Copy-protected originals:** STELLAR/CMD is 104 of 116 sectors on all
        three `Stellar Escort` sets, and DEFENSE/CMD and WEERD/CMD look similar.
      - **System files:** DIR/SYS on `telanoc/model1/m1_ld53_ds_dd_40_system.hfe`
        (12 of 18), SYSRES/SYS on the MultiDOS 1.7P disks (10 of 20).
      - **Sizes in the tens of thousands of sectors:** EDIT/BOL on
        `simple/MLTDOS4P.dmk` and BACKUP/CMD on `simple/MULTIDOS.dmk`. Probably a
        MultiDOS size field we read wrong.
- [ ] **Files with no extension leave the disk without one.** `extract`, the web
      app's ZIP export and its Import button use the DOS's name as is, so a BASIC
      program named `MAZE` (TRSDOS) or `MENU` (MicroDOS, which has no extensions at
      all) arrives on the host as `MAZE` and `MENU`. Listings should keep the disk's
      names, but files written to the host could get an extension from their
      decoded contents (`getTrs80FileExtension()` already does that for cassettes),
      for every file system at once.
- [ ] **What `dosName` still can't tell.** It reads system-file banners,
      then boot-track strings, then 0xCB with the boot sector, the system sector
      and FORMAT's BOOT/SYS and DIR/SYS passwords, and says "Unknown DOS"
      otherwise (see "Identifying the DOS" and "Boot sector code by DOS" in
      `FLOPPY_FORMATS.md`, which also lists the rules of Ira's that we tried and
      didn't use). On data disks: 0x21 is "TRSDOS 2.x" unless the boot sector is
      the 2.2 or 2.3 FORMAT's, though TRSDOS 2.0, 2.1, NEWDOS 2.1, NEWDOS 3.0 and
      DoubleDOS also write it; 0x53 with TRSDOS 2.x's boot sector is "NEWDOS 3.0"
      after the system on cylinder 0, though NEWDOS 3.0's FORMAT writes 0x21, and
      what wrote the 0x53 is unknown; LDOS 5.0 and VTOS 4.0 get no third digit,
      5.3.0 can't be told from a 5.3.1 disk with 5.3.0's passwords, and the third
      digit names the formatter, not the system later used; TRSDOS 6.02.00 and
      6.02.01 write the same data disk, as NEWDOS/80 2.0, 2.5 and 2.74 do; 0x80
      is "NEWDOS/80 v1.0", and there was no 1.1 (Ira on #27: the two disks whose
      banner says "Version 1.1" are 1.0 with DoubleZap 1.1, so they're named v1.0);
      Super Utility+'s data disks are named by its version, not a DOS (see
      "Super Utility+" in `FLOPPY_FORMATS.md`); and Kim Watt's 0x50 and the
      Planet Makruk disks are "Unknown DOS". NEWDOS/80 v2's banner gives "2.X"
      and "2/4" on some disks, and the second falls back to "v2.0, v2.5 or v2.74"; Ira
      suggests matching their system files' CRC-32s against the File Manifests
      of each NEWDOS/80 release group (2.0 and 2.5 differ in SYS0, SYS3, SYS16,
      SYS17, SYS21 and the utilities).
- [ ] **What #53 left out of the names.** Done there: TRSDOS 1.x releases from the GAT
      and HIT, TRSDOS 2.7 and 2.8 from the boot sector, UltraDOS, VTOS 3.0, DoubleDOS,
      RAPIDOS and MultiDOS II. Left, each with its reason in "Boot sector code by DOS" in
      `FLOPPY_FORMATS.md`: G-DOS's and H-DOS's versions (2.1b and 2.3c by Ira; not in our
      G-DOS disk's files), NEWDOS/80 2.1b by the directory cylinder, HIT 0-1 `A2 C4` as
      TRSDOS 1.5, and MultiDOS by HIT bytes. Declined: naming the formatter and the system
      separately, and the "(bare data disk)" and model qualifiers. Percom OS-80 III needs
      a directory decoder first (see "Percom disks with no directory").
- [ ] **Ira's naming rules that no disk of ours exercises** (see "What each
      FORMAT writes, from Ira's bare disks" in `FLOPPY_FORMATS.md`): MultiDOS
      1.0's Model I boot sector (1.0 or 1.2D by the GAT's data mark), the 1.0-1.4
      stub (0x50 at 0xCB, or DIR/SYS's bytes 1-2), the 4.01 stub's FORMAT
      passwords (`A8 00 00 00`), the MultiDOS DIR/SYS passwords that no disk of
      ours has, the TRSDOS 6.01.01 stub, DOSPLUS's fill byte by version, and
      HIT byte 1 = 0xC4 with 0x21 (NEWDOS+ 2.2 or 3.0, but see "What didn't hold
      up"), and TRSDOS 1.4's 0xFF at HIT byte 0xC0 and GRL 1.5's `F2 92` master
      password, TRSDOS 2.7's and 2.8's data-disk stub, UltraDOS 4.2's data-disk boot
      sector, DoubleDOS's FORMAT stub, RAPIDOS's Model III stub and "1.3 or 1.5" from 0x60,
      and DOSPLUS from 0x40 with `96 42` (all in the code, from Ira's bytes). Add disks when
      they turn up.
- [ ] **Our TRSDOS 2.3 data disks have the system disk's boot sector.** The
      formatter's template is TRSDOS 2.3's system boot sector, with 0xE1 at 0x7D,
      but 2.3's FORMAT writes 0xB6 there (Ira, and `issue-1/m1-trsdos-blank.dmk`),
      so our disks aren't what 2.3's FORMAT makes, and decode as "TRSDOS 2.x"
      rather than "TRSDOS 2.2 or 2.3". Taking the template from a 2.3 FORMAT's disk
      would fix both, if its boot code also works on disks we write.
- [ ] **A "MULTIDOS" fill in a system file still makes a MultiDOS banner.** The
      boot track's runs of "MULTIDOS" are ignored, but the banner fallback
      (`/MULTIDOS|Cosmopolitan Electronics/`) searches every system file,
      including BOOT/SYS, which covers the boot track on some disks. No disk of
      ours is named wrongly by it now.
- [ ] **`TrsdosGatInfo`'s LDOS fields are unused.** With `Trsdos14GatInfo` and
      `generateLdosCandidates()` gone and the report no longer printing them,
      `cylinderCount`, `granulesPerTrack`, `sideCount` and `density` (and the
      `isDataDisk` local in `decodeGatInfo()`) have no readers. Only `osVersion`
      (0xCB) is used, for naming. If they come back, set them only when the
      consistency test in "GAT bytes 0xCB-0xCD" passes.
- [ ] **`hitNumberToDirEntry()`'s comment** describes TRSDOS 2.3's fixed system
      slots (BOOT/SYS at sector index 0, DIR/SYS at 1); 2.3B puts SYS0 there.
      The reservations also differ by DOS (16 DECs in LDOS, 16 or 2 in TRSDOS 6,
      2 in NEWDOS/80, which puts SYS14-29 in entries 2 and 3) and cover only the
      first eight directory sectors; see the table in "The HIT".
- [ ] **TRSDOS 2.7's system-file table** (HIT 0xD0-0xFF, 24 two-byte slots:
      cylinder in byte 1, starting granule in bits 7-5 of byte 0 and a count of
      *sectors* in bits 4-0; Ira Goldklang's disk format reference, "Item 23") isn't
      decoded, so the DOS's own system files look like used but unclaimed granules.
      Because of that the writer refuses `repair --free-unclaimed` on 2.7 disks
      (it would free them). Decoding the table as 1.3's is decoded
      (`getTrsdos13SystemFiles()`) would let that work, and would list the files.
      Note that one count on 2.7SD is wrong (slot 9 runs 7 sectors into slot 11).
- [ ] **TRSDOS 2.7's extended directory entries.** The entries have the 2.3
      family's FE link at bytes 30-31, and the DOS's KILL follows it, but none of
      the 24 2.7-layout disks has a file with more than one extent, let alone an
      FXDE, so we don't know what 2.7 writes in one. The writer refuses a file
      that would need one (more than four extents) and won't rename or repair
      one. A disk made by the DOS with a fragmented big file would settle it.
- [ ] **Writing NEWDOS/80: what's left.** The writer covers version 2 disks, and version 1.0 disks that are single
      density and single sided (see "Writing NEWDOS/80" in FLOPPY_FORMATS.md). Not written:
      - Version 1.0 disks in other layouts: double density (DoubleZap and other patches; double-sided double density
        uses a different sector order), and single density on two sides, which no disk in the collection shows.
      - The DOS's directory slot choice when the hash's sector is full. The writer matches its first choice (see
        "Where a new file goes" in FLOPPY_FORMATS.md) and then takes the lowest free slot; the DOS goes one, two or
        five sectors on, in about equal numbers on our disks. A test disk from Ira would settle it: on a freshly
        formatted 8-sector data disk, save nine or more small files whose names hash to the same sector (we can
        supply the names), then a few that hash to the sectors after it, imaging after each save, so that where
        each overflowing file lands, and whether it depends on what's free nearby, can be read off. The same for
        a file big enough to need an extended entry would show where FXDEs go.
      - NEWDOS 2.x (18%), VTOS (16%) and NEWDOS/90 (15%) put files in their hash's sector a little more often than
        chance; worth a look if their writers are added.
      - Version 3.0 (its own Model III boot sector): a different release that we haven't studied.
      - Disks of more than 96 lumps with no PDRIVE table whose GAT doesn't prove its own size (see "More than 96
        lumps with no table" in FLOPPY_FORMATS.md): a last lump that's full, or lumps 0-95 that also fit the
        existence-table pattern. None in the collection.
      - GATs whose existence table is all 0xFF while lumps are free (ten Infocom-style disks in `disks/peter/`). The
        writer refuses them as inconsistent, but NEWDOS/80's DIRCHECK takes GAT byte 0x60 = 0xFF to mean there's no
        existence table at all (manual PDF page 117), so they may well be writable. **Decided** (November 2026):
        keep refusing them until someone asks. Nothing we have shows NEWDOS/80 itself writing to such a disk.
      - Creating and formatting NEWDOS/80 disks (`create`, `format`): we have no NEWDOS/80 boot sector to write.
      - The other NEWDOSes (NEWDOS/86, NEWDOS/90, NEWDOS+), and the German G-DOS and H-DOS.
- [ ] **Writing MultiDOS: what's left.** The writer covers 1.x and 2.00 (see "Writing MultiDOS" in
      FLOPPY_FORMATS.md). Not written:
      - 2.10 and 4.01 on (about 57 suite disks). What's needed, in order:
        1. Decode their entries. 2.10's access password bytes (18-19) hold a big-endian time stamp in LDOS 5.3's
           form; 4.01 on keep the access password in bytes 1-2 and the date in bytes 16-19. The decoder reads
           neither: 4.01's files show the blank hash as 08/06/1982 and its system files as month 15.
        2. Tell which release wrote each entry, since a later release's file can be copied to an earlier disk.
           That would also let `attrib` set passwords and dates on 1.x disks. **Decided** (November 2026): until
           then it refuses them, since an entry a later release wrote keeps its date and password in each
           other's bytes, and overwriting them would corrupt it.
        3. Measure the rest on those disks as for 1.x: new entries' bytes, the system files' DECs, the GAT's
           0xCC/0xCD form, and what KILL leaves.
        4. Then a rule set for them, or a variant of MULTIDOS.
      - Disks with a volume on each side (`SI=2`): none is in the collection, so the second volume isn't read
        either. The writer refuses a two-sided image that allocates one side, or whose side-1 IDs say side 0.
      - GATs whose 0xCC and 0xCD describe more cylinders than the image (two 1.71 disks of 35 cylinders whose GAT
        says 40, a 1.3P disk), or no layout at all (1.5K's `DD DD`, 1.3a's `28 45`). An image with cylinders past
        the GAT's end is written only when they're provably empty, which leaves out the two 1.7D disks whose
        cylinder 40 holds an earlier format's data, and `Boss`, whose GAT reads as 18 cylinders of 40.
      - Extended entries (one disk has one), and the AUTO command, whose leading `#` or `!` we haven't worked out.
        **Decided** (November 2026): both stay refused until a disk or the manual shows what MultiDOS writes.
      - A MultiDOS disk with no version (`Bright-412` is 2.0 by its label but has no banner or stub that says so),
        MultiDOS II, and the "MultiDOS or Esoteric" disks.
      - Creating and formatting MultiDOS disks: #28 gives 1.0's FORMAT track layout (FM `0 5 1 6 2 7 3 8 4 9`,
        MFM 3:1 with a 5-sector skew, `MULTIDOS` fill), but we have no MultiDOS boot sector to write.
- [ ] **Protection level names on TRSDOS 1.3 and 2.7** are TRSDOS 6's (1
      remove, 3 write, 4 update), which comes from 1.3 being Model II
      TRSDOS's descendant, not from a manual: the TRSDOS 1.3 Reference Guide
      (PDF page 5) lists the ATTRIB levels as EXEC, READ, WRITE, NAME, KILL,
      FULL, which are LDOS 5.1's names, without numbers. Check against the
      resident's own table (*Model III TRSDOS Commented*, the access-level code
      near 475C) or a disk with files at each level. Also NEWDOS/80 names 7 LOCK
      (see "Protection level names" in `FLOPPY_FORMATS.md`), which we show as
      NO_ACCESS.
- [ ] **File dates exist only on the LDOS line.** `decodeDirEntry()` reads
      bytes 1-2 as a date for every 2.3-family disk, but NEWDOS/80 keeps flags in
      byte 1 and zero in byte 2, and TRSDOS 2.3 has no dates.
- [ ] **LDOS 5.3 and LS-DOS 6.3 time stamps that fail the checks.** On a few
      LDOS 5.3.1 and LS-DOS 6.3.1 system disks the same few files (system files,
      which now get no date, and BACKUP/CMD) share one value in bytes 18-19 that
      reads as a plausible time but a year one off from byte 2's
      (0x2673 on `simple/trs80gp/LD3-531.DSK` and both `telanoc/model3/m3_ld53_*_system.hfe`,
      0x6BA3 on `telanoc/model1/m1_ld53_ds_sd_40_sys-no-sole.hfe`, 0x0A45 on
      `telanoc/model4/m4_ld63_ss_dd_40_system.hfe`), so they're kept as passwords
      (see "Time stamps (LDOS 5.3 and LS-DOS 6.3)" in `FLOPPY_FORMATS.md`). Booting one of these in
      an emulator and running `DIR (A)` would show whether the DOS prints a time.
- [ ] **TRSDOS 1.3 system files** (see "TRSDOS 1.3 system files" in
      `FLOPPY_FORMATS.md`):
  - SYS0/SYS starts with the boot sector, since that's what slot 0's extent
    covers. Splitting it into BOOT/SYS and SYS0/SYS would read better, but the
    DOS doesn't name either.
  - A system file's size is its whole extent. Ending each module at its
    transfer record would drop the slack, such as SYS3's second granule on the
    CP-500 disks, where clipping at the directory leaves two.
  - Slots whose granules hold only format filler are still listed (13 on
    `difficult/trsdisk1.dmk`). The GAT can't rule them out, because
    `CP-500 DOS500 ... [Disk 1 of 2]` marks every system granule free;
    a check that the first sector starts a load module could.
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
      Something like `TrsdosLayout` (not `DosFamily`, which is now the DOS's
      family) with members named after the layouts rather than `V2_3` and
      `V1_3`, `Trsdos.version` to match (it's next to `dosName`, which really
      has versions), and
      `trsdosVersionToString()`, which still returns "Model I" and "Model III".
      Those were machine names in name only: the report's `os.model` field was
      dropped for it (report version 3). The `Trsdos` class itself covers
      every family, so it may want a broader name too. `V2_7` (Tandy's Model I
      TRSDOS 2.7DD/2.8) is now the third layout, so the enum has three members.
- [ ] **`TODO` comments in `Trsdos.ts` and `FloppyDisk.ts`** (October 2026):
  - `readFile()` skips a sector it can't read, so everything after it in the
    file shifts. Fill the gap (with zeros, say) so that offsets stay right.
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
    which is fine: `decodeTrsdos()` rejects disks whose data sectors are any
    other size, since that took a Xenix file system disk (512-byte sectors) as
    NEWDOS/80.
  - Cleanups: `decodeDirEntry()` repeats `isActive()`; `logicalToPhysical()`
    has a debug parameter and `getDirEntries()` a dead debugging block, both
    marked for removal; `getDirEntries()` silently drops entries that don't
    decode (see "Garbage directory slots" above); `findFile()` decodes the
    whole directory for each lookup.
- [ ] **The "date not set" bit.** `TrsdosDirEntry.hasDate()` goes by the month alone (0 is no
      date). The LDOS line also has bit 4 of byte 1 for "date not set" (see "Directory entries
      (2.3 family)" in `FLOPPY_FORMATS.md`), which the writer sets with a month of 0 but the
      decoder doesn't read. Check whether any disk has the bit set with a month from 1 to 12
      before deciding whether it should count.

## Naming the DOS

The boot check of `ira/all-dos` (see "Booting as ground truth" in
`FLOPPY_FORMATS.md`) recorded each system disk's DOS and version as an `os` fact,
so the suite's fact failures are this list's evidence: `node regress.ts run`
ends with them, grouped by message.

- [ ] **Percom disks with no directory** (OS-80 III, MicroDOS 2.10 for the Model
      III, and the hacked MicroDOS 1.12; see "Unresolved disks" below) fail their `os`
      facts because nothing decodes them. Naming them would need a file system
      with no files, or a way to report a DOS without one. Telling which DOS is easy
      once that exists: MicroDOS's and OS-80 III's boot sectors match Ira's prefixes on
      all 17 and 5 of ours (see "Boot sector code by DOS" in `FLOPPY_FORMATS.md`).

## Unresolved disks

None of these blocks anything. Each disk's sidecar in the regression suite says
more.

- `ira/no-extract/SmartNet ... [84-11-xx Drive 1].dmk`: the DMK header says 42
  tracks, but the file holds a 43rd track's side 0 (cylinder 42, all 18 sectors
  with good IDs) after them. Files reach cylinder 45, so reading that track would
  recover 18 of the 156 missing sectors. Decide whether the reader should load
  whole tracks past the header's count.
- `lanhawk/Archive2a/ARCH067.DSK`, `ARCH146.DSK`, `ARCH158.DSK`: 0xCB is 0x50, but
  BOOT/SYS has the DOSPLUS 3.2.1-3.4 FORMAT's passwords, so they're "DOSPLUS 3.2.1, 3.3 or 3.4"
  (November 2026), which we don't write to, since something else wrote the GAT. Their boot sector is byte for byte the `F3 FE` one of eight DOSPLUS 3.3
  disks (including `ARCH121` and `ARCH151` of the same set), and nothing else of ours, so
  they're probably 3.3. Ira's fill test would settle it (3.3 fills never-written sectors
  with 0xE5, 3.4 with 0x00). Something rewrote 0xCB along with the name and date (all
  three say "DISK", in capitals).
- `ira/lk-341-set-1/Defense Command ... [M13][Dual Boot]` (both), `... [M1][Original]`,
  the three `Stellar Escort` disks and `Weerd`: named "Big Five BFLOADER" from their boot
  sector (Ira), but decoded with the TRSDOS 1.3 layout, one file each. Ira says the
  `Defense Command` disks have a TRSDOS 2.3-layout directory on cylinder 17 with
  BOOTER/SYS, DEFENSE/CMD and HISCORES/DEF, as `Defense Command [Set 1]` decodes. Find
  out why the 1.3 layout wins on these.

- `peter/Col 2 - 030 - No Box - No Label.dmk`: now decodes as NEWDOS/80, `GPL=2`,
  directory lump 17, with all 24 system files clean. Earlier notes said its boot
  byte names cylinder 61; reconcile that.
- `peter/52VFRED.DMK`: decodes (`GPL=8`, double-sided, 9 code files clean), but
  its GAT reads 0x25 in every used lump, which isn't a granule bitmap. No
  candidate passes the strict GAT check, so it falls back to the best score.
- Percom OS-80, OS-80 III and MicroDOS (20 disks in `peter/`, tagged `percom`,
  including four applications on Percom-formatted disks, plus the MicroDOS
  manual disk in `ira/lk-341-set-1`): the 12 Model I disks with a directory
  are decoded (`MicroDos.ts`; see `FLOPPY_FORMATS.md`, "Percom MicroDOS"). What's
  left has no MicroDOS directory. Four Model I disks (Electric Crayon,
  Letter Generator, Paymaster, WORP-1) hold turnkey programs at fixed sectors,
  and the four Model III disks (OS-80 III, MicroDOS 2.10) are addressed by
  absolute sector from BASIC. Those could only be shown as raw sector ranges,
  if at all. The hacked MicroDOS 1.12 has a directory in another format, with
  two entries whose sector numbers are unclear.
- Disks read without their HIT (see "A HIT can be wrong while the directory is
  fine" in `FLOPPY_FORMATS.md`): six TRSDOS 6 disks whose HIT is a copy of a
  file sector, `RemDisk 1` (HIT shifted by a byte), and four damaged
  directories. Ignoring the HIT also lists in-use entries the DOS can't reach.
  A finer fallback would trust the HIT bytes that do match and ignore only the
  rest, or detect the one-byte shift.
- The 20 one-off disks in `ira/lk-341-set-1` all decode. The last two did in
  November 2026: `Super Utility + Copy Utility [Set 3]` (directory moved to
  cylinder 3, see "Cylinders, sides, and allocation" in `FLOPPY_FORMATS.md`),
  named NEWDOS 3.0 from its boot sector, and `Defense Command [Set 1]` (see "A
  HIT can be rebuilt over leftover bytes"), which is now "Big Five BFLOADER"
  (it was "MultiDOS", from a fill of "MULTIDOS" on its boot track).
  `French Teacher #1` and `MultiDOS II [Incomplete]` only needed IDs with bad
  CRCs ignored (see "An IDAM pointer can point at data" in `FLOPPY_FORMATS.md`).

## New formats

In planned order. People on a TRS-80 Discord asked for all of these after the
3.0.0 release, except the Model II file systems.

- [ ] **Model II leftovers.** Model II TRSDOS, TRSDOS-II, DOSPLUS II, LS-DOS, the
      CP/M formats and Xenix tar disks decode (see their sections in
      `FLOPPY_FORMATS.md`), covering all but about 80 of the 368 disks in Pete's
      Model II archive. What's left:
      - **Xenix file systems** (77 disks, the boot, application and "special
        install" disks): a Unix file system with a big-endian superblock in block 1
        (magic 0x2B5544 at 0x1F0 on Xenix 3; older TRS-XENIX disks lack it),
        64-byte inodes from block 2, 16-byte directory entries.
      - **Xenix tar extents** (files split across disks; see "Xenix tar disks"
        in `FLOPPY_FORMATS.md`): `XenixTarFile.extent` holds the fields, and
        `extract` warns about a first part and appends a later part to the file
        that the earlier parts made in the output directory. What's left:
        - `dir`, `info` and the web app don't show that a file is only a part,
          and the web app's ZIP export writes each part as if it were the whole
          file.
        - `extract` can't check where a middle part (of three or more) belongs,
          only that it leaves room for the rest; no set has more than two parts.
        - The regression suite has no disk with extents, and `info --json`
          doesn't report them. `GAMES1.IMD` and `GAMES2.IMD` (`vtrek`) or
          `XNX130D3.IMD` and `XNX130D4.IMD` (`bin/awk`) from Pete's archive would
          cover it.
      - **Tar after a file system:** `XNX320FM` has a tar archive after its
        Xenix file system, which isn't read (see "Xenix tar disks").
      - **OASIS** (`OASIS55A.IMD`) and **RM/COS** (`RMCOS243.IMD`), one disk each.
      - DOSPLUS II data disks are "Unknown DOS": GAT byte 0xCB is 0x10, which
        MultiDOS 1.x also writes, and they have no banner. A boot sector hash
        table (see "What `dosName` still can't tell") would name them.
      - TRSDOS-II's flag bit 0x08 (only on SYSRES/SYS, SYSTEM/SYS and BOOT/SYS),
        its second flag byte, privilege bits 3-4, and the allocation bitmap, which
        isn't read. Model II TRSDOS's bytes 1-2 and 61-63.
      - The disks are read-only, as IMD images are.
- [ ] **IMD leftovers.** The reader is read-only, so a mounted IMD disk can't be
      written to. The 0xFF per-sector size table is supported, as in MAME, but no
      image uses it, so only the unit tests exercise it.

- [ ] **More CP/M formats.** `Cpm.ts` reads Montezuma Micro CP/M 2.2,
      Lifeboat CP/M 1.4, Holmes, CP/M Plus and the Model II formats (see "CP/M"
      in `FLOPPY_FORMATS.md`); each further
      format is mostly a new entry in `CPM_FORMATS`, checked against real disks.
      - Omikron CP/M on the Model I was also requested, though it's more of a
        novelty: it needed the Omikron Mapper board, which rearranges the
        Model I's memory map so CP/M gets RAM at address 0. We have no Omikron
        disks; ask the Discord.
      - Lifeboat's parameters come from one system disk, not a DPB. Check
        other Lifeboat disks against the entry when any turn up.
      - Montezuma 1.26 and 1.30 disks use skew 4 (mloewen's FORMAT13 and 14),
        which ties with the later skew 2 when the directory reads cleanly
        both ways; then we pick skew 2, and the files may be garbage. A
        tiebreak would need to look at file contents.
      - Archive listings mention 288K and 352K Montezuma disks, which match
        none of the 12 formats in the table. They may be other BIOSes'
        formats that Montezuma could read.
      - The table assumes double-sided disks alternate sides track by track.
        Other BIOSes go up side 0 and back down side 1, or use side 0 then
        side 1; add a field to `CpmFormat` when one turns up.
      - CP/M 3 date stamps (user 0x21 entries) aren't read, so files have no dates.
      - Model II CP/M (see "Model II CP/M" in `FLOPPY_FORMATS.md`): the
        double-sided P&T and Aton formats have 192 directory entries, and the
        table reads them with 128, which loses any file past entry 128 (none
        of the archive's disks has one). CP/M Plus's 1024-byte format with
        four reserved tracks isn't in the table. FMG CP/M 2.21 (26 × 256,
        interleave 1, 10, 19; `FMG221.IMD` in Pete's archive) doesn't decode.
      - `peter/104 Elephant ... CP-M 2.2 ...` is far shorter than its header
        says (39,184 bytes of a promised 287,248), and its six tracks have no
        sectors, so there's nothing to read.
- [ ] **HFE leftovers.** `HfeFloppyDisk.ts` reads version 1 images (see
      "Image formats" in `FLOPPY_FORMATS.md`). Not done:
      - Version 3 (`HXCHFEV3`) is rejected. It interleaves opcodes with the
        track data (index, bit-rate changes, skips, random bits), and is
        documented only in the HxC source.
      - Writing. The reader is read-only, so a mounted HFE disk can't be written to.
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
        some of its sectors. The HFE reader doesn't have this limit, since it
        decides density per sector. SCP could turn its flux into a cell
        stream (one bit per half-cell) and reuse the HFE mark finder.

- [ ] **UCSD Pascal leftovers.** `UcsdPascal.ts` reads FMG's Model I disks (see
      "UCSD Pascal" in `FLOPPY_FORMATS.md`).
      - Text files are converted to host text by `trs80-tool extract` (unless
        `--ucsd-pascal-raw`) and My TRS-80's ZIP export, using `ucsdPascalTextToHost()`;
        `UcsdPascal.readFile()` still returns the raw bytes. The editor's own header
        fields aren't decoded. `dir` shows the on-disk size, not the converted size.
      - Only FMG's mapping is known. Other vendors' TRS-80 UCSD Pascals (another
        interleave or skew, or double density) won't decode until a format is
        added to `UCSD_PASCAL_FORMATS`.

## Converting between image formats

`trs80-tool convert in.dmk out.hfe` works for DMK, JV1, JV3, HFE and IMD (see "Writing the image
formats" in `FLOPPY_FORMATS.md` for what each holds and the results on the collection). What's left:

- [ ] **SCP as a raw source.** SCP is converted as sectors, so its gaps and flux detail are lost.
      Needs an SCP image to test with (there are none), and flux decoding that keeps the bytes.
- [ ] **HFE v3 and the alternate track 0 encoding fields.** We write only v1, with the fields 0xFF;
      HxC sets them when track 0 is single density on a double-density disk, and FlashFloppy ignores them.
- [ ] **8-inch HFE** (500 kbit/s, 360 rpm) is written but unchecked against a real image.
- [ ] **IDs the HFE reader can't see** (no data mark; inside another sector's data). The cells are
      kept, but `decodeSide()` drops them, so `compareFloppies()` calls the sectors missing. A reader that
      kept them for copy-protected disks would let the report say they survived.
- [ ] **JV3 sector numbers above 39.** The format allows up to 254, but the reader's plausibility test
      (`SectorPosition.isPlausible()`) refuses a file that has them, so the writer leaves them out.
- [ ] **A better reason in the report.** `MISSING_SECTOR` doesn't say why the format couldn't hold the
      sector (duplicate, number too high, no data). The writers know; the comparison doesn't.
- [ ] **Filling the other direction:** `convert` makes floppy images only from floppy images. Putting
      files on a new disk is the `disk` command's job.
- [ ] **DMK to HFE ignores the DMK's track length.** The HFE writer always makes turns of 6,250 slots,
      so a Read Track check like Big Five's (see "Big Five's Read Track check" in `FLOPPY_FORMATS.md`)
      fails on an HFE made from a DMK that held the right length. Most DMKs from imagers are longer than
      a turn (0x1900 or 0x1980 for 6,250), so the length can't be trusted as a turn in general; it could
      be when it's close to a turn and not a usual value.
- [ ] **One length for a whole DMK.** A disk whose checked tracks differ by more than its check allows,
      or one that has both a sector crossing the index and a Read Track check, can't be held as a DMK
      that boots. The converter can't tell; it could at least say so when the HFE's turns differ widely.
      None of the seven Big Five HFEs is like that, but one Robot Attack's median turn is only two bytes
      from the edge of its window (see "Big Five's Read Track check" in `FLOPPY_FORMATS.md`).
- [ ] **DMK tracks of 0x4000.** Our reader and the converter allow it; MAME's reader stops at 0x3FFF.

## Copy protection signs

`findProtectionSigns()` (`CopyProtection.ts`) does Ira's track signs and two of his four DOS-level
signs (see "Copy protection signs" in `FLOPPY_FORMATS.md`). Left out, or left rough:

- [ ] **Hidden directory entries:** an entry with a name but the in-use bit clear (attribute 8xh), which
      Clone-III uses. Every KILL leaves one too, so it needs something that tells the two apart before
      it's worth reporting, even as possible.
- [ ] **Short extents:** extents holding fewer sectors than the entry's sector count (Stellar Escort,
      Weerd), or more (S-002 Music Magic's BOOT/SYS). The 1.3 and 2.3 size rules differ (see `PageIt`
      in "Disks worth remembering"), and damage looks the same, so it needs care to avoid flagging
      damaged disks.
- [ ] **Directory mismatch on NEWDOS/80-style lumps:** boot byte 2 is a lump there, not a cylinder, so
      the sign is checked only where lumps are cylinders, and only on the 2.3 family.
- [ ] **TRSDOS 1.1's backup count** is read from the boot word at 0xFC-0xFD, as Ira describes, but no 1.1
      disk in the collection has a limited file to check it against.
- [ ] **Leftovers past the end of a disk whose size isn't proven** still count as data tracks for the
      mixed-density and other-cylinder signs. Past a proven end (`findTrsdosDiskSize()`) they don't, so this
      shrinks as more DOSes get a size source (see "Tails and trim").
- [ ] **Re-read tails and 80-track reads** of 40-track disks are reported as IDs naming another cylinder
      (possible). `FloppyTail.ts` now recognizes re-reads past a proven disk end, and trim and repair
      don't count the sign there, but the report itself still lists it. 80-track reads (every even track
      naming half its cylinder) are still only "IDs naming another cylinder", so trim keeps them.
- [ ] **FA marks inside files** (`newdos80-SSSD-80T.dmk`'s EDTASM/CMD) are flagged as possible. Whether
      some DOS or copier writes them there is unknown.
- [ ] **Signs the readers can't see:** IDs with no data mark or inside other sectors' data that a reader
      drops (see "IDs the HFE reader can't see" above), and raw size codes on JV3 and IMD, which can't
      store them.

## Imaging artifacts

`findImagingArtifacts()` (`ImagingArtifacts.ts`) labels three of the five artifacts in "Imaging
artifacts that look like damage" in `FLOPPY_FORMATS.md`; the other two never show as damage. Left out,
or left rough:

- [ ] **HFE and SCP images** get only the converter-marker rule. The late-start and one-revolution rules
      read DMK track bytes; flux images could have both, but no suite disk shows them.
- [ ] **A late start that lost two or more sectors** isn't recognized: the rule needs exactly one missing
      and the rest in place, which keeps it from excusing real damage. Nor does it use the lost sector's
      data tail before the first ID, which Ira describes (read without byte sync).
- [ ] **Ira's case disks aren't in the suite**: `Modem-80 v3.0 [Set 2]`, Network 3 Disk 1, Nightwalker
      and `GRAFPAC-80 [Set 1]`, and four of the five NEWDOS-90 images. Each rule was confirmed on other
      disks instead; adding these would check the rules on the disks that suggested them.
- [ ] **Recovering the sectors.** A one-revolution read loses only the last few dozen bytes of one sector
      per track, and a converter's marker hides whether the data is right. Neither is repaired; Ira's rule
      is to leave the image alone, and reimaging is the fix.
- [ ] **`free` still counts NEWDOS/80's never-allocated granules** (those the GAT's existence table says
      don't exist, and lumps past the PDRIVE lump count) when the GAT leaves them free, though the writer
      never uses them, so its "not enough room" count can still be lower than `free`'s there. The
      granules the image doesn't fully hold and those past the disk's end are counted apart now (see
      "Free space the image lacks" in `FLOPPY_FORMATS.md`); these depend on the rule set, which `free`
      would have to take from the write gate. Measured (November 2026): 24 suite disks under NEWDOS/80's
      rules have some, mostly read-only (NEWDOS/80 1.0 DoubleZap disks, Infocom games); the one writable
      one is `G Texte v0.1 ... [Set 2]`, with 1 granule.

## Tails and trim

`trim` drops only what `analyzeFloppyTail()` proves is outside the disk (see "Tails past the disk's
end" in `FLOPPY_FORMATS.md`), and `repair` refuses disks with protection signs. Left out, or left rough:

- [ ] **More sources for the disk's size.** Only the LDOS line, DOSPLUS 3.x/4.0, NEWDOS/80 system disks, MultiDOS,
      and TRSDOS 2.x and 1.x have one. DOSPLUS IV writes the TRSDOS 6 GAT (see "GAT bytes 0xCB-0xCD") but
      has no rule set, so it isn't covered; NEWDOS/80's derivatives (NEWDOS/86 and /90, G-DOS, H-DOS) and
      its data disks, which have no PDRIVE table, aren't either; nor are TRSDOS 2.7, NEWDOS 2.1-3.0,
      DoubleDOS, VTOS, UltraDOS and the rest, or CP/M, whose size comes from our format table
      rather than the disk. Each needs its own evidence first. **Decided** (November 2026): until a DOS has
      a size source, its disks' tails stay untrimmed, which is the safe side.
- [ ] **TRSDOS 2.x's fixed 35 cylinders** come from its FORMAT; a disk ZAPped to 40 is recognized only
      when its GAT covers the extra cylinders. One whose GAT doesn't keeps its tail as "formatted like
      the disk", which is safe.
- [ ] **Re-reads whose IDs name a later cylinder**, like cylinder 40 of `TRSDOS v6.02.01-AR ...
      [Original][Set 5]` (IDs say 42, data matches no neighbor), aren't re-reads by rule 2 and stay.
      **Decided** (November 2026): we don't think that one is a re-read, despite Ira's list. Its data
      matches none of its neighbors, and its 0x6C filler is DOSPLUS's (the reasons are in a comment on
      #47). If a disk ever shows a real re-read with later IDs, the rule needs a second form.
- [ ] **Ira's other hands-off checks** for repair aren't done: filename tags containing "Protect", a
      JV3 file named `.dmk`, and odd image header bytes.
- [ ] **No override.** Neither trim nor repair can be made to touch a disk with protection signs, even with
      `--force`. **Decided** with the user (November 2026, #47): no override. A sign may be the protection
      itself, which trimming or repairing would destroy, and Ira's rule is never to turn a good image into a
      bad one. If someone needs it, it wants an option of its own rather than `--force`.
- [ ] **`check` doesn't discount re-reads.** It reports IDs naming another cylinder on re-read tails as a
      protection sign, though repair doesn't count them.

## Hard disks

`HdvHardDisk` partitions that hold LDOS 5, LS-DOS 6 or DOSPLUS 3 file systems
are read (see "Hard disk images" in `FLOPPY_FORMATS.md`). What's left:

- [ ] **DBLBIT.** A partition with bit 5 of FLAG2 or of GAT byte 0xCD set (each
      logical cylinder is two physical cylinders) is skipped with a warning.
      No sample has one.
- [ ] **Partitions split by head without a media data block.** Without a block
      we assume the partition takes the rest of the disk's heads, so a disk with
      head partitions and no `RSH` block would find the first partition too tall.
      No sample has this.
- [x] **NEWDOS/80 on hard disks** (`m1-newdos80v25.hdv`, `m3-newdos80v25.hdv`,
      `m3-newdos80v25-st251.hdv`) are read: a partition per head from the PDRIVE
      table's hard disk slots, with the slot's granule size and lump count, and
      the directory's 33 sectors from the HIT (see "NEWDOS/80 on hard disks" in
      `FLOPPY_FORMATS.md`). NEWDOS/80's own `FREE` agrees on every drive of the
      two auto-boot disks. Still to do:
      - Add the four other NEWDOS/80 images from `FreHDCD.zip` (named in that
        section) to the suite. The zip wasn't on this machine; the Wayback
        Machine has it (61 MB) at
        `web.archive.org/web/20230710165007id_/http://members.iinet.net.au/~ianmav/downloads/FreHDCD.zip`.
      - Writing, and adding, deleting or formatting partitions, are refused.
        Writing needs the NEWDOS/80 rules on a partition: the partial last lump,
        a directory that isn't a whole number of granules, and no lockout table.
      - What the slot bytes for the first cylinder and the head count are (`HDS=`'s
        first and fourth fields), so that a partition that doesn't start at
        cylinder 0 or spans heads would be read. No sample has one.
      - Formatted heads that no slot names (heads 6 and 7 of `m3-newdos80v25.hdv`)
        are skipped. They're empty on every sample.
- [ ] **Montezuma CP/M on hard disks** (`m4-mmcpm22.hdv`) decodes as a hard disk
      with no partitions. Its layout is in "Montezuma CP/M on hard disks" in
      `FLOPPY_FORMATS.md`: two drives of 3 heads, whose tracks run down one head
      before moving to the next. To do: `Cpm.ts` takes a `DiskVolume`, a
      partition view with that track order, and reading the DPBs from the BIOS
      in the system cylinders instead of a fixed format. Add the other three
      Montezuma images from `FreHDCD.zip` to the suite first.
- [ ] **"A DOSPLUS granule is a track"** is measured on one DOSPLUS 3.5 disk.
      Another DOSPLUS hard disk, or the DOSPLUS manual's hard disk chapter,
      would confirm it.
- [ ] **Media data block bits we don't understand:** FLAG1 bits 3-2 (set on
      every sample) and FLAG2 bit 4 (set on every sample). What the `DCT` driver's
      block (`hxchard-ldos5-6part.hdv`) means by its fields, since it doesn't
      record the starting cylinder.
- [ ] **F48 images** (the 8-inch FreHD's variant, with other sector sizes and
      sectors per head in byte 29) are rejected. None is in the suite, but Pete's
      Model II archive (github.com/pski/model2archive, also in
      `~/others/model2archive`) has four, in `HD_Images/F48/hard4-0` or
      `HD_Images/FreHD48/hard4-0`: TRSDOS-II 4.2.5 and 4.4, and Xenix 1.3.5 and
      3.3. The TRSDOS-II 4.4 one fits the spec: byte 8 = 0x0A (F48, 512-byte
      sectors), byte 26 = 8 heads, bytes 27-28 = 800 cylinders and byte 29 = 17
      sectors per head, which is the geometry its README gives and exactly the
      file's size. Reading these needs the Model II file systems (TRSDOS-II,
      Xenix) on a hard disk, and 512-byte sectors in `HardDisk`.
- [ ] **Other hard disk formats:** Reed's HDV version 2 (starts `HDV` + `0x1A`,
      per-track sector tables), DREM (a `.cfg` text file of geometry plus a `.dsk`
      of data), and the Gesswein MFM emulator's `.emu`. Pete's archive has
      samples of the last two for the same TRSDOS-II and Xenix releases
      (`HD_Images/DREM/` and `HD_Images/DG/`, 45-85 MB each), and the readers in
      xfile and trsfs (`hd_image_hdv2.cpp`, `hd_image_drem.cpp`,
      `hd_image_emu.cpp`) are references. No HDV2 sample is known.
- [x] **Writing** to hard disks: LDOS 5 and LS-DOS 6 partitions of HDV images are
      written by `trs80-tool disk` (see "Writing to partitions" in
      `FLOPPY_FORMATS.md`). Still to do: DOSPLUS 3 partitions (the granules per
      cylinder need a second disk or the manual to confirm), partitions with
      more than 203 cylinders, and a per-sector undo instead of a copy of the
      whole image per step. Creating HDV images and formatting, adding,
      deleting and re-formatting LDOS 5.3 and LS-DOS 6.3 partitions is done
      (`HardDiskFormat.ts`, and the `create`, `partition --add` and `format`
      commands; see "Formatting partitions" in `FLOPPY_FORMATS.md`). Still to do
      there: check that the result boots and lists under a real DOS and the
      FreHD driver (the layout is compared with real partitions sector by
      sector, but nothing has run under a DOS), and TRSDOS 6.2 and bootable
      system partitions.
- [ ] **Why LS-DOS's `DIR` hangs on an FXDE in another directory sector, on a
      partition.** The writer works around it by keeping a file's FXDEs in its
      primary entry's sector (see "Writing to partitions" in `FLOPPY_FORMATS.md`),
      refusing a file for which no sector has room. LS-DOS's own FXDEs, which it
      puts in other sectors, hang `DIR` too on trs80gp with FreHD, and the driver
      returns the error 6 that `DIR` expects, so the cause is still unknown.
      Find whether a real machine hangs (then `repair` could move such FXDEs, and
      `check` should warn), or it's trs80gp, by tracing `DIR`'s `ALL15` sector
      read in the emulator, or by trying it on a real FreHD.
      Users see the workaround as a refusal to add a file on a partition that
      needs more than 8 directory entries (one sector's worth, about 29 extents,
      so only a badly fragmented file), or that needs fewer when no directory
      sector has that many free slots. If it turns out to be trs80gp only, place
      FXDEs as on floppies and drop the refusal.
- [ ] **The emulator:** no hard disk controller, and none of FreHD's extras, so
      `Trs80.runTrs80File()` doesn't know what to do with a hard disk. See
      "Emulating a hard disk" below.

### Emulating a hard disk

What it would take, from FreHD's source, Tandy's LS-DOS drivers and trs80gp's
`mx_hdc.cpp`, `wd1010.cpp` and `frehd.cpp` (see "Hard disk images" in
`FLOPPY_FORMATS.md` for where they are). Nothing here is implemented.

- **Ports.** The Tandy-compatible controller is a WD1010 behind these ports, the
  same on the Model I, III and 4 (FreHD's `frehd.inc` and LS-DOS's drivers agree):
  - 0xC0: write protect (read); 0xC1: control (bit 4 resets, bit 3 enables the
    device, bit 2 enables wait states);
  - 0xC8: data, through a 256-byte sector buffer (the WD1100-21's, in trs80gp);
  - 0xC9: error (read) or write precompensation (write); 0xCA: sector count;
    0xCB: sector number; 0xCC and 0xCD: cylinder low and high; 0xCE: SDH (size,
    drive in bits 3-4, head in bits 0-2); 0xCF: status (read) or command (write).
  - Commands: restore (`0001rrrr`), seek (`0111rrrr`), read sector
    (`0010d000`), write sector (`00110000`), format track (`01010000`).
  - On the Model III and 4 these ports are on the external I/O bus, which trs80gp
    only connects when the EXTIO bit of port 0xEC is set. Our `Trs80.ts` stores
    port 0xEC's value but doesn't act on that bit yet.
  - Model II, 12, 16 and 6000 controllers also have a CTC at 0xC4-0xC7, which
    collides with FreHD's ports. trs80gp also has a Corvus interface (0xDE-0xDF
    on the Model II), which we can ignore.
- **Sector addressing** is (cylinder, head, sector) straight into the image, as
  in `HdvHardDisk.readSector()`. FreHD computes heads as sectors per cylinder ÷ 32
  when the header's byte 26 is 0, exactly as we do (`trs_hard.c`,
  `open_drive()`).
- **A timing trap trs80gp found:** the controller must drop DRQ when a READ's
  buffer has been emptied, or NEWDOS/80 2.5 can't use the drive (trs80gp release
  notes).
- **Booting.** A stock ROM can't boot a hard disk:
  - The "Floppy Boot" images boot from a floppy with the hard disk driver (FreHD's
    `RSHARD`/`TRSHD`-style DCTs), which then uses the hard disk. Boot floppies for
    the Model I, III and 4 are in github.com/TJBChris/FreHDDisk
    (`disk_images/*.dmk`).
  - The "Auto Boot" images need FreHD's own boot path: a patched ROM (Ian
    Mavric's auto-boot EPROMs, documented on the FreHD CD) loads a boot block
    from FreHD through its extra ports, which reads byte 11 of the image's header
    to pick the DOS. trs80gp emulates this, and can load a custom boot block.
- **FreHD's extra interface,** at 0xC2-0xC5, sharing the status at 0xCF:
  - 0xC2 data, 0xC3 size, 0xC4 command (write) or ROM read (read), 0xC5
    error (read) or ROM write (write);
  - commands (`trs_extra.h`): version, get and set time, open, read, write,
    close and seek a file on the SD card, open and read a directory, mount a
    drive, drive info, the boot loader, image, and read an image's header.
  - FreHD's `IMPORT2`, `EXPORT2` and `VHDUTL` use these to move files between the
    SD card and the TRS-80. On power-up FreHD mounts `hard4-0` to `hard4-3`.
  - About 1,300 lines of C++ in trs80gp. Not needed to use a hard disk from a
    boot floppy.
- **Size of the job,** judging by trs80gp: about 750 lines for the WD1010 and 540
  for the board and its ports, plus the image readers, which we have.
- **In our emulator:**
  - a `HardDiskController` beside `FloppyDiskController`, wired into
    `Trs80.readPort()` and `writePort()`;
  - writes to the image, with an event like `FloppyDisk.onWrite`, so the apps
    can save changes;
  - the controller's state in `Trs80State`, for `save()` and `restore()`;
  - a way to mount a hard disk in trs80-tool's `run` and `mcp`, and in the web
    apps.

## Emulating floppy copy protection

The emulator's Read Track returns a turn of the image's length where the format records one (DMK, HFE),
which Big Five's check needs (see "Big Five's Read Track check" in `FLOPPY_FORMATS.md`). What's left:

- [ ] **Read Track synthesizes the track** from the sectors with standard gaps, even for DMK and HFE,
      which keep the real bytes. A protection that looks at the gaps, or at IDs the readers drop, sees
      something other than the disk.
- [ ] **Write Track ends after 3,125 or 6,250 bytes**, not after the image's turn.
- [ ] **Nothing else in the suite exercises it.** Booting every DMK and HFE in the suite (November 2026)
      on a Model I and a Model III for 20 emulated seconds, typing nothing, found two that issue a Read
      Track while booting: Super Utility (`SuperUtility-1su.dmk`, Model III, 3,136 bytes now against
      3,125) and a SoftSide issue (`SoftSide Magazine Vol 5 No 12 ... [Set 3].dmk`, Model I, 3,200 against
      3,125, which loops reading track 0 and doesn't boot either way). Both end on the same screen with
      either length. A protected program that checks later, or after a key, wasn't reached.

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

October 13, 2026, after working through Ira's `ira/DMK-Images-From-v342` (see
"Disks worth remembering" in `FLOPPY_FORMATS.md`): of the suite's 651 disks, 620
decode, up from 582. The changes were Percom MicroDOS, NEWDOS/80 directories
larger than a lump, a more lenient GAT (AUTO command, all-0xFF date, graphics
characters in the name), the DIR/SYS rule limited to the 2.3 family, and the
HIT-less fallback. Most of the 31 that don't decode are the nine Percom disks
without a directory and the disks listed under "Unresolved disks". `node
regress.ts list` shows each disk's notes.

Against the old decoder (`floppy-decode` before the merge), compared file by
file across the whole collection, nothing got worse that wasn't wrong before:
the disks it no longer decodes were all zero-file readings, and the three that
lost clean files are double-sided allocations imaged single-sided, which now
report their side-1 sectors as missing instead of reading the wrong cylinder.

October 14, 2026: on 52 LDOS 5.3 and LS-DOS 6.3 disks and two NEWDOS 3.0 disks
(same GAT byte 0xCB), time stamps gave 848 files a time (481 of them a year of
1988 or later), and 505 system files lost their dates. TRSDOS 1.3's system files added 651 files on 49 disks, 590 of them
load modules. Nothing else changed.

Later on October 14, 2026: the Model II file systems (Model II TRSDOS, TRSDOS-II,
Xenix tar), three 8" CP/M formats and DOSPLUS II's six granules per track. Ten
disks from Pete's archive were added to `model2/`. Of the suite's 676 disks, 648
decode; nothing that decoded before changed except to get better, and a Xenix file
system disk that the TRSDOS decoder took for NEWDOS/80 is now rejected (512-byte
sectors). Over Pete's whole archive (368 images), about 285 decode.

October 25, 2026: Ira's `ira/all-dos` (1,000 DOS disks, 801 of them new) was booted
to read each system disk's banner (see "Booting as ground truth" in
`FLOPPY_FORMATS.md`), and the banners became `os` facts, 262 of which failed. Reading
more banners (MultiDOS, Z'DOS and Esoteric versions; CP/M sign-ons on the reserved
tracks; DOSPLUS IV; the Model III layout's SuperDOS, DOS500 and RAPIDOS; NEWDOS 3.0,
NEWDOS+ and Percom's TRSDOS 2.x; MicroDOS's resident; NEWDOS/80's whole version)
and LNW80 CP/M left 30, and finding MultiDOS's residents outside its files (and
its backwards banners) left 5. Of the suite's 1,599 disks, 1,566 decode, 44,861 of 45,189
files clean; nothing changed but names, except the four LNW disks, which now decode.

October 26, 2026: the TRSDOS-family write gate read two-sided LDOS-line disks as "directory size
unproven" because the side-0 directory and the whole-cylinder one tie on hashes. The decoder now
prefers the directory that DIR/SYS's extent names, and the gate accepts the LDOS line's GAT side
bit for a one-side reading. Of the suite's 1,339 TRSDOS-family floppies the gate passes 647 (up from
630), allows repairs only on 72 (from 69), and leaves 620 read-only (from 640); `info --json`
doesn't report the gate, so these come from a throwaway script that decodes every disk. 33
disks changed directory size and nothing else (13 LDOS-line, 19 NEWDOS/80-style, 1 MultiDOS).

November 11, 2026: Ira's DOS identification rules from 123 disks he formatted under the real
DOSes (issues #31-#37), checked against the suite (see "Boot sector code by DOS" in
`FLOPPY_FORMATS.md` for what was used and what wasn't). Of the suite's 1,760 disks, 149 changed
name and nothing else: 65 NEWDOS/80 2.x data disks became "v2.0-2.74", 46 LDOS and LS-DOS disks
got a third digit or a range, 12 MultiDOS and Esoteric utility disks a release, 6 MultiDOS data
disks a version from their stub, 8 game disks with Big Five's loader "Big Five BFLOADER", 4
TRSDOS 2.x data disks "TRSDOS 2.2-2.3", 3 `lanhawk` disks DOSPLUS instead of "Unknown DOS", 2
`LOAD-80` disks DOSPLUS 3.3 instead of MultiDOS, and 3 disks of the TRSDOS 6 line took the
system sector's release over the GAT's. Every name that a filename, banner or provenance can
check agrees with it; telanoc's LDOS and LS-DOS disks now match the 5.3.1 and 6.3.1 its README
says they were made with, and its MultiDOS 1.7 data disks are "MultiDOS 1.7-1.71".
