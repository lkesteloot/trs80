
To generate the left/right holes:

- Load `left-hole.psd` into Photoshop.
- `File -> Export -> Quick Export as PNG`, save anywhere.
- `% convert left-hole.png -resize 30x30 -strip - | base64 | pbcopy`
- Paste into TypeScript code in `BACKGROUND_LEFT_URL` string.
- `% convert left-hole.png -flop -resize 30x30 -strip - | base64 | pbcopy`
- Paste into TypeScript code in `BACKGROUND_RIGHT_URL` string.

