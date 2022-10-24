    ; Print a newline/linefeed.
#local
print_newline::
    push af
    ld a,13
    call 0x033a
    pop af
    ret
#endlocal
