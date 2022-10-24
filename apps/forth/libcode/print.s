    ; Print nul-terminated string at HL. Saves all registers.
#local
print::
    push hl
    push de
    push af
    jr print_check
print_loop:
    call 0x0033
    inc hl
print_check:
    ld a,(hl)
    or a
    jr nz,print_loop
    pop af
    pop de
    pop hl
    ret
#endlocal
