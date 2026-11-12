# Hi-res screen files

Files that hold a picture saved from a high-resolution graphics board. `HiResScreen.ts` decodes
them, and `trs80-tool convert` turns them into PNGs.

The files have no header, so they're recognized only by extension and size. Plenty of files with
the same extensions aren't screens: 1,024-byte `.HR` fonts, `.CHR` character sets, and `.HRG` or
`.CHR` CMD programs. A file that fails the checks below is decoded as anything else would be.

## Sources

- **The formats and extensions** come from GitHub issue #42, by Ira Goldklang, describing how
  Matthew Reed's TRSTool read them (its `Filters\Graphics.cpp`).
- **Who wrote CHR files:** the README on Tim Sewell's 1989 Christmas slide show disk says its
  pictures are in the compressed "CHR" format of Mel Patrick's GRAFPACK, and that the show runs on
  both the Radio Shack and the Micro-Labs (Grafyx) Model 4 boards.
- **Checked against real files** (November 2026): 29 `.CHR` files from that slide show, 11 `.SHR`
  and about 25 raw 19,200-byte `.HR`/`.HRG` files from the floppy regression suite and the user's
  collection. All of them decode, and a sample of each kind was converted and looked at. No
  12,288-byte Model III file has turned up, so that layout is checked only by reasoning (below)
  and a synthetic test.

## Pixels

One bit per pixel, row by row from the top. The leftmost pixel of each byte is its high bit. A 1
is a lit pixel, shown white on black.

The screens' pixels aren't square: both screens are 8/3 as wide as they are tall in pixels, shown
on a 4:3 tube, so a pixel is about twice as tall as it is wide. TRSTool showed the pictures at
2×. `trs80-tool convert` writes each row twice in its PNGs (640×480 and 512×384), and
`HiResScreen` keeps the bitmap at the screen's own resolution.

## Model 4 (`.HR`, `.HRG`): 19,200 bytes

640 × 240, 80 bytes per row, rows in order.

## Model III (`.HR`, `.HRX`): 12,288 bytes

512 × 192, 64 bytes per row. The rows are stored in the order of the Model III's text screen,
which is 16 rows of characters, each 12 scan lines tall: the file holds scan line 0 of each of the
16 character rows, then scan line 1 of each, and so on. So screen row *r* is stored at

    ((r mod 12) × 16 + floor(r / 12)) × 64

The issue gives this as "the source pointer advances by 1,024 bytes per row, modulo 12,224". That
is the same for rows 0 to 190, but for row 191 the modulo wraps to 0 instead of 12,224, which
would show row 0 again at the bottom and never read the file's last 64 bytes. We use the exact
formula. (trs80gp's notes call the Model III Grafyx board "character based", which fits; it's not
recorded which board these files came from.)

## Compressed Model 4 (`.CHR`, `.SHR`)

Run-length encoded runs that expand to the 19,200-byte Model 4 screen. Each run starts with a
control byte whose low 7 bits are a count:

- High bit set: repeat the next byte *count* times.
- High bit clear: copy the next *count* bytes.

What the real files do at the edges:

- No file has a run with a count of 0. Fonts and programs named `.CHR` have them early, so a zero
  count means the file isn't a screen.
- Every `.CHR` file ends exactly where the screen fills. Some `.SHR` files don't: one's last run
  goes 1 byte past the end of the screen (it's cut off), and six have between 10 and 316 bytes
  after the last run (in one, a copy of the file's first bytes), probably slack from whatever
  wrote them. The decoder stops when the screen is full, and accepts up to 512 bytes after it.
- A file that ends before the screen is full isn't a screen.
