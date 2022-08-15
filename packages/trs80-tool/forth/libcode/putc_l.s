    ; Print the character in the L register.
#local
putc_l::
    push de
    ld a,l
    call 0x0033
    pop de
    ret
#endlocal
