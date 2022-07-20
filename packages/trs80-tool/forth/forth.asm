; Calling convention used in this program
; ---------------------------------------
;
; Unless otherwise noted, the first parameter, and the return value are stored as follows:
; 8 bits: L
; 16 bits: HL
; 32 bits: DEHL
;
; Additional parameters are passed on the stack, left-to-right.
; Parameters and return values larger than 32 bits are passed on the stack (return value
; space set up by caller as a hidden first argument).
; Callee saves/restores any modified registers.
; Caller pops arguments after call returns.
; AF registers are scratch (caller preserves, if needed).

; To do:
; - Consider making everything case-insensitive since lower case is not the default on TRS-80.
; - Parse hex more permissively.
;     - At least parse arbitrary decimal.
;     - Bonus: Parse 0x prefix, $ prefix (hex), % prefix (binary).
;     - Error on parsing error.

; same as 'rom', except that the default fill byte for 'defs' etc. is 0x00
#target bin

#include "z80.inc"
#include "ascii.inc"

FORTH_RSTACK_SIZE   equ   256
FORTH_PSTACK_SIZE   equ   256
FORTH_CODE_SIZE     equ   16384

KEY_ENTER           equ   13
KEY_BS              equ   8

; Add a call to the function to the code pointed to by HL.
M_forth_add_code macro func
    ld      (hl), lo(&func)
    inc     hl
    ld      (hl), hi(&func)
    inc     hl
    endm

; #if defined(LOAD_LOW)
; ; Our code loads at address 0, with the full address space mapped to RAM.
; #code TEXT,0
; #else
; ; Our code loads immediately above the 16K ROM page
; #code TEXT,0x4000
; #endif
    org 0x8000

; Careful, don't put anything before "init", as this is the entry point to our code.
; When we are loaded at address 0, this is where "RST 0" sends us.
#local
init::
    di
    ; zero the DATA segment
    ld	    hl, DATA
    ld	    bc, DATA_size
    call    bzero

    call    rand_init		    ; seed RNG
    ld	    hl, hello_message	    ; print welcome banner
    call    print
    call    forth_init		    ; initialize Forth environment
    call    print_newline
loop:
    call    forth_dump_pstack       ; stack and prompt
    ld	    hl, prompt
    call    print
    call    gets                    ; get a line of code
    ld      hl, Gets_buffer
    call    forth_parse_line
    jr      loop
hello_message:
    .text   "TRS-80 Forth Compiler", CR
    .text   "(c) 2021 Lawrence Kesteloot", CR
    .text   CR
    .text   "Initializing...", NUL
prompt:
    .text   "> ", NUL
#endlocal

; void forth_init()
; - initializes the Forth interpreter/compiler.
; - Notes:
;   - We're using Direct Threaded Code (DTC).
;   - Machine register allocation:
;       - BC: TOS (top of stack)
;       - DE: IP (instruction to decode next)
;       - HL: W (working register)
;       - IX: RSP (return stack pointer)
;       - SP: PSP (parameter stack pointer)
forth_init::
    push    hl

    ; Set up parameter stack. Note that it must always have at least
    ; one item because the first thing we do is pop it off and stick
    ; it into BC.
    ld      hl, Forth_pstack+FORTH_PSTACK_SIZE
    dec     hl
    ld      (hl), 0x00
    dec     hl
    ld      (hl), 0x00
    ld      (Forth_psp), hl

    ; Set the head of the dictionary linked list.
    call    forth_init_dict

    ; Start in immediate mode. This is a two-byte variable so that it
    ; can be accessed from Forth, but throughout this code we only
    ; access its first (lower) byte.
    ld      hl, 0
    ld      (Forth_compiling), hl

    ; Default to hex for printing.
    ld      hl, 16
    ld      (Forth_base), hl

    ; Program is infinite loop to interpret words.
    ld      hl, Forth_code
    M_forth_add_code forth_interpret
    M_forth_add_code forth_native_branch
    M_forth_add_code -4

    ; Set up HERE pointer.
    ld      (Forth_here), hl

    ; Define some built-ins.
    ld      hl, Forth_init_cmd
    call    forth_parse_line

    pop     hl
    ret

Forth_init_cmd:
#insert "init.fs"
    .text   NUL

; void forth_dump_pstack()
; - dump the parameter stack contents to the console.
#local
forth_dump_pstack::
    push    hl
    push    bc
    push    de

    ; Start at the bottom of the stack.
    ld      hl, Forth_pstack+FORTH_PSTACK_SIZE
    ld      bc, (Forth_psp)

loop:
    ; See if we're done.
    or      a           ; Clear carry.
    sbc     hl, bc
    add     hl, bc
    jr      z, done

    dec     hl
    dec     hl

    ; Print (HL).
    ld      de, hl      ; Save/restore HL.
    ld      a, (hl)     ; Dereference HL.
    inc     hl
    ld      h, (hl)
    ld      l, a
    call    lcd_puthex16
    ld      hl, de

    ; Write space.
    ld      de, hl      ; Save/restore L.
    ld      l, ' '
    call    putc_l
    ld      hl, de

    jr      loop

done:
    pop     de
    pop     bc
    pop     hl
    ret
#endlocal

; void forth_parse_line(uint8_t *buffer (HL))
; - parse the gets input buffer line.
#local
forth_parse_line::
    push    hl
    push    bc
    push    de
    push    ix
    push    iy

    ; Reset input pointer to start of buffer.
    ld      (Forth_input), hl

    ; We use the Z80 stack for parameters, so save our SP so we can restore it
    ; and return to our caller even if the Forth program left junk on the
    ; parameter stack.
    ld      hl, 0
    add     hl, sp
    ld      (Forth_orig_sp), hl

    ; Take over the Z80 stack for our parameter stack.
    ld      hl, (Forth_psp)
    ld      sp, hl
    pop     bc

    ; Set up return stack.
    ld      ix, Forth_rstack+FORTH_RSTACK_SIZE

    ; Set up IP.
    ld      de, Forth_code

    ; Start the program.
    jp      forth_next

    ; Restore the SP from Forth_orig_sp before jumping here:
forth_parse_line_terminate::
    ; Save our own stack pointer.
    push    bc
    ld      hl, 0
    add     hl, sp
    ld      (Forth_psp), hl

    ; Restore the original stack pointer.
    ld      hl, (Forth_orig_sp)
    ld      sp, hl

    pop     iy
    pop     ix
    pop     de
    pop     bc
    pop     hl
    ret
#endlocal

; void forth_next()
; - code for the Forth "next" routine, which executes the instruction at IP.
#local
forth_next::
    ; W = (IP++)
    ld      a, (de)             ; Low byte of (IP)
    ld      l, a
    inc     de
    ld      a, (de)             ; High byte of (IP)
    ld      h, a
    inc     de
    ; JP (IP)
    jp      (hl)
#endlocal

; void forth_terminate()
; - terminates the interpreter
#local
forth_terminate::
    jp      forth_parse_line_terminate
#endlocal

; Format of the Forth dictionary:
;
; Link (2): Pointer to previous entry in dictionary, or NULL.
; Flags (1): Set of flags about the entry. See F_IMMED.
; Name (len(name)+1): Nul-terminated name of entry.
; Code (...): Code for the routine.

F_IMMED equ 0x01

; Macro for defining words in assembly language.
FORTH_LINK = 0
M_forth_native macro name, flags, label
FORTH_THIS_ADDR = $
    .dw     FORTH_LINK
    .db     &flags
FORTH_LINK = FORTH_THIS_ADDR
    .asciz  &name
forth_native_&label::
    endm

; Macro for defining words as a sequence of Forth native calls.
; Be sure to finish with forth_native_exit.
M_forth_word macro name, flags, label
    M_forth_native &name, &flags, &label
    call    forth_native_enter
    endm

; Macro for defining a constant. Don't put quotes around the name.
M_forth_const macro name, value
    M_forth_word "&name", 0, &name
    .dw     forth_native_lit
    .dw     &value
    .dw     forth_native_exit
    endm

; - code for entering a Forth word.
    M_forth_native "enter", 0, enter
    ; Push IP onto return address stack.
    dec     ix
    ld      (ix+0), d
    dec     ix
    ld      (ix+0), e

    ; IP = W+2. We were called here from the code field, so the stack
    ; contains the address of the next IP.
    pop     de
    jp      forth_next

; - code for exiting a Forth word.
    M_forth_native "exit", 0, exit
    ; Pop IP from return address stack.
    ld      e, (ix+0)
    inc     ix
    ld      d, (ix+0)
    inc     ix
    jp      forth_next

; - duplicates the word at the top of the parameter stack.
    M_forth_native "dup", 0, dup
    push    bc
    jp      forth_next

; - duplicates the word at the top of the parameter stack if non-zero.
; - this seems weird but it's useful for while loops where you want to
; - use this as a condition. It saves you from having to drop it later.
    M_forth_native "?dup", 0, qdup
#local
    ld      a, c
    or      a
    jr      nz, not_zero
    ld      a, b
    or      a
    jr      z, zero
not_zero:
    push    bc
zero:
    jp      forth_next
#endlocal

; - drops the top word of the stack.
    M_forth_native "drop", 0, drop
    pop     bc
    jp      forth_next

; - swaps the top two words on the stack.
    M_forth_native "swap", 0, swap
    pop     hl
    push    bc
    ld      bc, hl
    jp      forth_next

; - duplicates the second-to-last word on the stack.
    M_forth_native "over", 0, over
    pop     hl
    push    hl
    push    bc
    ld      bc, hl
    jp      forth_next

; - rotates the stack: ( a b c -- b c a )
    M_forth_native "rot", 0, rot
    pop     hl
    ld      (Forth_tmp1), hl        ; "b" above
    pop     hl
    ld      (Forth_tmp2), hl        ; "a" above
    ld      hl, (Forth_tmp1)
    push    hl
    push    bc
    ld      bc, (Forth_tmp2)
    jp      forth_next

; - rotates the stack: ( a b c -- c a b )
    M_forth_native "-rot", 0, negrot
    pop     hl
    ld      (Forth_tmp1), hl        ; "b" above
    pop     hl                      ; "a" above
    push    bc
    push    hl
    ld      bc, (Forth_tmp1)
    jp      forth_next

; - reads the pointer at the top of the stack.
    M_forth_native "@", 0, at
    ld      hl, bc
    ld      bc, (hl)
    jp      forth_next

; - writes the pointer at the top of the stack (push value, address).
    M_forth_native "!", 0, bang
    ld      hl, bc
    pop     bc
    ld      (hl), bc
    pop     bc
    jp      forth_next

; - reads the port at the top of the stack.
    M_forth_native "io@", 0, ioat
    in      c, (c)
    ld      b, 0
    jp      forth_next

; - writes the port at the top of the stack (push value, address).
    M_forth_native "io!", 0, iobang
    pop     hl
    out     (c), l
    pop     bc
    jp      forth_next

; - bit-wise ands the top two entries in the parameter stack.
    M_forth_native "and", 0, and
    pop     hl
    ld      a, c
    and     l
    ld      c, a
    ld      a, b
    and     h
    ld      b, a
    jp      forth_next

; - bit-wise ors the top two entries in the parameter stack.
    M_forth_native "or", 0, or
    pop     hl
    ld      a, c
    or      l
    ld      c, a
    ld      a, b
    or      h
    ld      b, a
    jp      forth_next

; - bit-wise inverts top entry in the parameter stack.
    M_forth_native "invert", 0, invert
    ld      a, c
    cpl
    ld      c, a
    ld      a, b
    cpl
    ld      b, a
    jp      forth_next

; - shift the top stack entry right eight bits.
    M_forth_native "8>>", 0, shift_right
    ld      c, b
    ld      b, 0
    jp      forth_next

; - shift the top stack entry left eight bits.
    M_forth_native "8<<", 0, shift_left
    ld      b, c
    ld      c, 0
    jp      forth_next

; - adds the top two entries in the parameter stack.
    M_forth_native "+", 0, add
    pop     hl
    add     hl, bc
    ld      bc, hl
    jp      forth_next

; - subtracts the top two entries in the parameter stack (a b -- a-b)
    M_forth_native "-", 0, sub
    pop     hl
    or      a           ; Clear carry.
    sbc     hl, bc
    ld      bc, hl
    jp      forth_next

; - multiplies the top two entries on the parameter stack.
    M_forth_native "*", 0, mul
    ld      (Forth_orig_de), de
    pop     de
    call    mul16
    ld      bc, hl      ; Drop higher 16 bits.
    ld      de, (Forth_orig_de)
    jp      forth_next

; - computes the remainder and quotient of the top two stack entries (n, d).
; - (n d -- q r)
    M_forth_native "/mod", 0, divmod
    ld      (Forth_orig_de), de
    ld      de, bc
    pop     bc
    ld      a, b
    ; The following routine divides AC by DE and places the quotient in AC and
    ; the remainder in HL.
    call    divmod16
    push    hl
    ld      b, a
    ld      de, (Forth_orig_de)
    jp      forth_next

; - determines if the top two stack entries are the same, leaving 0 or 1.
    M_forth_native "=", 0, equ
#local
    pop     hl
    or      a           ; Clear carry.
    sbc     hl, bc
    ld      bc, 0
    jr      nz, not_equal
    inc     bc
not_equal:
    jp      forth_next
#endlocal

; - computes < for the top two stack entries.
    M_forth_native "<", 0, lt
#local
    pop     hl
    or      a           ; Clear carry.
    sbc     hl, bc
    ld      bc, 0
    jr      nc, not_less_than
    inc     bc
not_less_than:
    jp      forth_next
#endlocal

; - prints the number on the top of the stack.
    M_forth_native ".", 0, dot
    ld      hl, bc
    pop     bc
    call    lcd_puthex16
    ld      l, ' '
    call    putc_l
    jp      forth_next

; - prints the lowest byte of the number on the top of the stack.
    M_forth_native ".b", 0, dot_byte
    ld      hl, bc
    pop     bc
    call    lcd_puthex8
    ld      l, ' '
    call    putc_l
    jp      forth_next

; - prints the character at the top of the stack.
    M_forth_native "emit", 0, emit
    ld      l, c
    call    putc_l
    pop     bc
    jp      forth_next

; - prints the string whose address is on the top of the stack.
    M_forth_native "tell", 0, tell
    ld	    (Forth_orig_hl), hl
    ld      hl, bc
    call    print
    ld	    hl, (Forth_orig_hl)
    pop     bc
    jp      forth_next

; - prints a cr/lf combo.
    M_forth_native "cr", 0, cr
    call    print_newline
    jp      forth_next

; - pushes the next word onto the parameter stack.
    M_forth_native "lit", 0, lit
    push    bc
    ld      hl, de
    ld      bc, (hl)
    inc     de
    inc     de
    jp      forth_next

; - adds the word at the top of the stack to our code.
    M_forth_native ",", 0, comma
    ld      hl, bc
    call    forth_comma
    pop     bc
    jp      forth_next

; - adds the word in HL to our code.
forth_comma:
    push    bc
    ld      bc, hl
    ld      hl, (Forth_here)
    ld      (hl), bc
    inc     hl
    inc     hl
    ld      (Forth_here), hl
    pop     bc
    ret

; Go into immediate (non-compiling) mode.
    M_forth_native "[", F_IMMED, lbrac
    xor     a
    ld      (Forth_compiling), a
    jp      forth_next

; Go into compiling mode.
    M_forth_native "]", 0, rbrac
    ld      a, 1
    ld      (Forth_compiling), a
    jp      forth_next

; - put the address of the code of the word that's next in
; - the stream onto the stack. This version only works
; - in compiled mode. There's another version that uses
; - word, find, and cfa, but I think it only works in
; - immediate mode, and I don't need it then. See below.
; - Note that this version has identical code to the "lit"
; - word, so we could just use that instead?
    M_forth_native "'", 0, tick
    push    bc
    ld      hl, de
    ld      bc, (hl)
    inc     de
    inc     de
    jp      forth_next

; Immediate mode version:
;;    call    forth_word
;;    call    forth_find
;;    call    forth_cfa
;;    push    bc
;;    ld      bc, hl
;;    jp      forth_next

; - lists code memory.
    M_forth_native "code", 0, code
#local
    push    bc
    ld      hl, Forth_code      ; Start.
    ld      bc, (Forth_here)    ; End.

loop:
    ; See if we're done.
    or      a           ; Clear carry.
    sbc     hl, bc
    add     hl, bc
    jr      z, done

    ; Dereference HL.
    ld      a, (hl)
    push    hl
    ld      l, a

    ; Print.
    call    lcd_puthex8
    ld      l, ' '
    call    putc_l

    ; Next word.
    pop     hl
    inc     hl
    jr      loop

done:
    call    print_newline
    pop     bc
    jp      forth_next
#endlocal

; - creates a new entry in the dictionary.
; - the top of the stack has the name.
    M_forth_native "create", 0, create
#local
    ld      hl, (Forth_here)

    ; Set up next-word pointer.
    push    de
    ld      de, (Forth_dict)
    ld      (hl), de
    pop     de
    ; Write our new linked list head.
    ld      (Forth_dict), hl
    ; Skip link pointer.
    inc     hl
    inc     hl

    ; Write flags. Default to zero.
    ld      (hl), 0
    inc     hl

    ; Copy name from BC (top of stack).
loop:
    ld      a, (bc)
    ld      (hl), a
    inc     hl
    inc     bc
    or      a
    jr      nz, loop

    ; Add a "call" instruction. We'll fill in the address later from Forth itself.
    ld      (hl), 0xCD   ; opcode(call NN)
    inc     hl

    ; Write back our new "here".
    ld      (Forth_here), hl
    pop     bc
    jp      forth_next
#endlocal

; - skips the header of a dictionary entry.
    M_forth_native ">cfa", 0, cfa
    ld      hl, bc
    call    forth_cfa
    ld      bc, hl
    jp      forth_next

; - skips the header of a dictionary entry.
#local
forth_cfa::
    ; HL is pointing to the start of the dictionary entry.
    ; Skip the link pointer and flags.
    inc     hl
    inc     hl
    inc     hl

    ; Skip the nul-terminated string.
loop:
    ld      a, (hl)
    inc     hl
    or      a
    jr      nz, loop

    ret
#endlocal


; - gets the next word from the input stream and puts its address
; - on the parameter stack.
    M_forth_native "word", 0, word
    push    bc
    call    forth_word
    ld      bc, hl
    jp      forth_next

; - gets the next word from the input stream and returns its address in HL.
; - The pointer will point to a NUL byte if we're at the end of the buffer.
#local
forth_word::
    push    de
    ld      hl, (Forth_input)

    ; Skip whitespace and comments.
whitespace_loop:
    ld      a, (hl)
    cp      ' '
    jr      z, whitespace
    cp      HT
    jr      z, whitespace
    cp      LF
    jr      z, whitespace
    cp      CR
    jr      z, whitespace
    cp      0x5C ; backslash
    jr      nz, end_of_whitespace

    ; Just saw backslash, read until end of line or end of buffer.
comment_loop:
    inc     hl
    ld      a, (hl)
    cp      NUL
    jr      z, end_of_whitespace
    cp      LF
    jr      z, whitespace
    cp      CR
    jr      nz, comment_loop

whitespace:
    inc     hl
    jr      whitespace_loop

end_of_whitespace:
    ; Copy word
    ld      de, Forth_word
word_loop:
    ld      a, (hl)
    cp      ' '
    jr      z, end_of_word
    cp      LF
    jr      z, end_of_word
    cp      CR
    jr      z, end_of_word
    cp      0x5C ; backslash
    jr      z, end_of_word
    cp      NUL
    jr      z, end_of_word
    ld      (de), a
    inc     hl
    inc     de
    jr      word_loop

end_of_word:
    ; NUL-terminate word.
    ld      a, NUL
    ld      (de), a

    ; Record new position.
    ld      (Forth_input), hl

    ld      hl, Forth_word
    pop     de
    ret
#endlocal

; - skips over the number of bytes specified at the IP.
    M_forth_native "branch", 0, branch
    push    bc
forth_native_branch_tail::
    ld      hl, de
    ld      bc, (hl)
    add     hl, bc
    ld      de, hl
    pop     bc
    jp      forth_next

; - skips over the number of bytes specified at the IP if TOS is zero.
    M_forth_native "0branch", 0, 0branch
#local
    ; Check top of stack (BC).
    ld      a, b
    or      a
    jr      nz, no_skip
    ld      a, c
    or      a
    jp      z, forth_native_branch_tail

no_skip:
    ; Still need to skip the count itself.
    inc     de
    inc     de
    pop     bc
    jp      forth_next
#endlocal

; - finds the string at the top of the stack in the dictionary.
; - returns a pointer to the dictionary entry or NULL if not found.
    M_forth_native "find", 0, find
    ld      hl, bc
    call    forth_find
    ld      bc, hl
    jp      forth_next

; - toggles the immediate flag of the most recently defined word.
    M_forth_native "immediate", F_IMMED, immediate
    ; Get most recent word.
    ld      hl, (Forth_dict)
    ; Skip link.
    inc     hl
    inc     hl
    ; Toggle immediate flag.
    ld      a, (hl)
    xor     F_IMMED
    ld      (hl), a
    jp      forth_next

; - starts a definition of a new word.
    M_forth_word ":", 0, colon
    .dw     forth_native_word
    .dw     forth_native_create
    .dw     forth_native_lit
    .dw     forth_native_enter
    .dw     forth_native_comma
    .dw     forth_native_rbrac
    .dw     forth_native_exit

; - end a definition of a new word.
    M_forth_word ";", F_IMMED, semicolon
    .dw     forth_native_lit
    .dw     forth_native_exit
    .dw     forth_native_comma
    .dw     forth_native_lbrac
    .dw     forth_native_exit

; - plot a pixel.
    M_forth_native "gfx_set", 0, rnd
    jp      forth_next

; - pushes a random 16-bit number onto the stack.
    M_forth_native "rnd", 0, rnd
    push    bc
    call    rand16
    ld      bc, hl
    jp      forth_next

; - pushes a random number mod N onto the stack.
    M_forth_native "rndn", 0, rndn
    ld	    hl, bc
    call    rand16_modn
    ld      bc, hl
    jp      forth_next

; - blocks and reads a character from the keyboard.
    M_forth_native "key", 0, key
    push    bc
    ld      (Forth_orig_de), de
    call    0x0049
    ld      de, (Forth_orig_de)
    ld      c, a
    ld      b, 0
    jp      forth_next

; - various constants.
    M_forth_const gfx_width, 128
    M_forth_const gfx_height, 48
    M_forth_const latest, Forth_dict
    M_forth_const state, Forth_compiling
    M_forth_const here, Forth_here
    M_forth_const base, Forth_base

; - Read the stack pointer.
    M_forth_native "dsp@", 0, dsp_read
    push    bc
    ld      hl, 0
    add     hl, sp
    ld      bc, hl
    jp      forth_next

; - finds the string pointed to by HL in the dictionary.
; - returns a pointer to the dictionary entry or NULL if not found.
#local
forth_find::
    push    bc
    ld      bc, hl

    ; Start at head of linked list.
    ld      hl, (Forth_dict)

loop:
    ; See if HL is null.
    ld      a, l
    or      a
    jp      nz, not_null
    ld      a, h
    or      a
    jp      z, done

not_null:
    ; Point to name of routine.
    inc     hl
    inc     hl
    inc     hl

    ; BC and HL are both now pointing to strings. Compare them.
    ; The result is in the zero flag.
    call    forth_strequ

    ; Point back to link pointer. These don't modify the zero flag.
    dec     hl
    dec     hl
    dec     hl

    ; forth_strequ puts the result in the zero flag, where set means equal.
    jp      z, done

    ; Jump to next entry in linked list.
    ld      a, (hl)
    inc     hl
    ld      h, (hl)
    ld      l, a

    jp      loop

done:
    pop     bc
    ret
#endlocal

; - grabs the next word and processes it (runs it or compiles it).
#local
forth_interpret::
    ; Parse the next space-delimited word.
    call    forth_word

    ; See if we're at the end of the input buffer.
    ld      a, (hl)
    or      a
    jp      z, forth_terminate

    ; Save name for later (number parsing).
    push    hl

    ; Find it in the dictionary.
    call    forth_find

    ; See if it was found.
    ld      a, l
    or      a
    jr      nz, found
    ld      a, h
    or      a
    jr      nz, found

    ; Not found, parse as number and push it.
    pop     hl
    call    parse_decimal
    jr      nz, word_not_found

    ; It's a number. Check if we're in immediate mode.
    ld      a, (Forth_compiling)
    or      a
    jr      z, not_found_immediate

    ; Compile IMM.
    push    hl
    ld      hl, forth_native_lit
    call    forth_comma

    ; Compile number.
    pop     hl
    call    forth_comma
    jp      forth_next

not_found_immediate:
    ; Push parsed value.
    push    bc
    ld      bc, hl
    jp      forth_next

word_not_found:
    ; Not found, display error message.
    ld	    (Forth_orig_hl), hl
    ld      hl, word_not_found_error_message
    call    print
    ld      hl, Forth_word
    call    print
    call    print_newline
    ld	    hl, (Forth_orig_hl)
    jp      forth_terminate

found:
    ; Throw away saved name, we don't need it if it was found.
    inc     sp
    inc     sp

    ; Check if we're in immediate mode.
    ld      a, (Forth_compiling)
    or      a
    jr      z, found_immediate

    ; Check immediate flag of word.
    push    hl
    inc     hl
    inc     hl
    ld      a, (hl)
    pop     hl
    and     F_IMMED
    jr      nz, found_immediate

    ; We're compiling it.
    call    forth_cfa
    call    forth_comma
    jp      forth_next

found_immediate:
    ; Move to code for word and execute it.
    call    forth_cfa
    jp      (hl)

word_not_found_error_message:
    .text   "Word not found: ", NUL
#endlocal

; void forth_strequ()
; - compares nul-terminated strings in HL and BC.
; - puts the result in the zero flag (set = equal, cleared = not equal).
#local
forth_strequ::
    push    hl
    push    bc

loop:
    ; Compare the characters.
    ld      a, (bc)
    cp      (hl)
    jr      nz, done

    ; They're equal, see if we're done.
    or      a
    jr      z, done

    inc     hl
    inc     bc
    jr      loop

done:
    pop     bc
    pop     hl
    ret
#endlocal

; void forth_init_dict()
; - initialize the Forth dictionary, erasing all dynamically-created words.
; - This routine needs to be placed after all uses of the macro M_forth_native.
forth_init_dict::
    push    hl
    ; Initialize dictionary linked list pointer.
    ld      hl, Forth_dict
    ld      (hl), lo(FORTH_LINK)
    inc     hl
    ld      (hl), hi(FORTH_LINK)
    pop     hl
    ret

; uint16_t parse_decimal(char *s)
; - parses a 16-bit decimal or hex (with "0x" prefix) nul-terminated number, into HL.
; - NZ if parsing failed.
; Based on code from "More TRS-80 Assembly Language Programming", page 154.
#local
parse_decimal::
    push    ix
    push    de

    ld      ix, 0           ; Accumulation value

loop:
    ld      a, (hl)         ; Next character
    or      NUL             ; Compare to NUL
    jr      z, exit         ; Done parsing

    add     ix, ix          ; acc*2
    push    ix
    add     ix, ix          ; acc*4
    add     ix, ix          ; acc*8
    pop     de              ; acc*2
    add     ix, de          ; acc*10

    sub     a, 0x30         ; Subtract '0'
    jp      m, error_exit   ; Less than '0', error
    cp      10              ; Compare to 10
    jp      p, error_exit   ; Greater than '9', error

    ld      e, a            ; Into E
    ld      d, 0            ; Into DE
    add     ix, de          ; Add to accumulator
    inc     hl              ; Next character

    jp      loop

error_exit:
    ld      a, 1            ; Set NZ, not sure if there's an easier way to do this
    or      a

exit:
    push    ix              ; Move accumulator to HL
    pop     hl

    pop     de
    pop     ix
    ret
#endlocal

; uint16_t parse_hex16(char *s)
; - parses a 16-bit hex value from "s".
#local
parse_hex16::
    push    de

    ; Parse high byte.
    ld      de, hl
    call    parse_hex8

    ; Parse low byte.
    ex      de, hl
    inc     hl
    inc     hl
    call    parse_hex8

    ; Combine bytes.
    ld      h, e

    pop     de
    ret
#endlocal

; uint8_t parse_hex8(char *s)
; - parses an 8-bit hex value from "s".
#local
parse_hex8::
    push    bc

    ; Parse first nybble.
    ld      a, (hl)
    call    hex2bin

    ; Shift left into high nybble.
    add	    a
    add	    a
    add	    a
    add	    a
    ld	    b, a

    ; Parse second nybble.
    inc     hl
    ld      a, (hl)
    call    hex2bin

    ; Combine nybbles.
    or      b
    ld      l, a

    pop     bc
    ret
#endlocal

; void lcd_putdec16(uint16_t value)
; - writes a 16-bit decimal value to the LCD
#local
lcd_putdec16::
    push    bc
    push    hl
    ld      bc, -10000
    call    handle_digit
    ld      bc, -1000
    call    handle_digit
    ld      bc, -100
    call    handle_digit
    ld      c, -10
    call    handle_digit
    ld      c, -1
    call    handle_digit
    pop     hl
    pop     bc
    ret

handle_digit:
    ld      a, '0'-1
increment_digit:
    inc     a
    add     hl, bc
    jr      c, increment_digit
    sbc     hl, bc
    push    hl
    ld      l, a
    call    putc_l
    pop     hl
    ret
#endlocal

; void gets()
; - reads a line of text from keyboard, not including newline, into Gets_buffer.
; - leaves the buffer nul-terminated.
#local
gets::
    push    hl
    push    bc
    push    de

    ld      hl,Gets_buffer
    ld      b,Gets_buffer_sz-1
    call    0x0040                  ; $KBLINE
    jr      nc,not_break

    ; Break was pressed, empty the buffer.
    jr      found

not_break:
    ; Find CR and replace with nul.
    ld      a,(hl)
    cp      13
    jr      z,found
    inc     hl
    jr      not_break

found:
    ld      (hl),0

    pop	    de
    pop	    bc
    pop     hl
    ret
#endlocal

; void lcd_puthex8(uint8_t value)
; - write an 8-bit hex value to the LCD
lcd_puthex8::
    push    hl
    ld	    h, l
    ld	    a, l
    rrca
    rrca
    rrca
    rrca
    call    bin2hex
    ld	    l, a
    call    putc_l
    ld	    a, h
    call    bin2hex
    ld	    l, a
    call    putc_l
    pop	    hl
    ret

; void lcd_puthex16(uint16_t value)
; - write a 16-bit hex value to the LCD
lcd_puthex16::
    push    hl
    ld      l, h
    call    lcd_puthex8
    pop     hl
    jr	    lcd_puthex8

; void strcpy(uint8_t *dst (HL), uint8_t *src (BC))
; strings are NUL-terminated.
; XXX this routine hasn't been tested.
;#local
;strcpy::
;    push    hl
;    push    bc
;
;loop:
;    ld      a, (bc)
;    ld      (hl), a
;    inc     hl
;    inc     bc
;    or      a
;    jr      nz, loop
;
;    pop     bc
;    pop     hl
;
;    ret
;#endlocal

#include library "libcode"

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
; data segment immediately follows code
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

DATA:
; define static variables here
Gets_buffer:: defs 100  ; input buffer for gets() routine
Gets_buffer_sz	equ $-Gets_buffer

Forth_orig_sp:: defs 2  ; Save the calling program's SP.
Forth_dict:: defs 2     ; Pointer to dictionary linked list.
Forth_here:: defs 2     ; Pointer to next available space in Forth_code.
Forth_psp:: defs 2      ; Pointer into Forth_pstack.
Forth_input:: defs 2    ; Pointer to input buffer.
Forth_compiling:: defs 2 ; Whether compiling (vs. immediate mode). (Normally called STATE.)
Forth_orig_de:: defs 2  ; Temporary for saving DE.
Forth_orig_hl:: defs 2  ; Temporary for saving HL.
Forth_tmp1:: defs 2     ; Temporary.
Forth_tmp2:: defs 2     ; Temporary.
Forth_base:: defs 2     ; Current base for printing numbers.
Forth_word:: defs 32    ; Typical max length of Forth word.
Forth_code:: defs FORTH_CODE_SIZE
Forth_rstack:: defs FORTH_RSTACK_SIZE
Forth_pstack:: defs FORTH_PSTACK_SIZE

#include library "libdata"

DATA_size	equ $-DATA

    end init
