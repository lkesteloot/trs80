# Model 4 support

What it would take to run the Model 4 fully, the way it was sold: its own
operating systems (TRSDOS 6, LS-DOS 6.3, DOSPLUS IV, CP/M), not only the
Model III software it's compatible with. Hardware add-ons (hi-res graphics,
hard disk, HyperMEM and other memory expansions, the XLR8er, Orchestra boards)
are out of scope.

Sources, cited by PDF page (not printed page), all in the user's Books folder:

- **HW85**: *Model 4 and 4P Technical Reference Manual - Hardware (1985)*,
  `TRS-80/`. Covers the original Model 4, the gate-array Model 4, the 4P and
  the gate-array 4P.
- **HW83**: *Model 4 Technical Reference Manual (1983)*, `TRS-80/`. The
  original Model 4 only; its Part 2 is TRSDOS 6.
- **SW85**: *Model 4 and 4P Technical Reference Manual - Software (1985)*,
  `TRS-80/disk/TRSDOS/`.
- **PG**: *The Programmer's Guide to TRSDOS Version 6 (1984)*,
  `TRS-80/disk/TRSDOS/`.

Statements marked "trs80gp" describe what that emulator does; treat them as
strong evidence but not proof. Facts from the web are marked as such.

## Where we are

`ModelType.MODEL4` exists, but the machine is a Model III with a faster clock:

- The ROM is the standard (original, non-gate-array) Model 4 ROM, 14 KB,
  CRC32 `1a92d54d`. It differs from the Model III ROM mostly in
  `0x30FD`-`0x3145`, `0x338E`-`0x34F1` and `0x3739`-`0x37E8`; among other
  things it programs the CRTC at boot (an `OUT (C),B` / `OUT (0x89),A` loop
  near `0x340C`).
- The clock is fixed at 4.05504 MHz and the timer at 60 Hz.
- Port `0x84` (memory map, 80 columns, video page, inverse video, RAM banks),
  `0x88`-`0x8B` (CRTC) and `0x90` (sound) aren't decoded; writes only log
  "unknown port". Bit 6 of port `0xEC` (FAST) is stored and read back on port
  `0xFF`, but doesn't change the speed.
- RAM tops out at 48 KB (`RamSize.RAM_48_KB`), video RAM is the 1 KB at
  `0x3C00`, the keyboard is fixed at `0x3800`, and the screen is 64×16.
- The keyboard has no CTRL, CAPS, F1, F2 or F3.

Tested on 2026-10-13 with the trs80-tool MCP server:

- **Model III mode works.** `telanoc/model3/m3_ld53_ss_dd_40_system.hfe`
  (LDOS 5.3.1) boots to `LDOS Ready`.
- **Model 4 mode doesn't.** `simple/ls-dos-6.3.1-ssdd.jv3` loads its boot
  sector at `0x4300`, which immediately does `OUT (0x84),0x86` (memory map 2,
  80 columns, video page 1), stores that in `0x0078`, clears `0xF800`-`0xFF7F`,
  and loads the rest of the loader starting at `0x0200`. With no map switch,
  those writes hit ROM, and the loader ends up in its error loop (`JR $` at
  `0x4394`) with a blank screen.
- Every Model 4 system disk we checked writes port `0x84` on its boot track:
  TRSDOS 6.0.0 and 6.2.1 and DOSPLUS IV write `0x86` like LS-DOS, and
  Montezuma CP/M 2.32 writes `0x82`, `0x03` and `0x02` (maps 2 and 3).

So the memory map is the first thing in the way, and nearly everything below
only matters once that works.

## Model 4 disks in the regression suite

`~/mine/trs80-floppy-regress` has plenty. Bootable system disks (they have
`SYS0/SYS`, or a CP/M system track):

| OS | Disks |
|---|---|
| TRSDOS 6.0.0 | `willus/td60000b.dmk` |
| TRSDOS 6.1.1 | `peter/Cobol v1.06.00C ... [Set 4].dmk`, `[Set 5].dmk` (system disks with COBOL) |
| TRSDOS 6.2.0 | `simple/trsdos-6.2-ssdd-crc-weird-version.dmk`; `ira/bad-crc/High Resolution ...` (two, with CRC errors) |
| TRSDOS 6.2.1 | `simple/trs80gp/TRS621.DSK` (trs80gp's built-in disk) |
| LS-DOS 6.3.0 | `simple/ls-dos-6.3-ssdd.dmk`, `ldos603l.dmk`, `ldos630l.dmk`, `ldos63h.dmk`, `ldos63j.dmk` |
| LS-DOS 6.3 | `willus/dwfontu8.dmk` (80 cylinders) |
| LS-DOS 6.3.1 | `simple/ls-dos-6.3.1-ssdd.jv3`, `simple/trs80gp/LD4-631.DSK` (double-sided), `telanoc/model4/m4_ld63_ss_dd_40_system.hfe` |
| DOSPLUS IV | `simple/DOSPLSIV.dmk`, `simple/DOSPLUS4.dmk`, `willus/dp4bare.dmk`, `willus/dp4v185a.dmk`, `telanoc/model4/m4_dp4a_ss_dd_40_system1.hfe`, `..._system2.hfe`, `m4_dp4a_ds_dd_80_system.hfe` (80 cylinders, double-sided) |
| Montezuma Micro CP/M 2.2 | `ira/Montezuma-1.42/...` (60K, BIOS 1.42), `ira/Montezuma-2.32/...` (64K, BIOS 2.32) |

There are also many Model 4 data disks (the TRSLink magazine issues and other
TRSDOS 6.2 and LS-DOS 6.3 disks in `peter/`, blank disks in
`simple/trs80gp/formatted/` and `telanoc/model4/`, Montezuma CP/M data disks
in `mloewen/` and `ira/`). The floppy decoders already handle all of these
operating systems; the work is in the emulator.

Not in the suite, and worth finding: CP/M Plus (CP/M 3) for the Model 4, which
banks the lower 32 KB; the 4P's `MODELA/III` ROM image file; the 4D's DeskMate
disks; and anything that hits the edge cases below (inverse video, 40×24,
hardware scrolling, the sound port).

`l2-631a.dmk` (LS-DOS 6.3.1, 77 cylinders) and `m2-lsdos-blank.dmk` are for
the Model II, and the Holmes VID80 CP/M disk and NEWDOS/86 are Model III
software, so none of them count.

## The models

All are Z80A machines that run Model III software in "Model III mode" and
their own software in "Model 4 mode". The modes are only a choice of memory
map (port `0x84`), made by software.

| Model | Catalog | Date | Notes |
|---|---|---|---|
| Model 4 | 26-1067 (16K, cassette only), 26-1068 (64K, one drive), 26-1069 (64K, two drives, RS-232) | April 1983 | PAL logic. 14 KB ROM with BASIC. Separate floppy controller board (FD1793) and RS-232 board. White screen, arrow keys split on both sides of the keyboard. |
| Gate-array Model 4 | 26-1069A | late 1984 | Gate arrays; the floppy controller (WD1773) and RS-232 are on the main board. Green screen, clustered arrow keys, no opcode wait states. Probably the later ROM revision (see below). |
| Model 4P | 26-1080 | September 1983 | Luggable, 9" screen, two internal single-sided drives, FD1793 with an FDC 9216 data separator. **No BASIC ROM**: a 4 KB boot ROM that loads a Model III ROM image from disk (`MODELA/III`) when needed. No cassette. Only two drive selects. Internal modem slot (26-1084). Discontinued by early 1985 (web). |
| Gate-array 4P | 26-1080A | later | As the 4P, with WD1773. |
| Model 4D | 26-1070 | late 1985 | Gate-array desktop with two double-sided 40-track drives (360 KB each, web), 64 KB (128 KB kit 26-1122), green screen, backspace key, bundled DeskMate ("D" for DeskMate, per trs-80.org). Shipped with TRSDOS 6.2.1, later LS-DOS 6.3. Sold until about 1990. |
| Student Station | 26-1059 | ~1984 | Diskless node for Radio Shack's classroom networks (web), with its own ROM. Out of scope without the network hardware. |

There was also a Model III to Model 4 upgrade kit ($799, web), which turns a
Model III into an original Model 4.

Sources: HW85 pages 7, 24, 59 and the chip table on page 152; Wikipedia's
"TRS-80 Model 4"; trs-80.org's Model 4 and 4D pages; trs80gp's model options
(`-m4a`, `-m4b`, `-m4c`, `-m4ga`, `-m4p`, `-m4d`, `-m4ss`).

For our purposes these collapse into three machines, plus variants:

1. **Model 4** (original): the baseline. trs80gp distinguishes three board
   revisions by wait states (below).
2. **Gate-array Model 4 and 4D**: WD1773, no opcode wait states, maybe the
   later ROM, different character generator (4D). The 4D's double-sided drives
   are just drives.
3. **Model 4P** (and its gate-array version): boot ROM instead of BASIC ROM,
   port `0x9C`, no cassette, two drives, different character generator.

The gate-array Model 4 is the original design built from fewer chips: three
custom gate arrays (timing, address, video), plus one in the floppy circuit,
replace the TTL logic and the MMI PALs (HW85 page 152). The port map, the
memory maps, the video modes, the keyboard, the interrupts and the drive select
latch are all the same, so software can't tell the two apart except by timing.
An emulator can see only these differences: the opcode wait states (section 5),
how video RAM access waits for the CRTC (section 3), the WD1773 (section 7),
the built-in sound (section 8), and possibly the ROM (section 11).

Suggest a config value for the variant (`MODEL4`, `MODEL4_GA`, `MODEL4P`,
`MODEL4D`), or a separate variant enum next to `ModelType`, since much of the
code only cares about "Model 4 family". `ModelType` is serialized, so only add
values.

## Checklist

Roughly in the order they'll be needed. **[boot]** marks what TRSDOS 6 and
LS-DOS need to reach their prompt.

### 1. Memory map (port 0x84, OPREG) [boot]

Write-only. Bits (HW85 page 10; 4P version page 86):

| Bit | Name | Meaning |
|---|---|---|
| 0-1 | SEL0, SEL1 | Memory map 0-3 |
| 2 | 80/64 | 1 = 80×24 (or 40×24 with port `0xEC` bit 2), 0 = 64×16 (or 32×16) |
| 3 | INVERSE | 1 = bit 7 of a character means inverse video, not graphics |
| 4 | SRCPAGE | Which 32 KB half of the second 64 KB to map in (0 = lower, 1 = upper) |
| 5 | ENPAGE | Enable the bank mapping |
| 6 | DESPAGE | Where it goes: 1 = replaces `0x0000`-`0x7FFF`, 0 = replaces `0x8000`-`0xFFFF`. HW83 calls it "fix upper memory". |
| 7 | PAGE | Which 1 KB of the 2 KB video RAM the CPU sees at `0x3C00` |

The four maps (HW85 pages 10-11, and Table 2-1 on page 31):

| Map | `0000-37FF` | `3800-3BFF` | `3C00-3FFF` | `4000-F3FF` | `F400-F7FF` | `F800-FFFF` |
|---|---|---|---|---|---|---|
| 0, Model III | ROM (except printer status at `37E8`-`37E9`) | keyboard | video (1 KB page) | RAM | RAM | RAM |
| 1 | RAM | keyboard | video (1 KB page) | RAM | RAM | RAM |
| 2 | RAM | RAM | RAM | RAM | keyboard | video (all 2 KB) |
| 3 | RAM | RAM | RAM | RAM | RAM | RAM |

- Reset selects map 0. A 16 KB machine only has map 0.
- The RAM under the ROM in map 1 is the same physical RAM that maps 2 and 3
  show there.
- The printer status at `0x37E8` is only in map 0 (trs80gp; HW85 page 10 says
  the decode is "in Model III mode").
- In map 2, trs80gp shows the 2 KB of video RAM split by the PAGE bit: with
  PAGE = 0, the 1 KB that map 0 shows as page 1 is at `0xF800` and page 0 is
  at `0xFC00`; PAGE = 1 swaps them. That's the reverse of what you'd guess.
  Verify with LS-DOS, which boots with PAGE = 1.
- Writes to the keyboard range do nothing.
- Banking (bits 4-6) only matters with 128 KB; with 64 KB, ignore it. On the
  original Model 4 a 128 KB upgrade needed an extra PAL (HW85 page 10;
  Wikipedia says the gate array doesn't). In map 2 the banked upper half
  covers `0x8000`-`0xF3FF`, with the keyboard and video still on top
  (trs80gp).
- TRSDOS 6 names the upper 32 KB of the first 64 KB "bank 0" and the two
  halves of the second 64 KB "banks 1 and 2", always swapped into
  `0x8000`-`0xFFFF` through the `@BANK` SVC (SW85 page 38). CP/M (Montezuma's
  and CP/M 3) bank differently, so test both kinds.
- TRSDOS 6 keeps images of port `0xEC` and port `0x84` in its flag table at
  `IY+12` (MODOUT) and `IY+14` (OPREG$) (SW85 page 85; PG). The boot sector
  also stores it at `0x0078`.

Implementation: today `Trs80` keeps ROM, screen and RAM in one 64 KB
`Uint8Array` and decides by address range in `readMemory()`/`writeMemory()`.
That needs to become separate ROM, RAM (up to 128 KB) and video RAM (2 KB)
arrays, and a page table rebuilt on every write to `0x84` (and `0x9C` on the
4P). Pages of 1 KB fit every boundary (`0x3800`, `0x3C00`, `0xF400`,
`0xF800`); the printer status bytes at `0x37E8` stay a special case.
`readMemory()` is the hottest path in the emulator, so keep the lookup cheap.
`getMemory()`, the debugger views, `Trs80State`, `save()`/`restore()`,
`writeMemoryBlock()` (used to inject programs), and the MCP `read_memory`,
`write_memory` and `search_memory` tools all assume a flat 64 KB; decide
whether they see the CPU's current view (probably) and add a way to read the
physical RAM.

### 2. RAM size [boot]

The Model 4 came with 16 KB (diskless, 4116 chips), 64 KB, or 128 KB (HW85
page 11). Model 4 mode needs 64 KB. `RamSize` stops at `RAM_48_KB`, so add
`RAM_64_KB` and `RAM_128_KB` (the enum is serialized, so append), and make
`Config` allow them only on the Model 4. In Model III mode, 64 KB looks like a
48 KB Model III. trs80gp fills Model 4 RAM at power-on with a pattern that
depends on address bit 0; ours is all zeros, which is fine unless software
depends on it.

### 3. Video [boot]

- **Video RAM is 2 KB**, not 1 KB (HW85 page 11). In 64×16, the CPU sees one
  1 KB page at `0x3C00` chosen by port `0x84` bit 7.
- **The CRTC is an MC6835** (a mask-programmed 6845) at ports `0x88`-`0x8B`:
  even ports (`0x88`, `0x8A`) select a register, odd ports (`0x89`, `0x8B`)
  write it (HW85 pages 9, 86). The 64×16 and 80×24 timings are built in and
  selected by port `0x84` bit 2. Software only uses the start address (R12,
  R13), for hardware scrolling and to choose which 1 KB page is displayed in
  64×16 (HW85 page 11). The display page and the CPU's page (port `0x84` bit 7)
  are independent. The start address wraps within the 2 KB. Both the Model 4
  ROM and the 4P boot ROM program the CRTC, so it must at least accept the
  writes.
- **Four text modes**: 64×16, 32×16, 80×24, 40×24, from port `0x84` bit 2 and
  port `0xEC` bit 2 (HW85 page 59). The 80×24 mode uses a different dot clock
  (12.672 MHz instead of 10.1376 MHz) and character cells 10 scan lines tall
  instead of 12 (trs80gp). In 80×24, trs80gp draws the 2×3 graphics blocks as
  4, 4 and 2 scan lines, cutting off the bottom; check against a photo.
- **Inverse video** (port `0x84` bit 3): characters `0x80`-`0xFF` show
  `0x00`-`0x7F` inverted instead of graphics. TRSDOS 6's display codes
  `0x10` and `0x11` control it (SW85 page 202).
- **Alternate character set** (port `0xEC` bit 3) works as on the Model III,
  which we already do. The 4P's table of how it combines with bit 7 is on
  HW85 page 87.
- **Character generator**: the original Model 4 uses the Model III's. trs80gp
  uses a different one for the 4P and 4D (and offers the other as an
  alternate on each), so expect some glyphs, probably in `0x00`-`0x1F` and
  `0xC0`-`0xFF`, to differ. We need a dump of the 4P/4D character ROM. In
  Model 4 mode, `0x00`-`0x1F` are special characters shown with a `0x00` prefix
  (SW85 page 202).
- **Screen interface**: `Trs80Screen.writeChar(address, value)` assumes the
  `0x3C00` window. It needs to address the 2 KB video RAM, and to hear about
  mode changes (columns, rows, double width, inverse, start address). Affected
  code: `Trs80Screen.ts`, `CanvasScreen.ts` and `Trs80WebScreen.ts` in
  trs80-emulator-web (canvas size, cell height, the authentic display's
  geometry), `HeadlessScreen`, rendering, and recording in trs80-tool's
  `mcp.ts` (fixed 64 columns, 16 lines, 512×384 frames), `getScreenshot()`
  (format `0:` is 64×16; add a versioned format with the mode), `cls()`,
  `positionCursor()`, `screenShows()` (all `0x3C00`-based, used for injecting
  programs and waiting on the ROM), and the IDE's `ScreenEditor.ts`.
- **Video wait states**: when the CPU touches video RAM during active display,
  the hardware holds it in WAIT so the screen doesn't show "hash" (HW85
  page 7). Port `0xEC` bit 5 enables this. It only affects timing. The two
  desktop boards do it differently: the original holds the CPU only during the
  visible part of the display (HW85 page 7), while the gate array makes every
  video RAM access wait until it lines up with the CRTC's clock (HW85
  page 31). Only a cycle-exact emulator would notice.
- **Video timing**: 264 lines per frame and 60 Hz, with 256 fast-mode clocks
  per line in both modes (trs80gp). 50 Hz export machines exist; skip them.

### 4. Keyboard [boot]

- In map 2 the keyboard is at `0xF400`-`0xF7FF` instead of
  `0x3800`-`0x3BFF`. `Keyboard.readKeyboard()` takes the offset into the
  range, so the change is in the memory map.
- The Model 4 has 70 keys. Row 7 (address bit 7, `0x3880`) holds, from bit 0:
  left Shift, right Shift, CTRL, CAPS, F1, F2, F3 (this matches trs80gp, and
  the 4P boot ROM's key codes `0x82`-`0x88` on HW85 page 73 are in the same
  order). Add these to `keyMap`; today the browser's Control key is ignored.
  The numeric keypad shares the main keys' matrix positions.
- TRSDOS 6's keyboard driver maps keys to codes (SW85 pages 211-212), including
  CAPS lock, and CTRL with letters. `simulateKeyboardText()` and the MCP `type`
  tool will want a way to send control characters.
- `KEY_DELAY_CLOCK_CYCLES` is in t-states, so at 4 MHz keys come twice as fast
  in emulated time. Check that the DOS's debounce keeps up.
- The gate-array Model 4 and 4D move the arrow keys into a cluster, and the 4D
  adds a backspace key. That's layout only (the soft keyboard and bezel), not
  the matrix, as far as we know.

### 5. CPU speed (port 0xEC bit 6) [boot]

- The Model 4 runs at 2.02752 MHz (slow) or 4.05504 MHz (fast), both from a
  20.2752 MHz crystal (HW85 page 7). Port `0xEC` bit 6 picks, and port `0xFF`
  bit 6 reads it back (HW85 pages 10, 83-84).
- The ROM never sets bit 6, so the machine boots and runs Model III software
  at 2 MHz unless the software switches. We run it at 4 MHz today, so Model III
  software on our Model 4 runs at twice the right speed. TRSDOS 6 runs fast by
  default and has `SYSTEM (SLOW)` and `SYSTEM (FAST)` (SW85 page 191).
- `clockHz` is assumed constant all over: `EventScheduler` times, the FDC's
  delays, cassette sampling, sound (`setAudioValue(..., clockHz)`), the timer
  period, `scheduleNextTick()`, and the MCP tools' "seconds" (which turn into
  t-states). The cleanest model is trs80gp's: count time in fast-clock units
  and charge two per t-state in slow mode, so `tStateCount` stays a real clock
  and only the CPU's rate changes. Then the MCP tools' t-state numbers mean
  "4 MHz clocks", which needs saying.
- **Wait states on the original boards**: trs80gp's options `-m4a` (2 wait
  states per instruction), `-m4b` (1) and `-m4c` (none) model board revisions
  that stretch the opcode fetch (and on the first revision the refresh cycle
  too) in fast mode. Wikipedia says the original Model 4's effective speed is
  about 3.5 MHz and the gate array runs a true 4 MHz. HW85 agrees: on the
  original board, PAL U3 stretches the 4 MHz clock during M1 cycles (page 7),
  while the gate array divides the 20.2752 MHz crystal by 5 for a clean clock
  with a 50% duty cycle (page 24). The 2 MHz mode isn't stretched on either
  board. We add no wait states, so our timing matches the gate array. This
  matters for timing loops, music and demos, not for booting.

### 6. Real-time clock interrupt [boot]

The RTC interrupt comes from vertical sync: 30 Hz in slow mode, 60 Hz in fast
mode (HW85 page 13). We use a fixed 60 Hz (`M4_TIMER_HZ`), which is wrong in
slow mode and so for Model III software, and the DOS clocks drift if it's
wrong. In trs80gp it fires once per frame in fast mode, every other frame in
slow mode. The rest of the interrupt hardware (`0xE0` mask and status, `0xE4`
NMI, reading `0xEC` to acknowledge) is the Model III's (HW85 pages 20-21).

### 7. Floppy controller [boot]

- Same ports and drive select latch as the Model III: `0xF0`-`0xF3` for the
  controller, `0xF4` for drive select (bits 0-3 drive, 4 side, 5 precomp,
  6 wait, 7 MFM), NMI on INTRQ and motor timeout through `0xE4` (HW85
  pages 21, 50-51). We already do this.
- **Chips**: FD1793 on the original Model 4 (on a separate board; HW83
  covers two board revisions) and on the 4P (with an FDC 9216 data
  separator); WD1773 on the gate-array Model 4, 4D and gate-array 4P (HW85
  page 152). The 1773 claims full software compatibility with the 1793 (HW85
  page 261); its ready line doubles as the precompensation enable, and its
  step rates and settle time are its own. Wikipedia says it tolerates a larger
  gap between the index hole and the first sector, which matters for copy
  protection at most. A `FdcChip.WD1773` that behaves like the 1791 is likely
  enough.
- The motor-on one-shot lasts about 3 seconds (HW85 page 50);
  `MOTOR_TIME_AFTER_SELECT` is 2.
- The 4P only has drive selects 0 and 1 (HW85 page 83).
- The 4D has double-sided 40-track drives. TRSDOS 6 and LS-DOS handle
  double-sided disks, so nothing special, but use `LD4-631.DSK` and the
  double-sided DOSPLUS IV disk to test them.
- HW85 page 20 names bit 6 of the NMI mask "ENDRQ" (DRQ generates an NMI),
  while page 51 (gate array) and the Model III say motor timeout. We do the
  latter, as does trs80gp.

### 8. Sound (port 0x90)

One bit: an `OUT` to `0x90`-`0x93` latches bit 0, which drives a piezo
speaker (HW85 page 14). It was an option on the original Model 4 (standard on
the disk models) and built in later. TRSDOS 6 BASIC's `SOUND` and many games
use it (HW85 page 85 for the 4P). Feed it to `SoundPlayer` like the cassette
output. On the 4P, which has no cassette, port `0xFF` bit 0 also drives the
speaker while port `0xEC` bit 1 (cassette motor) is off (HW85 pages 83-84).

### 9. Cassette

The desktop Model 4 has the Model III's cassette circuits (500 and 1500 baud,
HW85 page 13), which we have. The 4P has none: reading port `0xFF` gives 0 in
bit 7 (HW85 page 83). The 4D has no cassette-only configuration (web), but we
don't know that it lacks the port.

### 10. Model 4P boot ROM (port 0x9C)

- 4 KB boot ROM, mapped at `0x0000`-`0x0FFF` at reset. Port `0x9C` bit 0
  maps it in (1) or out (0), and only in maps 0 and 1; maps 2 and 3 hide it
  (HW85 pages 62, 71). Page 62 says to map it out by writing `0x9C` with bit
  0 *set*, but page 71's restart example writes 1 to map it *in*, and
  trs80gp agrees with page 71.
- In map 0, `0x0000`-`0x37FF` is RAM that's read-only (it holds the Model III
  ROM image); map 1 makes it writable. Writes while the boot ROM is mapped
  in go to the RAM underneath (trs80gp).
- The boot ROM checks the boot sector to decide whether to load the Model III
  ROM image from the file `MODELx/III` on drive 0: a sector that isn't 256
  bytes, or that contains `CD xx 00` (a call into the low ROM area), means
  Model III. It jumps to `0x4300` for Model 4 software, or `0x3015` in the ROM
  image for Model III software. F1/F2/F3 force hard disk, floppy, or Model III
  mode; right Shift boots from RS-232; `P` and `N` change how the ROM image is
  handled (HW85 pages 65-70). It leaves info at `0x4055`-`0x405C` (boot type,
  sector size, function key, disk type) and has RST vectors through `0x4000`
  in RAM (HW85 pages 72-73).
- The 4P has no BASIC, so `runBasicProgram()`, `load_basic` and `boot`'s
  prompt answering don't apply unless a ROM image is loaded.
- We'd need a dump of the boot ROM to bundle.

### 11. ROM revisions

trs80gp offers two 14 KB Model 4 ROMs: the usual one (ours) and a later one it
calls "international", the default for its gate-array model. We'd need a dump
of the later one, and to compare the two before deciding whether the
gate-array and 4D configs need it.

### 12. RS-232

A TR1865 UART with a BR1943 baud-rate generator at `0xE8`-`0xEB` (HW85
pages 9, 84): optional on the single-drive Model 4, standard on the others.
Today every read returns `0xFF`. TRSDOS 6 doesn't need it to boot, but it
loads `COM/DVR` on request, and its interrupts share `0xE0` (bits 4-6). A
"no carrier, nothing received" stub is enough unless we want serial I/O.

### 13. Running programs and files

- `runCmdProgram()` resets and writes the CMD into memory under the ROM. Model
  4 programs load at `0x3000` or above and call the DOS through `RST 28H`
  SVCs (SW85 page 199), so they can't run without a booted DOS. Running a
  Model 4 `/CMD` needs a DOS disk booted first, then injecting it at the
  prompt, or a way to `RUN` it from a disk.
- `runBasicProgram()`, `loadBasicProgram()` and `getBasicProgramFromMemory()`
  use the Level II ROM's pointers (`0x40A4`, `0x40F9`); they only work in
  Model III mode. TRSDOS 6's `BASIC/CMD` is a different interpreter, and we
  believe it tokenizes programs differently from Level II, so
  `decodeBasicProgram()` probably can't read Model 4 `/BAS` files. Check with
  a disk from the suite.
- `xray.ts` and other ModelType switches in trs80-tool and the web apps need
  checking once the variants exist; with `assertNever()` the compiler will
  find most of them.

### 14. User interface

- Config: the variant, 64/128 KB RAM, and possibly the original board's
  wait-state revision, in `SettingsPanel.ts`, my-trs-80's `FileInfoTab.ts`
  and `RetroStoreTab.ts` (RetroStore's only Model 4 kind is `MODEL_4P`),
  and the MCP `boot` tool (`model: 4` plus a variant).
- Bezel: the 4P and the green-screen gate-array and 4D look different.
- The MCP server's instructions and the tool site's "mcp" section and change
  log (`site/index.html`) need updating as tools change.

### 15. Saving state

`Trs80State` must add the port `0x84` value (and `0x9C`), the 128 KB RAM,
the 2 KB video RAM, the CRTC registers, the CPU speed, and the sound bit.
Saved states from before the change must still restore.

## Suggested order

1. Memory map 0-3 with 64 KB, 2 KB video RAM, the keyboard in map 2, the
   CRTC start address, and an 80×24 headless screen. Goal: LS-DOS 6.3.1 and
   TRSDOS 6.2.1 (`simple/trs80gp/`) reach their prompts, `DIR` works, and
   DOSPLUS IV and Montezuma CP/M boot.
2. CPU speed and the RTC rate. Goal: the DOS `TIME` keeps pace with emulated
   seconds in both `SYSTEM (SLOW)` and `SYSTEM (FAST)`, and Model III software
   on a Model 4 runs at 2 MHz.
3. The web screen: 80×24, 40×24 and 32×16, inverse video, CRTC scrolling.
4. Keyboard extras (CTRL, CAPS, F1-F3) and sound.
5. 128 KB banking. Goal: an LS-DOS `MEMDISK` in banks 1 and 2 survives
   heavy use, and a 128 KB CP/M (CP/M 3, if we find one) boots.
6. The 4P: boot ROM, port `0x9C`, the `MODELA/III` path, no cassette, two
   drives, its character generator.
7. Gate-array and 4D: WD1773, the later ROM if it differs in ways that
   matter, no wait states; then the original board's wait states for timing
   accuracy.

Tests can't use the regression suite's disk images (they're private). For
each step, add a Vitest check that doesn't need a disk (port `0x84` mapping,
banking, speed switching, the RTC rate, the screen modes), and boot the
suite's system disks by hand or through the MCP server. A "boots to its
prompt" mode in `regress.ts` would catch regressions across all of them.
