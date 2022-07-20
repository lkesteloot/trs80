    ; Print the character in the L register.
#local
putc_l::
    push af
    push de
    ld a,l
    call 0x0033
    pop de
    pop af
    ret
#endlocal
