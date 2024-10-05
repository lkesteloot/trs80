; uint16_t rand16()
; Inputs:
;   (rand16_seed1) contains a 16-bit seed value
;   (rand16_seed2) contains a NON-ZERO 16-bit seed value
; Outputs:
;   HL is the result
;   BC, DE is preserved
; Destroys:
;   AF
; cycle: 4,294,901,760 (almost 4.3 billion)
; 160cc
; 26 bytes
rand16::
    push bc
    ld hl,(rand16_seed1)
    ld b,h
    ld c,l
    add hl,hl
    add hl,hl
    inc l
    add hl,bc
    ld (rand16_seed1),hl
    ld hl,(rand16_seed2)
    add hl,hl
    sbc a,a
    and 0b00101101
    xor l
    ld l,a
    ld (rand16_seed2),hl
    add hl,bc
    pop bc
    ret
