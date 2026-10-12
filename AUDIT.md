# Source tree audit

An audit of the z80-\*, trs80-\* and my-trs-80 packages, mostly for correctness, with a
security pass over my-trs-80 and its Firebase rules. Items marked **(confirmed)** were
reproduced with a throwaway script; the rest come from reading the code.

Skimmed only, because they're already covered by tests or the floppy regression suite: the
generated opcode tables (`z80-inst/src/Opcodes.ts`, `z80-emulator/src/Decode.ts`), the
TRSDOS candidate scoring, the WebGL shaders, the cassette decoders, and the cassette webapp UI.
The type check and all tests passed at the time of the audit.

## Security (my-trs-80 and Firebase)

The rules reviewed are the ones in
[firestore-rules.txt](packages/my-trs-80/firestore-rules.txt). If the deployed rules differ,
recheck against those.

- [ ] **Nothing checks what gets written.** Any Google account can create unlimited documents
  with any fields, up to 1 MiB each. That's a storage and billing risk. App Check isn't
  enabled either. Probably not worth fixing given how little the site is used.
- [ ] Analytics logs every filename that's run or imported
  ([Context.ts:76](packages/my-trs-80/src/Context.ts:76),
  [YourFilesTab.ts:286](packages/my-trs-80/src/YourFilesTab.ts:286)).

No XSS found: user data always goes through `innerText`/`textContent`.

## Serious correctness bugs

- [ ] Floppy controller gaps that remain:
  - [ ] Model I double-density adapters aren't emulated. The Percom Doubler's chip-select
    commands (0xFE and 0xFF) are ignored, the Radio Shack doubler's (0x80 and 0xA0 written to
    the sector register) aren't recognized, and the Model I's drive-select write drops the
    density bit ([Trs80.ts](packages/trs80-emulator/src/Trs80.ts), `& 0x0F`). Double density
    works anyway because the controller treats double-density sectors as the adapter's WD1791
    (`getChipFor()`), accepts either density on a Model I (`canSee()`), and Write Track
    detects the density from what's written. `FdcChip` makes real adapter emulation easy,
    the way xtrs does it.
  - [ ] A blank, unformatted DMK can't be mounted, because the decoder rejects disks with no
    boot track (since 1d24cf7), so it can't be formatted either.
  - [ ] Formatting a JV1 disk fails the DOS's verify on cylinder 17, because the JV1 reader
    marks every sector there as deleted (for TRSDOS 2.3's directory).
- [ ] **Assembler, [Asm.ts](packages/z80-asm/src/Asm.ts):**
  - [ ] **It silently produces wrong code (confirmed).** If a label moves between passes,
    forward references keep the pass-1 address. This:
    ```
     ds fwd
     jp target
    fwd equ 10
    target: nop
    ```
    assembles to `jp 0x0003` instead of `jp 0x000D`. The check at
    [line 2273](packages/z80-asm/src/Asm.ts:2273) never fires, because definitions are only
    recorded in pass 1.
  - [ ] **A recursive macro or a file that includes itself runs out of memory and crashes
    (confirmed).** The IDE assembles on every keystroke, so this can freeze the tab.
  - [ ] A `#include` or other `#` directive inside a false `if` block reports "syntax error"
    ([line 1086](packages/z80-asm/src/Asm.ts:1086), confirmed).
  - [ ] Division or modulo by zero quietly gives 0
    ([line 2177](packages/z80-asm/src/Asm.ts:2177)).
- [ ] **On a Model I, the timer interrupt never fires.** `irqMask` can only be set through
  port E0, which is Model III only. The Model I branch of `interruptLatchRead`
  ([Trs80.ts:560](packages/trs80-emulator/src/Trs80.ts:560)) is unreachable, and reading
  0x37E0 always returns 0x3F ([Trs80.ts:641](packages/trs80-emulator/src/Trs80.ts:641)).

## Medium

- [ ] EI doesn't delay interrupts by one instruction
  ([GenerateOpcodes.ts:1046](packages/z80-emulator/opcodes/GenerateOpcodes.ts:1046) has a
  TODO).
- [ ] The X-ray debug server listens on 0.0.0.0 and doesn't check the WebSocket Origin
  ([xray.ts:8](packages/trs80-tool/src/xray.ts:8)). Anything on the LAN, or any web page you
  visit, can drive the emulator and read its memory. It also leaks a `setInterval` per
  connection, and serves files relative to the current directory.
- [ ] Each cassette file's binary runs into the next file's leader and sync byte, because it
  ends at `programPosition` rather than `headerPosition`
  ([Cassette.ts:336](packages/trs80-base/src/Cassette.ts:336)). Not as simple as it looks:
  `findStartOfHeader` walks back over every 0x00, so it would also take a BASIC program's
  final `00 00 00`. Needs a real way to find where each file's data ends.
- [ ] The floppy readers disagree on which single-density data address marks mean "deleted."
  DMK and the controller's Write Track count 0xF8 and 0xFA, as the WD1771's status bit does
  (`isDeletedDataAddressMark` in [TrackBytes.ts](packages/trs80-base/src/TrackBytes.ts)). JV3
  counts 0xF8, 0xF9, and 0xFA, to match xtrs
  ([Jv3FloppyDisk.ts:145](packages/trs80-base/src/Jv3FloppyDisk.ts:145)). SCP counts only 0xF8
  ([ScpFloppyDisk.ts](packages/trs80-base/src/ScpFloppyDisk.ts), `isDeleted`). The controller
  no longer depends on this, since it reads the exact mark (`SectorInfo.dataAddressMark`), but
  the decoders' directory evidence does.
- [ ] The cassette webapp creates one WebGL context per screenshot and will hit the browser's
  limit on a long tape ([TapeBrowser.ts:509](packages/trs80-cassette-webapp/src/TapeBrowser.ts:509),
  [Main.ts:96](packages/trs80-cassette-webapp/src/Main.ts:96)). my-trs-80 avoids this with
  `ScreenPool`.
- [ ] my-trs-80 stores each file whole in a Firestore document (binary plus screenshots), so
  large disk images hit the 1 MiB limit with a generic error.

## Nits

- [ ] On a Model I booted from TRSDOS 2.3 (`trsdos-2.3-sssd-1.dmk` in the regression suite),
  commands typed through `Keyboard.simulateKeyboardText()`, even `DIR`, get "WHAT?". Not
  investigated; LDOS on the Model III takes typed commands fine.
- [ ] NMI takes 13 T-states instead of 11
  ([Z80.ts:200](packages/z80-emulator/src/Z80.ts:200)).
- [ ] `decodeTrsdosWithRejections` always returns an empty list, but `info --json` reports it.
