; uint32_t (DEHL) mul16(uint16_t a (DE), uint16_t, b (BC))
; http://z80-heaven.wikidot.com/math#toc4
#local
mul16::
    ld      hl, 0
    ld      a, 16
loop:
    add     hl, hl
    rl      e
    rl      d
    jr      nc, skip
    add     hl, bc
    jr      nc, skip
    inc     de
skip:
    dec     a
    jr      nz, loop
    ret
#endlocal
