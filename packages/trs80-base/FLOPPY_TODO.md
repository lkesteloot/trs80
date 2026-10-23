# Floppy decoding: known gaps

Things we've learned (mostly recorded in `FLOPPY_FORMATS.md`) that the code
doesn't do yet. Too small for GitHub issues, too important to lose. Check items
off by deleting them when the code catches up, and add new ones as they turn up.
Each item names the evidence disks, all in `~/mine/trs80-floppy-regress/disks`.

Last updated October 15, 2026. "Where things stand" at the end has the regression results.

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
      (LDOS); the NEWDOS/80 generator tries every size from 2 granules to the lump,
      plus one larger size if the HIT asks for it (byte 0x1F, or its highest
      column in use; see "HIT sector" in `FLOPPY_FORMATS.md`). Ties go to the
      smaller one, once fewer granules per lump haven't decided (that rule fixed
      `m2-lsdos-blank.dmk`, which used to show a 15-sector DIR/SYS). Reading the
      size would be firmer: DIR/SYS's own extent where there is one, or byte 0x1F
      alone, though `peter/TRS-80 Format [Set 1]` lists files past what 0x1F says.
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
      starting lump) on all 76 decoded Model I/4 disks, but candidates don't use
      it. A score bonus, not a gate, so game disks just go without.
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
      Something like `DosFamily` with members named after the layouts rather
      than `V2_3` and `V1_3`, `Trsdos.version` to match (it's next to
      `nameAndVersion`, which really is a version), and
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
- Two of the one-off disks in `ira/lk-341-set-1` (tagged `unresolved`) still
  don't decode; their sidecars say why. `Super Utility + Copy Utility [Set 3]`
  keeps its directory on cylinder 3 while DIR/SYS points at 17, a cylinder of
  CRC errors (boot byte 2 as evidence, above, could override DIR/SYS there).
  `Defense Command [Set 1]` has tracks of garbage or deliberately confusing
  sector IDs. The other 18 decode since October 2026; `French Teacher #1` and
  `MultiDOS II [Incomplete]` only needed IDs with bad CRCs ignored (see "An IDAM
  pointer can point at data" in `FLOPPY_FORMATS.md`).

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
        table (see "What `nameAndVersion` still can't tell") would name them.
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
- [ ] **NEWDOS/80 on hard disks** (`m1-newdos80v25.hdv`, `m3-newdos80v25.hdv`,
      `m3-newdos80v25-st251.hdv`) decode as hard disks with no partitions. The
      layout is worked out in "NEWDOS/80 on hard disks" in `FLOPPY_FORMATS.md`:
      a partition per head, with its granule size in byte 3 of its PDRIVE slot.
      To do: a `HardDiskPartition` for one head, and a NEWDOS/80 candidate whose
      sectors per granule come from the table instead of being 5. Check how
      many lumps the GAT holds. Add the four other NEWDOS/80 images from
      `FreHDCD.zip` (named in that section) to the suite first, to check
      against.
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
      sectors per head in byte 29) are rejected. No sample has one.
- [ ] **Other hard disk formats:** Reed's HDV version 2 (starts `HDV` + `0x1A`,
      per-track sector tables), DREM, and the Gesswein MFM emulator's `.emu`.
- [ ] **Writing** to hard disks.
- [ ] **The emulator:** no WD1010 controller, and none of FreHD's extras, so
      `Trs80.runTrs80File()` doesn't know what to do with a hard disk.

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
