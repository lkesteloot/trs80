SCREEN_WIDTH equ 64
SCREEN_HEIGHT equ 16
SCREEN_BEGIN equ 0x3C00
SCREEN_SIZE equ SCREEN_WIDTH*SCREEN_HEIGHT
SCREEN_END equ SCREEN_BEGIN+SCREEN_SIZE
CURSOR_CHAR equ 128+16+32
CLEAR_CHAR equ 32
BS equ 8
NL equ 10
INPUT_BUFFER_SIZE equ 64		; Including nul.
BINARY_SIZE equ 1024			; Compiled code.
KEYBOARD_BEGIN equ 0x3800
CURSOR_HALF_PERIOD equ 7
CURSOR_DISABLED equ 0xFF

; Z80 opcodes.
I_LD_DE_IMM equ 0x11
I_LD_D_H equ 0x54
I_LD_E_L equ 0x5D
I_JP equ 0xC3
I_RET equ 0xC9
I_CALL equ 0xCD
I_POP_DE equ 0xD1

; Basic tokens.
T_END equ 0x80
T_FIRST_STMT equ T_END 			; First statement.
T_FOR equ 0x81
T_RESET equ 0x82
T_SET equ 0x83
T_CLS equ 0x84
T_CMD equ 0x85
T_RANDOM equ 0x86
T_NEXT equ 0x87
T_DATA equ 0x88
T_INPUT equ 0x89
T_DIM equ 0x8A
T_READ equ 0x8B
T_LET equ 0x8C
T_GOTO equ 0x8D
T_RUN equ 0x8E
T_IF equ 0x8F
T_RESTORE equ 0x90
T_GOSUB equ 0x91
T_RETURN equ 0x92
T_REM equ 0x93
T_STOP equ 0x94
T_ELSE equ 0x95
T_TRON equ 0x96
T_TROFF equ 0x97
T_DEFSTR equ 0x98
T_DEFINT equ 0x99
T_DEFSNG equ 0x9A
T_DEFDBL equ 0x9B
T_LINE equ 0x9C
T_EDIT equ 0x9D
T_ERROR equ 0x9E
T_RESUME equ 0x9F
T_OUT equ 0xA0
T_ON equ 0xA1
T_OPEN equ 0xA2
T_FIELD equ 0xA3
T_GET equ 0xA4
T_PUT equ 0xA5
T_CLOSE equ 0xA6
T_LOAD equ 0xA7
T_MERGE equ 0xA8
T_NAME equ 0xA9
T_KILL equ 0xAA
T_LSET equ 0xAB
T_RSET equ 0xAC
T_SAVE equ 0xAD
T_SYSTEM equ 0xAE
T_LPRINT equ 0xAF
T_DEF equ 0xB0
T_POKE equ 0xB1
T_PRINT equ 0xB2
T_CONT equ 0xB3
T_LIST equ 0xB4
T_LLIST equ 0xB5
T_DELETE equ 0xB6
T_AUTO equ 0xB7
T_CLEAR equ 0xB8
T_CLOAD equ 0xB9
T_CSAVE equ 0xBA
T_NEW equ 0xBB
T_LAST_STMT equ T_NEW 			; Last statement.
T_TAB_PAREN equ 0xBC
T_TO equ 0xBD
T_FN equ 0xBE
T_USING equ 0xBF
T_VARPTR equ 0xC0
T_USR equ 0xC1
T_ERL equ 0xC2
T_ERR equ 0xC3
T_STRING_STR equ 0xC4
T_INSTR equ 0xC5
T_POINT equ 0xC6
T_TIME_STR equ 0xC7
T_MEM equ 0xC8
T_INKEY_STR equ 0xC9
T_THEN equ 0xCA
T_NOT equ 0xCB
T_STEP equ 0xCC
T_OP_ADD equ 0xCD
T_OP_SUB equ 0xCE
T_OP_MUL equ 0xCF
T_OP_DIV equ 0xD0
T_OP_BRACKET equ 0xD1
T_AND equ 0xD2
T_OR equ 0xD3
T_OP_GT equ 0xD4
T_OP_EQU equ 0xD5
T_OP_LT equ 0xD6
T_SGN equ 0xD7
T_INT equ 0xD8
T_ABS equ 0xD9
T_FRE equ 0xDA
T_INP equ 0xDB
T_POS equ 0xDC
T_SQR equ 0xDD
T_RND equ 0xDE
T_LOG equ 0xDF
T_EXP equ 0xE0
T_COS equ 0xE1
T_SIN equ 0xE2
T_TAN equ 0xE3
T_ATN equ 0xE4
T_PEEK equ 0xE5
T_CVI equ 0xE6
T_CVS equ 0xE7
T_CVD equ 0xE8
T_EOF equ 0xE9
T_LOC equ 0xEA
T_LOF equ 0xEB
T_MKI_STR equ 0xEC
T_MKS_STR equ 0xED
T_MKD_STR equ 0xEE
T_CINT equ 0xEF
T_CSNG equ 0xF0
T_CDBL equ 0xF1
T_FIX equ 0xF2
T_LEN equ 0xF3
T_STR_STR equ 0xF4
T_VAL equ 0xF5
T_ASC equ 0xF6
T_CHR_STR equ 0xF7
T_LEFT_STR equ 0xF8
T_RIGHT_STR equ 0xF9
T_MID_STR equ 0xFA

	.org 0x0000
	di
	jp soft_boot

	.org 0x0008
	nop

	.org 0x0010
	nop

	.org 0x0018
	nop

	.org 0x0020
	nop

	.org 0x0028
	nop

	.org 0x0030
	nop

	; Non-maskable interrupt routine.
	.org 0x0038
	call handle_maskable_interrupt
	; ei must be here, not in routine.
	ei
	reti

soft_boot:
	; Configure stack. Assume 48 kB of RAM.
	ld sp,0x0000

	; Clear BSS.
	ld hl,bss_start
	ld de,bss_start+1
	ld bc,bss_end-bss_start-1
	ld (hl),0
	ldir

	; Configure cursor.
	ld hl,SCREEN_BEGIN
	ld (cursor),hl
	ld hl,cursor_counter
	ld (hl),CURSOR_DISABLED

	; Configure the random number generator.
	ld a,1				; Any non-zero number is fine.
	ld (rnd_seed),a

	; Configure and enable interrupts.
	im 1 				; rst 38 on maskable interrupt.
	ld a,0x04
	out (0xE0),a 			; Enable timer interrupt.
	ei

	; Clear the screen; home cursor.
	call cls
	
	; Write boot message.
	ld hl,boot_message
	call write_text

prompt_loop:
	ld (ready_prompt_sp),sp		; Save stack for unwinding.

	ld hl,ready_prompt
	call write_text

	ld hl,line_prompt
	call write_text

	ld hl,input_buffer
	ld b,INPUT_BUFFER_SIZE
	call read_text
	ld a,(KEYBOARD_BEGIN + 128)	; See if Shift-Enter was pressed.
	and a,0x03			; Either shift.
	ld (debug_output),a		; Save whether to print debugging output.	
	call tokenize
	; call detokenize
	; ld a,NL
	; call write_char
	ld de,hl			; Address of tokenized program.
	ld hl,binary
	call compile_line
	ld (hl),I_RET
	inc hl
	ld a,(debug_output)
	or a,a
	jp nz,print_binary
	call binary
	jp prompt_loop

; Print the contents of the binary. It starts at "binary" and ends at "hl".
print_binary:
	ld de,hl			; Save end of buffer.
	ld hl,binary
print_binary_loop:
	ld a,(hl)
	call write_hex_byte
	ld a,' '
	call write_char
	inc hl
	; Loop if HL != DE.
	ld a,h
	cp a,d
	jp nz,print_binary_loop
	ld a,l
	cp a,e
	jp nz,print_binary_loop
	; End of debug print.
	ld a,NL
	call write_char
	jp prompt_loop

; Jump here on a parse/compile error. DE should point to the
; location in the tokenized program where the error occurred.
compile_error:
	; TODO handle DE being at the end of the buffer (pointing to nul).
	ld hl,syntax_error_msg_part1
	call write_text
	ld a,(de)
	call detokenize_char
	ld hl,syntax_error_msg_part2
	call write_text
	; Fallthrough

; Jump here from END token or when we run off the end of the program.
end:
	ld sp,(ready_prompt_sp)
	jp prompt_loop

; Clear the screen and reset the cursor to the top-left corner.
cls:
#local
	push hl
	push de
	push bc

	call disable_cursor
	
	ld hl,SCREEN_BEGIN
	ld (cursor),hl
	ld (hl),CLEAR_CHAR
	ld de,SCREEN_BEGIN+1
	ld bc,SCREEN_SIZE-1

	ldir

	pop bc
	pop de
	pop hl

	call enable_cursor
	
	ret
#endlocal

; Detokenize and write the contents of the program.
list:
#local
	push hl
	ld hl,program
loop:
	ld e,(hl)			; Grab address of next line.
	inc hl
	ld d,(hl)
	inc hl
	ld a,e				; See if it's null.
	or a,d
	jp z,done			; Null next pointer means no line here.
	ld c,(hl)			; Grab line number.
	inc hl
	ld b,(hl)
	inc hl
	push hl
	ld hl,bc
	call write_decimal_word		; Write the line number.
	pop hl
	ld a,' '
	call write_char
	call detokenize			; Write the line.
	ld a,NL
	call write_char
	ld hl,de
	jp loop
done:
	pop hl
	ret
#endlocal

; Compile the stored program and run it.
run:
#local
	push hl
	push bc
	push de
	push ix
	ld ix,program
	ld hl,binary + 30		; TODO
loop:
	ld c,(ix)			; Grab address of next line.
	inc ix
	ld b,(ix)
	inc ix
	ld a,b				; See if it's null.
	or a,c
	jp z,done			; Null next pointer means no line here.
	push bc				; Push address of next line.
	inc ix				; Skip line number.
	inc ix
	ld e,ixl			; Compile wants source in DE.
	ld d,ixh
	call compile_line		; Writes to HL.
	pop ix				; Pop address of next line (was pushed as BC).
	jp loop
done:
	; Clean up the stack and return to the ready prompt.
	ld (hl),I_JP
	inc hl
	ld (hl),lo(end)
	inc hl
	ld (hl),hi(end)
	inc hl
	ld a,(tron_flag)
	or a,a
	jp nz,print_binary
	call binary + 30 ; TODO
	pop ix
	pop de
	pop bc
	pop hl
	ret
#endlocal

; Enable debug mode.
tron:
#local
	ld a,1
	ld (tron_flag),a
	ret
#endlocal

; Disable debug mode.
troff:
#local
	xor a
	ld (tron_flag),a
	ret
#endlocal

; Tokenize the string at HL in-place, nul-terminating the result.
; TODO this routine is *much* slower than the TRS-80's. Compare it to theirs (CRUNCH).
; Maybe: Skip spaces and digits. (But not symbols.)
tokenize:
#local
	push hl
	push bc
	ld bc,hl			; BC = output pointer.
loop:
	ld a,(hl)			; See if we're done with string.
	or a,a
	jp z,done

	; See if HL starts with any token in the token list, case-insensitively.
	call find_token
	or a,a
	jp z,not_token
	ld (bc),a
	inc bc
	jp loop

not_token:
	; TODO check for comment.
	ld a,(hl)
	call to_upper
	ld (bc),a
	inc hl
	inc bc
	cp a,'"'			; See if it's a string.
	jp nz,loop
string_loop:
	; It's a string, copy to end of string or line (no embedded quotes).
	ld a,(hl)
	or a,a
	jp z,done			; End of line.
	ld (bc),a
	inc hl
	inc bc
	cp a,'"'			; Check end of string.
	jp nz,string_loop
	jp loop

done:
	ld (bc),a			; Nul-terminate BC (A is zero here).
	pop bc
	pop hl
	ret	
#endlocal

; If HL points to a string that starts with any token string (case-insensitively),
; return that token's value in A and advance HL to the end of the token string.
; Otherwise return 0 in A.
find_token:
#local
	push bc
	push hl
	push de

	ld bc,tokens			; Pointer into tokens.
	ld e,0x80			; Token counter.
token_loop:
	; Test one token.
	push hl				; Save start of input string.
	ld a,(bc)			; Load first token char.
	and a,0x7F			; Strip high bit.
cmp_loop:
	ld d,a				; Save token char.
	ld a,(hl)			; Load input char.
	call to_upper			; Convert to upper case.
	cp a,d				; See if we have a match.
	jr nz,skip_loop			; Not this token.
	inc bc				; This char matched, bump pointers.
	inc hl
	ld a,(bc)			; Load next token char.
	or a,a
	jp p,cmp_loop			; Not end of token, keep comparing.
	; We found a match!
	ld a,e				; Token counter.
	pop bc				; This was HL but we want to keep our HL.
	pop de
	pop bc				; This was HL but we want to keep our HL.
	pop bc
	ret

skip_loop:
	; No match, skip rest of token.
	inc bc
	ld a,(bc)
	or a,a
	jp p,skip_loop
	pop hl				; Restore input pointer.
	and a,0x7F			; Drop high bit.
	jr z,end_of_tokens		; It's zero, end of tokens.
	ld a,e				; Bump token counter.
	inc a
	ld e,a
	jp token_loop

end_of_tokens:
	ld a,0				; "Not found"

	pop de
	pop hl
	pop bc
	ret
#endlocal

; Write the detokenized version of the string at HL.
detokenize:
#local
	push hl
	push bc
loop:
	ld a,(hl)			; Fetch token or character.
	or a,a				; See what we got.
	jp z,done			; Nul indicates end of string.
	call detokenize_char
	inc hl
	jp loop
done:
	pop bc
	pop hl
	ret
#endlocal

; Write the detokenized version of the character in A.
; Destroys BC.
detokenize_char:
#local
	or a,a				; See what we got.
	jp p,plain_char			; High bit not set, it's a regular character.
	ld bc,tokens			; BC will walk through token list.
	and a,0x7F			; The 0-based index of token.
token_loop:
	jp z,found_token		; A has reached zero, we found it.
	push af
token_skip:
	inc bc				; Skip over the bad token.
	ld a,(bc)
	or a,a
	jp p,token_skip 		; Until we find a char with high bit set.
	; TODO handle going past last token
	pop af
	dec a				; Decrement token index.
	jp token_loop

found_token:
	; ld a,'{'
	; call write_char
	ld a,(bc)			; Read the token.
print_token_loop:
	and a,0x7F			; Clear high bit.
	call write_char
	inc bc
	ld a,(bc)
	or a,a
	jp p,print_token_loop		; Until we reach start of next token.
	; ld a,'}'
	; call write_char
	ret

plain_char:
	call write_char			; Write plain char.
	ret
#endlocal

; Convert A to upper case.
to_upper:
#local
	cp a,'a'
	ret c
	cp a,'z'+1
	ret nc
	and a,0xDF			; Convert to lower case (remove 0x20 bit).
	ret
#endlocal

; Compile the nul-terminated tokenized code at DE to a binary buffer at HL.
; Restores DE but keeps HL just past the last byte that was written.
compile_line:
#local
	push de
	push bc
loop:
	ld a,(de)
	inc de
	cp a,' '			; Skip spaces.
	jp z,loop
	or a,a
	jp z,done			; Nul byte is end of the buffer.
	jp m,compile_token		; High bit is set, see if it's a statement.
back_up_and_error:
	dec de				; Point to the bad token.
	jp compile_error
compile_token:
	cp a,T_LAST_STMT+1		; Just past the end of statements.
	jp nc,back_up_and_error		; Not a statement.
	sub a,T_FIRST_STMT		; 0-based index.
	rlca				; Double A, two bytes per entry.
	ld c,a				; BC = offset
	ld b,0
	push hl
	ld hl,compile_command_dispatch	; Look up dispatch in table.
	add hl,bc
	ld c,(hl)			; Get address in table.
	inc hl
	ld b,(hl)
	pop hl
	ld a,b				; See if it's zero.
	or a,c
	jp z,back_up_and_error		; Unimplemented statement.
	ld a,b				; See if we should compile a CALL to that address.
	or a,a
	jp m,compile_call		; High bit means to just compile a CALL.
	push bc				; Jump to BC by pushing and returning.
	ret				; ... since we want to keep HL intact.

compile_call:
	and a,0x7F			; Clear high bit of address.
	ld (hl),I_CALL			; Compile a CALL to it.
	inc hl
	ld (hl),c
	inc hl
	ld (hl),a
	inc hl
	; TODO Check if overrunning compile buffer.
	jp loop

compile_set:
	ld a,'('			; Skip open parenthesis.
	call expect_and_skip
	call compile_expression		; Parse coordinate.
	ld a,')'			; Skip close parenthesis.
	call expect_and_skip
	ld (hl),I_CALL
	inc hl
	ld (hl),lo(set_pixel)
	inc hl
	ld (hl),hi(set_pixel)
	inc hl
	jp loop

done:
	pop bc
	pop de
	ret

; Skip whitespace, expect the character in A, and skip it.
expect_and_skip:
	push bc
	ld b,a
	call skip_whitespace
	ld a,(de)
	cp a,b
	jp nz,compile_error
	inc de
	pop bc
	ret

skip_whitespace:
	ld a,(de)
	cp a,' '
	ret nz
	inc de
	jp skip_whitespace

; Parse the expression at DE into the binary buffer at HL.
compile_expression:
#local
	call skip_whitespace
	ld a,(de)
	cp a,'0'			; See if it's a number.
	jr c,not_number
	cp a,'9'+1
	jr nc,not_number
	call compile_numeric_literal
	ret
not_number:
	cp a,T_RND
	jp nz,compile_error
	; Compile the RND function.
	inc de
	ld (hl),I_CALL
	inc hl
	ld (hl),lo(rnd)
	inc hl
	ld (hl),hi(rnd)
	inc hl
	ld (hl),I_LD_D_H		; RND returns in HL.
	inc hl
	ld (hl),I_LD_E_L
	inc hl
	ret
#endlocal

; Parse the numeric literal at DE into the binary buffer at HL.
compile_numeric_literal:
#local
	push bc
	call read_numeric_literal
	ld (hl),I_LD_DE_IMM
	inc hl
	ld (hl),c
	inc hl
	ld (hl),b
	inc hl
	pop bc
	ret
#endlocal

; Tokens from 0x80 to 0xBB are commands. These are the routines to call
; to compile each token. If the address has the high bit set (0x8000),
; end a CALL to that address is compiled.
compile_command_dispatch:
	dw end | 0x8000 ; END (0x80)
	dw 0 ; FOR (0x81)
	dw 0 ; RESET (0x82)
	dw compile_set ; SET (0x83)
	dw cls | 0x8000 ; CLS (0x84)
	dw 0 ; CMD (0x85)
	dw 0 ; RANDOM (0x86)
	dw 0 ; NEXT (0x87)
	dw 0 ; DATA (0x88)
	dw 0 ; INPUT (0x89)
	dw 0 ; DIM (0x8A)
	dw 0 ; READ (0x8B)
	dw 0 ; LET (0x8C)
	dw 0 ; GOTO (0x8D)
	dw run | 0x8000 ; RUN (0x8E)
	dw 0 ; IF (0x8F)
	dw 0 ; RESTORE (0x90)
	dw 0 ; GOSUB (0x91)
	dw 0 ; RETURN (0x92)
	dw 0 ; REM (0x93)
	dw 0 ; STOP (0x94)
	dw 0 ; ELSE (0x95)
	dw tron | 0x8000 ; TRON (0x96)
	dw troff | 0x8000 ; TROFF (0x97)
	dw 0 ; DEFSTR (0x98)
	dw 0 ; DEFINT (0x99)
	dw 0 ; DEFSNG (0x9A)
	dw 0 ; DEFDBL (0x9B)
	dw 0 ; LINE (0x9C)
	dw 0 ; EDIT (0x9D)
	dw 0 ; ERROR (0x9E)
	dw 0 ; RESUME (0x9F)
	dw 0 ; OUT (0xA0)
	dw 0 ; ON (0xA1)
	dw 0 ; OPEN (0xA2)
	dw 0 ; FIELD (0xA3)
	dw 0 ; GET (0xA4)
	dw 0 ; PUT (0xA5)
	dw 0 ; CLOSE (0xA6)
	dw 0 ; LOAD (0xA7)
	dw 0 ; MERGE (0xA8)
	dw 0 ; NAME (0xA9)
	dw 0 ; KILL (0xAA)
	dw 0 ; LSET (0xAB)
	dw 0 ; RSET (0xAC)
	dw 0 ; SAVE (0xAD)
	dw 0 ; SYSTEM (0xAE)
	dw 0 ; LPRINT (0xAF)
	dw 0 ; DEF (0xB0)
	dw 0 ; POKE (0xB1)
	dw 0 ; PRINT (0xB2)
	dw 0 ; CONT (0xB3)
	dw list | 0x8000 ; LIST (0xB4)
	dw 0 ; LLIST (0xB5)
	dw 0 ; DELETE (0xB6)
	dw 0 ; AUTO (0xB7)
	dw 0 ; CLEAR (0xB8)
	dw 0 ; CLOAD (0xB9)
	dw 0 ; CSAVE (0xBA)
	dw 0 ; NEW (0xBB)
	
#endlocal				; End compile_line local block.

; Parse the decimal literal at DE and return it in BC, advancing DE.
; TODO error if no digits are read. Or maybe not? Always called when we see a digit?
read_numeric_literal:
#local
	ld bc,0
loop:
	ld a,(de)
	cp a,'0'
	ret c				; We're done if it's less than '0'.
	cp a,'9'+1
	ret nc				; We're done if it's greater than '9'.
	push hl
	ld hl,bc			; BC *= 10
	add hl,hl
	add hl,hl
	add hl,bc
	add hl,hl
	ld bc,hl
	pop hl
	sub a,'0'
	add a,c				; BC += A
	ld c,a
	ld a,0
	adc a,b
	ld b,a
	inc de
	jp loop
#endlocal

; Write the nul-terminated string at HL
; to the cursor position. Leaves HL
; one past the nul.
write_text:
#local
	push de
	call disable_cursor
	ld de,(cursor) ; where we're writing to

loop:
	ld a,(hl)
	inc hl
	or a
	jp z,end_loop

	cp a,NL
	jp z,newline

	ld (de),a
	inc de
	; Check end of screen
	ld a,d
	cp a,0x40
	jp nz,loop			; Not at end of screen, loop.
	call scroll_up
	ld de,SCREEN_END-SCREEN_WIDTH
	jp loop

newline:
	; See if we're on the last line and should scroll.
	ld a,d
	cp a,0x3F			; Last (256-byte) block of screen.
	jp nz,actual_newline
	ld a,e
	cp a,0xC0			; Fourth line of last block.
	jp c,actual_newline
	; We're on the last line. Scroll up.
	call scroll_up
	jp go_to_start_of_line

actual_newline:
	; Add SCREEN_WIDTH to DE.
	ld a,e
	add a,SCREEN_WIDTH
	ld e,a
	ld a,d
	adc 0
	ld d,a
go_to_start_of_line:
	ld a,e
	and a,~(SCREEN_WIDTH-1)
	ld e,a
	jp loop	

end_loop:
	ld (cursor),de
	call enable_cursor
	pop de
	ret
#endlocal

; Write character in A to the screen.
write_char:
#local
	push hl
	ld hl,write_char_buffer
	ld (hl),a
	call write_text
	pop hl
	ret
#endlocal

; Write in hex the byte in A, just two upper-case characters.
write_hex_byte:
#local
	push af
	rrca
	rrca
	rrca
	rrca
	call write_hex_nibble
	pop af
	call write_hex_nibble
	ret
#endlocal

; Write in hex the nibble in the low four bits of A, just one upper-case character.
write_hex_nibble:
#local
	and a,0x0F
	add a,'0'
	cp a,'0'+10
	jr c,less_than_ten
	add a,'A'-'0'-10
less_than_ten:
	call write_char
	ret
#endlocal

; Write in decimal the unsigned word in HL.
write_decimal_word:
#local
	push iy
	push hl
	push de
	ld iy, pow10			; Tables for powers of ten.
digit_loop:
	ld a,'0'			; Digit to print.
	ld d,(iy+1)			; Load power of ten.
	ld e,(iy+0)
	or a,a				; Clear carry.
count_loop:
	sbc hl,de			; Subtract the power of ten.
	jr c,went_negative		; Ooops went too far.
	inc a				; It fit, increase the count.
	jr count_loop
went_negative:
	add hl,de			; Undo last subtraction, went too far.
	call write_char
	inc iy				; Next power of ten.
	inc iy
	ld a,e
	cp a,1				; See if that was the last one.
	jp nz,digit_loop
	pop de
	pop hl
	pop iy
	ret
#endlocal

; Scroll the screen up one line and write a blank line at the bottom.
scroll_up:
#local
	push hl
	push bc
	push de
	; Scroll screen up.
	ld hl,SCREEN_BEGIN+SCREEN_WIDTH
	ld de,SCREEN_BEGIN
	ld bc,SCREEN_SIZE-SCREEN_WIDTH
	ldir
	; Blank out bottom line.
	ld hl,SCREEN_END-SCREEN_WIDTH
	ld de,SCREEN_END-SCREEN_WIDTH+1
	ld bc,SCREEN_WIDTH-1
	ld (hl),CLEAR_CHAR
	ldir
	pop de
	pop bc
	pop hl
	ret
#endlocal

; Set the pixel at X location D (0-127) and Y location E (0-47).
; Actually for now just draw a square at character location DE (0-1023).
set_pixel:
#local
	push de
	ld a,d
	and a,0x03			; DE %= 1024
	add a,hi(SCREEN_BEGIN)		; DE += SCREEN_BEGIN
	ld d,a
	ld a,191
	ld (de),a
	pop de
	ret
#endlocal

; Read a line of text from the keyboard and put
; it in the B-length buffer pointed to by HL.
; The line will be nul-terminated. At most B-1
; characters will be read from the keyboard, leaving
; one space for the nul.
read_text:
#local
	push hl
	push bc
	push de

	; Number of chars written so far. Must not exceed b-1.
	ld c,0

loop:
	call poll_keyboard
	or a
	jp z,loop

	cp a,NL
	jp z,done

	cp a,BS
	jp nz,regular_char

	; Backspace.
	ld a,c
	or a
	jp z,loop ; Empty string, nothing to backspace over.

	dec hl
	dec c
	call disable_cursor
	ld de,(cursor)
	dec de
	ld (cursor),de
	call enable_cursor
	jp loop

regular_char:
	; See if we're run out of space.
	push de				; We need D for temporary.
	ld d,a				; Save A.
	ld a,c				; Compare C + 1 to B.
	inc a
	cp a,b
	ld a,d				; Restore A.
	pop de
	jp z,loop			; They're equal, we're out of space.

	; Write the character.
	ld (hl),a
	inc hl
	inc c
	call write_char
	jp loop

done:
	; Write newline.
	call write_char

	; Write terminating nul.
	ld (hl),0

	pop de
	pop bc
	pop hl
	ret
#endlocal

; Returns in A the ASCII value of the key currently
; being pressed, or 0 if no key is pressed.
; If multiple keys are being pressed, the one most
; recently pressed is returned.
poll_keyboard:
#local
	push hl
	push bc
	push de

	; We need to keep track of which keys are currently being held down, so
	; that we know when a new key is pressed. We keep track of this in the
	; keyboard_buffer array, which parallels the keyboard matrix.
	ld bc,KEYBOARD_BEGIN+0x01	; Pointer to the keyboard matrix.
	ld hl,keyboard_buffer		; Pointer into the keyboard buffer.
	ld d,0				; The row we're on.
byte_loop:
	ld a,(bc)			; Load byte from keyboard matrix.
	ld e,a				; Save it.
	xor a,(hl)			; See what's changed since last time.
	ld (hl),e			; Save new value.
	and a,e				; See what's pressed since last time.
	jr nz,found_key			; If anything has been pressed, handle it.
	inc d				; Next row.
	inc hl
	rlc c
	jp p,byte_loop			; If bit 8 isn't set, then there's more to do.
	xor a,a				; Done checking all rows, no key was pressed.
	jp done

found_key:
	; Here we might want a debounce check.
	; Skipping that now since we're in the
	; emulator.

	; We now need to find the character index.
	; Multiply d by 8 (8 bits per byte).
	sla d
	sla d
	sla d
	; And right-shift the bit until it falls off.
bit_loop:
	rra
	jr c,end_bit_loop
	inc d
	jr bit_loop

end_bit_loop:
	; See if shift key is pressed.
	ld hl,keyboard_matrix_unshifted
	ld a,(KEYBOARD_BEGIN+0x80)
	or a,a
	ld a,d
	jp z,shift_not_pressed
	add a,56
	
shift_not_pressed:
	; Look up key in HL array by A index.
	add a,l         ; a = a+l
	ld l,a          ; l = a+l
	adc a,h         ; a = a+l+h+carry
	sub l           ; a = h+carry
	ld h,a          ; h = h+carry
	ld a,(hl)

done:
	pop de
	pop bc
	pop hl
	ret
#endlocal

; Enable the cursor.
enable_cursor:
#local
	push hl
	push af
	di
	; See if the cursor is already enabled.
	ld hl,cursor_counter
	ld a,(hl)
	cp a,CURSOR_DISABLED
	jp nz,done
	; Reset the counter.
	ld (hl),0
	; Immediately show the cursor.
	ld hl,(cursor)
	ld (hl),CURSOR_CHAR
done:
	ei
	pop af
	pop hl
	ret
#endlocal

; Disable the cursor.
disable_cursor:
#local
	push hl
	push af
	di
	; See if the cursor is already disabled.
	ld hl,cursor_counter
	ld a,(hl)
	cp a,CURSOR_DISABLED
	jp z,done
	; Disable the cursor blink.
	ld (hl),CURSOR_DISABLED
	; Immediately hide the cursor.
	ld hl,(cursor)
	ld (hl),CLEAR_CHAR
done:
	ei
	pop af
	pop hl
	ret
#endlocal

; Blink the cursor if it's enabled. Call this only
; with interrupts already disabled. Does not
; re-enable them.
blink_cursor:
#local
	push hl
	push af
	; See if the cursor is enabled.
	ld hl,cursor_counter
	ld a,(hl)
	cp a,CURSOR_DISABLED
	jp z,done
	; Increment counter.
	inc a
	cp a,CURSOR_HALF_PERIOD
	jp nz,skip
	; We've reached the half period, turn it off.
	ld hl,(cursor)
	ld (hl),CLEAR_CHAR
	jp done
skip:
	cp a,CURSOR_HALF_PERIOD*2
	jp nz,done
	; We've reached the full period, turn it on.
	ld a,0
	ld hl,(cursor)
	ld (hl),CURSOR_CHAR
done:
	ld (cursor_counter),a
	pop af
	pop hl
	ret	
#endlocal

handle_maskable_interrupt:
#local
	push af
	call blink_cursor
	in a,(0xEC) ; Reset timer latch.
	pop af
	ret
#endlocal

; Generate a random 16-bit number, returning it in HL.
rnd:
#local
	; 16-bit xorshift pseudorandom number generator by John Metcalf.
	; hl ^= hl << 7
	; hl ^= hl >> 9
	; hl ^= hl << 8
	; From https://wikiti.brandonw.net/index.php?title=Z80_Routines:Math:Random
	ld hl,(rnd_seed)
	
	ld a,h
	rra
	ld a,l
	rra
	xor h
	ld h,a
	ld a,l
	rra
	ld a,h
	rra
	xor l
	ld l,a
	xor h
	ld h,a

	ld (rnd_seed),hl
	ret
#endlocal
	
boot_message:
	db "Model III Basic Compiler", NL
	db "(c) '26 Lawrence Kesteloot", NL, 0
ready_prompt:
	db "Ready", NL, 0
line_prompt:
	db ">", 0
syntax_error_msg_part1:
	db "Syntax error at '", 0
syntax_error_msg_part2:
	db "'", NL, 0
keyboard_matrix_unshifted:
	db "@abcdefghijklmnopqrstuvwxyz     0123456789:;,-./", NL, 0, 27, 0, 0, 8, 9, 32
keyboard_matrix_shifted:
	db "`ABCDEFGHIJKLMNOPQRSTUVWXYZ     _!", 34, "#$%&'()*+<=>?", NL, 0, 27, 0, 0, 8, 9, 32
tokens:
	; This list was generated by make_token_list.py.
	db 'E'|0x80,"ND" ; END (0x80)
	db 'F'|0x80,"OR" ; FOR (0x81)
	db 'R'|0x80,"ESET" ; RESET (0x82)
	db 'S'|0x80,"ET" ; SET (0x83)
	db 'C'|0x80,"LS" ; CLS (0x84)
	db 'C'|0x80,"MD" ; CMD (0x85)
	db 'R'|0x80,"ANDOM" ; RANDOM (0x86)
	db 'N'|0x80,"EXT" ; NEXT (0x87)
	db 'D'|0x80,"ATA" ; DATA (0x88)
	db 'I'|0x80,"NPUT" ; INPUT (0x89)
	db 'D'|0x80,"IM" ; DIM (0x8A)
	db 'R'|0x80,"EAD" ; READ (0x8B)
	db 'L'|0x80,"ET" ; LET (0x8C)
	db 'G'|0x80,"OTO" ; GOTO (0x8D)
	db 'R'|0x80,"UN" ; RUN (0x8E)
	db 'I'|0x80,"F" ; IF (0x8F)
	db 'R'|0x80,"ESTORE" ; RESTORE (0x90)
	db 'G'|0x80,"OSUB" ; GOSUB (0x91)
	db 'R'|0x80,"ETURN" ; RETURN (0x92)
	db 'R'|0x80,"EM" ; REM (0x93)
	db 'S'|0x80,"TOP" ; STOP (0x94)
	db 'E'|0x80,"LSE" ; ELSE (0x95)
	db 'T'|0x80,"RON" ; TRON (0x96)
	db 'T'|0x80,"ROFF" ; TROFF (0x97)
	db 'D'|0x80,"EFSTR" ; DEFSTR (0x98)
	db 'D'|0x80,"EFINT" ; DEFINT (0x99)
	db 'D'|0x80,"EFSNG" ; DEFSNG (0x9A)
	db 'D'|0x80,"EFDBL" ; DEFDBL (0x9B)
	db 'L'|0x80,"INE" ; LINE (0x9C)
	db 'E'|0x80,"DIT" ; EDIT (0x9D)
	db 'E'|0x80,"RROR" ; ERROR (0x9E)
	db 'R'|0x80,"ESUME" ; RESUME (0x9F)
	db 'O'|0x80,"UT" ; OUT (0xA0)
	db 'O'|0x80,"N" ; ON (0xA1)
	db 'O'|0x80,"PEN" ; OPEN (0xA2)
	db 'F'|0x80,"IELD" ; FIELD (0xA3)
	db 'G'|0x80,"ET" ; GET (0xA4)
	db 'P'|0x80,"UT" ; PUT (0xA5)
	db 'C'|0x80,"LOSE" ; CLOSE (0xA6)
	db 'L'|0x80,"OAD" ; LOAD (0xA7)
	db 'M'|0x80,"ERGE" ; MERGE (0xA8)
	db 'N'|0x80,"AME" ; NAME (0xA9)
	db 'K'|0x80,"ILL" ; KILL (0xAA)
	db 'L'|0x80,"SET" ; LSET (0xAB)
	db 'R'|0x80,"SET" ; RSET (0xAC)
	db 'S'|0x80,"AVE" ; SAVE (0xAD)
	db 'S'|0x80,"YSTEM" ; SYSTEM (0xAE)
	db 'L'|0x80,"PRINT" ; LPRINT (0xAF)
	db 'D'|0x80,"EF" ; DEF (0xB0)
	db 'P'|0x80,"OKE" ; POKE (0xB1)
	db 'P'|0x80,"RINT" ; PRINT (0xB2)
	db 'C'|0x80,"ONT" ; CONT (0xB3)
	db 'L'|0x80,"IST" ; LIST (0xB4)
	db 'L'|0x80,"LIST" ; LLIST (0xB5)
	db 'D'|0x80,"ELETE" ; DELETE (0xB6)
	db 'A'|0x80,"UTO" ; AUTO (0xB7)
	db 'C'|0x80,"LEAR" ; CLEAR (0xB8)
	db 'C'|0x80,"LOAD" ; CLOAD (0xB9)
	db 'C'|0x80,"SAVE" ; CSAVE (0xBA)
	db 'N'|0x80,"EW" ; NEW (0xBB)
	db 'T'|0x80,"AB(" ; TAB( (0xBC)
	db 'T'|0x80,"O" ; TO (0xBD)
	db 'F'|0x80,"N" ; FN (0xBE)
	db 'U'|0x80,"SING" ; USING (0xBF)
	db 'V'|0x80,"ARPTR" ; VARPTR (0xC0)
	db 'U'|0x80,"SR" ; USR (0xC1)
	db 'E'|0x80,"RL" ; ERL (0xC2)
	db 'E'|0x80,"RR" ; ERR (0xC3)
	db 'S'|0x80,"TRING$" ; STRING$ (0xC4)
	db 'I'|0x80,"NSTR" ; INSTR (0xC5)
	db 'P'|0x80,"OINT" ; POINT (0xC6)
	db 'T'|0x80,"IME$" ; TIME$ (0xC7)
	db 'M'|0x80,"EM" ; MEM (0xC8)
	db 'I'|0x80,"NKEY$" ; INKEY$ (0xC9)
	db 'T'|0x80,"HEN" ; THEN (0xCA)
	db 'N'|0x80,"OT" ; NOT (0xCB)
	db 'S'|0x80,"TEP" ; STEP (0xCC)
	db '+'|0x80,"" ; + (0xCD)
	db '-'|0x80,"" ; - (0xCE)
	db '*'|0x80,"" ; * (0xCF)
	db '/'|0x80,"" ; / (0xD0)
	db '['|0x80,"" ; [ (0xD1)
	db 'A'|0x80,"ND" ; AND (0xD2)
	db 'O'|0x80,"R" ; OR (0xD3)
	db '>'|0x80,"" ; > (0xD4)
	db '='|0x80,"" ; = (0xD5)
	db '<'|0x80,"" ; < (0xD6)
	db 'S'|0x80,"GN" ; SGN (0xD7)
	db 'I'|0x80,"NT" ; INT (0xD8)
	db 'A'|0x80,"BS" ; ABS (0xD9)
	db 'F'|0x80,"RE" ; FRE (0xDA)
	db 'I'|0x80,"NP" ; INP (0xDB)
	db 'P'|0x80,"OS" ; POS (0xDC)
	db 'S'|0x80,"QR" ; SQR (0xDD)
	db 'R'|0x80,"ND" ; RND (0xDE)
	db 'L'|0x80,"OG" ; LOG (0xDF)
	db 'E'|0x80,"XP" ; EXP (0xE0)
	db 'C'|0x80,"OS" ; COS (0xE1)
	db 'S'|0x80,"IN" ; SIN (0xE2)
	db 'T'|0x80,"AN" ; TAN (0xE3)
	db 'A'|0x80,"TN" ; ATN (0xE4)
	db 'P'|0x80,"EEK" ; PEEK (0xE5)
	db 'C'|0x80,"VI" ; CVI (0xE6)
	db 'C'|0x80,"VS" ; CVS (0xE7)
	db 'C'|0x80,"VD" ; CVD (0xE8)
	db 'E'|0x80,"OF" ; EOF (0xE9)
	db 'L'|0x80,"OC" ; LOC (0xEA)
	db 'L'|0x80,"OF" ; LOF (0xEB)
	db 'M'|0x80,"KI$" ; MKI$ (0xEC)
	db 'M'|0x80,"KS$" ; MKS$ (0xED)
	db 'M'|0x80,"KD$" ; MKD$ (0xEE)
	db 'C'|0x80,"INT" ; CINT (0xEF)
	db 'C'|0x80,"SNG" ; CSNG (0xF0)
	db 'C'|0x80,"DBL" ; CDBL (0xF1)
	db 'F'|0x80,"IX" ; FIX (0xF2)
	db 'L'|0x80,"EN" ; LEN (0xF3)
	db 'S'|0x80,"TR$" ; STR$ (0xF4)
	db 'V'|0x80,"AL" ; VAL (0xF5)
	db 'A'|0x80,"SC" ; ASC (0xF6)
	db 'C'|0x80,"HR$" ; CHR$ (0xF7)
	db 'L'|0x80,"EFT$" ; LEFT$ (0xF8)
	db 'R'|0x80,"IGHT$" ; RIGHT$ (0xF9)
	db 'M'|0x80,"ID$" ; MID$ (0xFA)
	db 0x80 ; End of token list.

; Powers of 10 for write_decimal_word.
pow10:  dw 10000, 1000, 100, 10, 1
	
; Variables in RAM.
	.org 0x4000
bss_start:

; Cursor blink counter. Equal to CURSOR_DISABLED if the cursor is disabled.
cursor_counter: ds 1

; Memory address of cursor on the screen.
cursor: ds 2

; Buffer for input of a line of text.
input_buffer: 
	ds INPUT_BUFFER_SIZE

; Short buffer for write_char.
write_char_buffer:
	ds 2

; Keyboard buffer to remember what's pressed.
keyboard_buffer:
	ds 7

; Non-zero if we should print debugging output.
debug_output:
	ds 1

; Whether TRON has been enabled.
tron_flag:
	ds 1

; Location of the stack just before we show the ready prompt,
; to unwind it all on error or end of program.
ready_prompt_sp:
	ds 2

; Seed for the random number generator. Must not be zero.
rnd_seed:
	ds 2

; Where the program is compiled to.
binary:
	ds BINARY_SIZE

; Mark where our variables end.
bss_end:

program:
line10:	db lo(line20), hi(line20), lo(10), hi(10), T_CLS, 0
line20: db lo(line30), hi(line30), lo(20), hi(20), T_CLS, 0
line30: db lo(line40), hi(line40), lo(30), hi(30), T_SET, '(500)', 0
line40: db 0, 0

	end 0x0000
