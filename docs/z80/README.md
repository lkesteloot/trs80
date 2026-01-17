
To make the shifts diagram, go to the
[svgbob editor](https://ivanceras.github.io/svgbob-editor/)
paste the `shifts.txt` file, download the SVG file,
move it here, rename it `shifts.svg`, and make the following
changes:

    Replace all "fill: white" with "fill: transparent"
    Replace all "stroke: black" with "fill: #839496" (base0 in solarized)
    In ".svgbob .filled", replace "fill: black" with "fill: #839496" 
    In ".svgbob text", replace "fill: black" with "fill: #b58900" (yellow in solarized)

If the text "undocumented" (or anything else) is being clipped on
the right, make the top-level "width" attribute larger.

