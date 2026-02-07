	;
	; Replacement ROM for the TRS-80 Model III.
	; (c) Lawrence Kesteloot 2026
	;
	; This ROM provides a normal Basic environment, but compiles
	; the program instead of interpreting it.
	;
	; Conventions:
	;
	; While compiling, DE points to the source tokenized Basic and
	; HL points to the compiled binary buffer. While compiling an
	; expression, IY points to the operator stack.
	;
	; In the compiled program, expression results are put on the stack.
	; All registers are scratch and must be saved if calling a function
	; that trashes them.
	;

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
MAX_VARS equ 32

; Z80 opcodes.
I_LD_DE_IMM equ 0x11
I_LD_DE_A equ 0x12
I_INC_DE equ 0x13
I_RLA equ 0x17
I_ADD_HL_DE equ 0x19
I_LD_HL_IMM equ 0x21
I_INC_HL equ 0x23
I_SCF equ 0x37
I_DEC_A equ 0x3D
I_LD_A_IMM equ 0x3E
I_CCF equ 0x3F
I_LD_B_D equ 0x42
I_LD_B_E equ 0x43
I_LD_B_A equ 0x47
I_LD_C_E equ 0x4B
I_LD_D_H equ 0x54
I_LD_D_HL equ 0x56
I_LD_D_A equ 0x57
I_LD_E_L equ 0x5D
I_LD_E_HL equ 0x5E
I_LD_E_A equ 0x5F
I_LD_H_D equ 0x62
I_LD_L_E equ 0x6B
I_LD_HL_D equ 0x72
I_LD_HL_E equ 0x73
I_LD_A_D equ 0x7A
I_LD_A_E equ 0x7B
I_XOR_A_A equ 0xAF
I_OR_A_E equ 0xB3
I_POP_BC equ 0xC1
I_JP equ 0xC3
I_PUSH_BC equ 0xC5
I_RET equ 0xC9
I_JP_Z_ADDR equ 0xCA
I_CALL equ 0xCD
I_POP_DE equ 0xD1
I_PUSH_DE equ 0xD5
I_POP_HL equ 0xE1
I_PUSH_HL equ 0xE5
I_SBC_HL_DE_1 equ 0xED
I_SBC_HL_DE_2 equ 0x52

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

; Operators. These encode both the operator (high nibble) and the precedence
; (low nibble). Lower precedence has a lower low nibble value. For example,
; OP_ADD (0x99) and OP_SUB (0xA9) have the same precedence (9). By convention
; the precedence is the value of the lowest-valued operator in its class
; (OP_ADD = 0x99), but only the relative values of precedence matter. All
; of these are left-associative.
; TODO clarify or remove the second-to-last sentence above.
; See page 120 of the "TRS-80 Model III Operation and BASIC Language
; Reference Manual."
; [ (exp)
; Posivie, Negative
; * /
; + -
; Relational < > <= >= = <>
; NOT
; AND
; OR
MAX_OP_STACK_SIZE equ 16
OP_LT equ 0x75
OP_ADD equ 0x99
OP_SUB equ 0xA9
OP_MUL equ 0xBB
OP_DIV equ 0xCB
OP_CLOSE_PARENS equ 0xFD		; Never on the stack.
OP_OPEN_PARENS equ 0xFE			; Ignore precedence.
OP_INVALID equ 0xFF			; For errors and sentinel.

; Macro to add a byte to the compiled binary.
	macro m_add value
	ld (hl),\value
	inc hl
	endm
; Add a word constant to the compiled binary in little endian order.
	macro m_add_word value
	m_add lo(\value)
	m_add hi(\value)
	endm

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
        m_add I_RET
	ld a,(debug_output)
	or a,a
	jp nz,print_binary
	call binary
; Jump here from END token or from any error condition.
end:
	ld sp,(ready_prompt_sp)
	jr prompt_loop

; Show a runtime error message and return to the Ready prompt.
runtime_error:
	ld hl,runtime_error_msg
	call write_text
	jr end

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
	jp end

; Clear the screen and reset the cursor to the top-left corner.
cls:
#local
	push hl
	push de
	push bc
	
	ld hl,SCREEN_BEGIN
	ld (cursor),hl
	ld (hl),CLEAR_CHAR
	ld de,SCREEN_BEGIN+1
	ld bc,SCREEN_SIZE-1

	ldir

	pop bc
	pop de
	pop hl
	
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
	inc hl				; Skip compile pointer.
	inc hl
	push hl
	ld hl,bc
	call write_unsigned_decimal_word; Write the line number.
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

; Find the line with the line number BC, returning it in HL and setting carry.
; If not found, carry is reset and HL points to the final line (with no content).
find_line_number:
#local
	push de
	ld hl,program
loop:
	push hl				; Push address of this line.
	ld e,(hl)			; Grab address of next line (DE).
	inc hl
	ld d,(hl)
	inc hl
	ld a,e				; See if it's null.
	or a,d
	jp z,done			; Null next pointer means no line here.
	push de				; Push next pointer.
	ld a,(hl)			; Grab line number into HL.
	inc hl
	ld h,(hl)
	ld l,a
	sbc hl,bc			; Carry is zero from OR above.
	jp z,found			; Line numbers match.
	pop hl				; Pop next pointer (pushed as DE).
	pop de				; Discard "this line" pointer (pushed as HL).
	jp loop
found:
	pop hl				; Discard "next line" pointer (pushed as DE).
	pop hl				; Restore "this line" pointer.
	scf				; Indicate that the line was found.
done:					; If we jump directly here, carry is reset.
	pop de
	ret
#endlocal

; Compile the stored program and run it.
run:
#local
	push hl
	push bc
	push de
	push ix
	ld ix,variables			; Clear variables.
	ld (ix),0
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
	ld (ix),l			; Record compile address for this line.
	inc ix
	ld (ix),h
	inc ix
	ld e,ixl			; Compile wants source in DE.
	ld d,ixh
	call compile_line		; Writes to HL.
	pop ix				; Pop address of next line (was pushed as BC).
	jp loop
done:
	; Clean up the stack and return to the ready prompt.
	m_add I_JP
	m_add_word end
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
	; Prepare state.
	ld ix,eol_ref			; Clear our eol_ref.
	ld (ix),0
	ld (ix+1),0
loop:
	call skip_whitespace
	inc de				; Skip token (it's in A).
	or a,a
	jp z,eol			; Nul byte is end of the buffer.
	jp m,compile_token		; High bit is set, see if it's a statement.
	cp a,'A'			; See if it's a variable assignment
	jp c,compile_error
	cp a,'Z'+1
	jp nc,compile_error
	ld b,a				; Put variable name in BC.
	ld c,0				; Don't yet support two-letter variable names.
	call find_variable		; Variable address in BC.
	push bc				; Save address.
	ld a,T_OP_EQU
	call expect_and_skip
	call compile_expression		; Evaluate RHS, result on stack.
	pop bc				; Restore address.
	call add_pop_de
	m_add I_LD_HL_IMM		; Variable address in HL.
	m_add c
	m_add b
	m_add I_LD_HL_E			; Write DE to variable.
	m_add I_INC_HL
	m_add I_LD_HL_D
	jp loop
back_up_and_error:
	dec de				; Back up to bad byte.
	jp compile_error
eol:
	; Do end-of-line processing.
	push de
	ld ix,eol_ref			; Check eol_ref.
	ld e,(ix)
	ld d,(ix+1)
	ld a,e				; See if we saved an address there.
	or a,d
	jr z,no_eol_ref
	ld a,l				; Write our compile buffer address there.
	ld (de),a
	inc de
	ld a,h
	ld (de),a
no_eol_ref:
	pop de
	jp done
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

        ; Compile a call to AC.
compile_call:
	and a,0x7F			; Clear high bit of address.
	m_add I_CALL			; Compile a CALL to it.
	m_add c
	m_add a
	; TODO Check if overrunning compile buffer.
	jp loop

compile_set:
	ld a,'('			; Skip open parenthesis.
	call expect_and_skip
	call compile_expression		; Read X coordinate onto the stack.
	ld a,','			; Skip comma.
	call expect_and_skip
	call compile_expression		; Read Y coordinate onto the stack.
	call add_pop_de			; Restore Y.
	m_add I_LD_C_E		        ; Y to C.
	m_add I_POP_DE		        ; Restore X.
	m_add I_LD_B_E		        ; X to B.
	ld a,')'			; Skip close parenthesis.
	call expect_and_skip
	m_add I_CALL
	m_add_word set_pixel
	jp loop

compile_goto:
	; TODO can't call this from immediate mode, program isn't compiled.
	; maybe have a global flag for whether the compile is valid, set after
	; compile and reset after any code modification.
	call skip_whitespace
	ld a,(de)
	cp a,'0'			; Verify that we have a number.
	jp c,compile_error
	cp a,'9'+1
	jp nc,compile_error
	call read_numeric_literal	; BC has the line number.
	push hl				; Save write pointer.
	call find_line_number		; HL has address of line.
	jp nc,compile_error		; Line number not found. TODO better error
	inc hl				; Skip next pointer.
	inc hl
	inc hl				; Skip line number.
	inc hl
	ld c,(hl)			; Read compile address.
	inc hl
	ld b,(hl)
	pop hl				; Restore write pointer.
	m_add I_JP			; Jump to line's compile address.
	m_add c
	m_add b
	jp loop

compile_if:
	call compile_expression		; Conditional onto the stack.
	ld a,T_THEN
	call expect_and_skip
	call add_pop_de
	m_add I_LD_A_D			; See if conditional is zero.
	m_add I_OR_A_E
	m_add I_JP_Z_ADDR		; Skip rest of line if false.
	ld ix,eol_ref			; Save compile location in eol_ref.
	ld (ix),l
	ld (ix+1),h
	m_add 0				; To be filled in later, see "eol".
	m_add 0
	jp loop

compile_poke:
	call compile_expression		; Address onto the stack.
	ld a,','
	call expect_and_skip
	call compile_expression		; Value onto the stack.
	call add_pop_de			; Value.
	m_add I_LD_A_E
	m_add I_POP_DE			; Address.
	m_add I_LD_DE_A
	jp loop

compile_print:
	call compile_expression		; Onto the stack.
	m_add I_POP_HL			; Move to HL for write_decimal_word.
	m_add I_CALL
	m_add_word write_signed_decimal_word
	m_add I_LD_A_IMM
	m_add NL
	m_add I_CALL
	m_add_word write_char
	jp loop

done:
	pop bc
	pop de
	ret

; Skip whitespace at DE, expect the character in A, and skip it.
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

; Skip the whitespace at DE, leaving the next found character in A.
skip_whitespace:
	ld a,(de)
	cp a,' '
	ret nz
	inc de
	jp skip_whitespace

; Parse the expression at DE into the binary buffer at HL. The compiled
; code leaves the result on the stack.
compile_expression:
#local
	ld iy,op_stack			; IY is pre-incremented.
	ld (iy),OP_INVALID		; Sentinel value.
expr_loop:
	call skip_whitespace
	ld a,(de)
	cp a,'0'			; See if it's a number.
	jr c,not_number
	cp a,'9'+1
	jr nc,not_number
	call compile_numeric_literal
	jp expr_loop
not_number:
	cp a,T_OP_ADD
	jr z,push_op_add
	cp a,T_OP_SUB
	jr z,push_op_sub
	cp a,T_OP_MUL
	jr z,push_op_mul
	cp a,T_OP_DIV
	jr z,push_op_div
	cp a,T_OP_LT
	jr z,push_op_lt
	jr not_op
push_op_add:
	ld a,OP_ADD
	jr push_op_stack
push_op_sub:
	ld a,OP_SUB
	jr push_op_stack
push_op_mul:
	ld a,OP_MUL
	jr push_op_stack
push_op_div:
	ld a,OP_DIV
	jr push_op_stack
push_op_lt:
	ld a,OP_LT
	jr push_op_stack
push_op_stack:
	; Before we can push an operator, we may have to pop some.
	push af				; Save op we're pushing.
	and a,0x0F			; Grab precedence of op we're pushing.
	ld b,a				; Save precedence in B.
	; TODO don't pop if we're adding unary.
	cp a,OP_OPEN_PARENS
	jr z,done_push_popping		; Don't pop if we're pushing open parenthesis.
push_pop_loop:
	ld a,(iy)			; Load operator at top of stack.
	cp a,OP_INVALID
	jr z,done_push_popping		; Nothing on stack to pop.
	cp a,OP_OPEN_PARENS
	jr z,done_push_popping		; Don't pop open parens.
	ld c,a				; Save operator at top of stack.
	and a,0x0F			; Get precedence of top of stack.
	cp a,b				; See if it's lower precedence.
	jr c,done_push_popping		; Top of stack is lower, don't pop.
	ld a,c				; Restore operator at top of stack.
	call pop_op_stack		; Compile op at top of stack.
	jr push_pop_loop
done_push_popping:
	pop af				; Restore operator we're pushing.
	; TODO check op stack overflow, maybe use sentinel.
	inc iy				; Pre-increment.
	ld (iy),a			; Push operator.
	inc de				; Advance source pointer.
	jp expr_loop
not_op:
	cp a,T_RND
	jr nz,not_rnd
	; Compile the RND function, puts the result onto the stack.
	inc de
	ld a,'('
	call expect_and_skip
	call skip_whitespace
	cp a,')'
	jr z,no_rnd_expression		; Immediate close parenthesis, no range parameter.
	call compile_expression		; Onto the stack.
	ld a,')'
	call expect_and_skip
	m_add I_CALL			; Generate random number in DE.
	m_add_word rnd
	m_add I_LD_B_D		        ; Random number in BC.
	m_add I_LD_C_E
	m_add I_POP_DE		        ; Restore range.
	m_add I_PUSH_HL
	m_add I_CALL			; Compute rnd (BC) % range (DE) into HL.
	m_add_word bc_div_de
	m_add I_LD_D_H		        ; Result into DE.
	m_add I_LD_E_L
	m_add I_INC_DE		        ; Result is 1 to N.
	m_add I_POP_HL
	m_add I_PUSH_DE			; Push result.
	jp expr_loop
no_rnd_expression:
	call expect_and_skip		; Skip ')'.
	m_add I_CALL			; Generate random number in DE.
	m_add_word rnd
	m_add I_PUSH_DE			; Push result.
	jp expr_loop
not_rnd:
	cp a,'A'			; See if it's a variable.
	jp c,end_of_expression
	cp a,'Z'+1
	jp nc,end_of_expression
	ld b,a				; Put variable name in BC.
	ld c,0				; Don't yet support two-letter variable names.
	inc de
	call find_variable		; Variable address in BC.
	m_add I_PUSH_HL
	m_add I_LD_HL_IMM		; Variable address in HL.
	m_add c
	m_add b
	m_add I_LD_E_HL			; Variable value in DE.
	m_add I_INC_HL
	m_add I_LD_D_HL
	m_add I_POP_HL
	m_add I_PUSH_DE			; Push result.
	jp expr_loop

end_of_expression:
pop_loop:
	ld a,(iy)			; Get the operator.
	cp a,OP_INVALID			; Sentinel value.
	ret z
	call pop_op_stack
	jr pop_loop

; Pop one operator off the op stack and compile it, then return. The operator
; must already be in A.
pop_op_stack:
	; TODO perhaps move the calls to add_pop_de here.
	dec iy				; Pointer is post-decremented.
	cp a,OP_ADD
	jr z,compile_op_add
	cp a,OP_SUB
	jr z,compile_op_sub
	cp a,OP_MUL
	jr z,compile_op_mul
	cp a,OP_DIV
	jr z,compile_op_div
	cp a,OP_LT
	jr z,compile_op_lt
	jp compile_error		; TODO it's actually internal compiler error.
compile_op_add:
	call add_pop_de			; Second operand.
	m_add I_POP_HL			; First operand.
	m_add I_ADD_HL_DE
	m_add I_PUSH_HL
	ret
compile_op_sub:
	call add_pop_de			; Second operand.
	m_add I_POP_HL			; First operand.
	m_add I_XOR_A_A			; Clear carry (don't care about A).
	m_add I_SBC_HL_DE_1
	m_add I_SBC_HL_DE_2
	m_add I_PUSH_HL
	ret
compile_op_mul:
	call add_pop_de			; Second operand.
	m_add I_POP_BC			; First operand.
	m_add I_CALL
	m_add_word bc_mul_de		; DEHL = BC * DE.
	m_add I_PUSH_HL
	ret
compile_op_div:
	call add_pop_de			; Second operand.
	m_add I_POP_BC			; First operand.
	m_add I_CALL
	m_add_word bc_div_de		; AC = BC / DE.
	m_add I_LD_B_A
	m_add I_PUSH_BC
	ret
compile_op_lt:
	call add_pop_de			; Second operand.
	m_add I_POP_HL			; First operand.
	m_add I_XOR_A_A			; Clear A and carry.
	m_add I_SBC_HL_DE_1		; If (HL < DE) carry = 1 else carry = 0.
	m_add I_SBC_HL_DE_2
	m_add I_CCF			; If (HL < DE) carry = 0 else carry = 1.
	m_add I_RLA			; If (HL < DE) A = 0x00 else A = 0x01.
	m_add I_DEC_A			; If (HL < DE) A = 0xFF else A = 0x00.
	m_add I_LD_E_A			; If (HL < DE) DE = 0xFFFF else DE = 0x0000.
	m_add I_LD_D_A
	m_add I_PUSH_DE
	ret
#endlocal

; Parse the numeric literal at DE into the binary buffer at HL.
; The compiled code puts the number on the stack.
compile_numeric_literal:
#local
	push bc
	call read_numeric_literal	; Into BC.
	m_add I_LD_DE_IMM
	m_add c
	m_add b
	m_add I_PUSH_DE
	pop bc
	ret
#endlocal

; Add a I_POP_DE instruction, unless the previous instruction was I_PUSH_DE,
; in which case that instruction is removed. Destroys A.
add_pop_de:
#local
	dec hl
	ld a,(hl)
	cp a,I_PUSH_DE			; See if previous instruction was I_PUSH_DE.
	ret z				; If so, remove it (leave HL one less).
	inc hl				; Restore HL.
	ld (hl),I_POP_DE		; And actually add the pop.
	inc hl
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
	dw compile_goto ; GOTO (0x8D)
	dw run | 0x8000 ; RUN (0x8E)
	dw compile_if ; IF (0x8F)
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
	dw compile_poke ; POKE (0xB1)
	dw compile_print ; PRINT (0xB2)
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

; Given the name of the variable in BC (B is the first letter, C is the
; optional second letter, or zero), get the address of that variable's value
; in BC.
find_variable:
#local
	push hl
	ld hl,variables
loop:
	ld a,(hl)			; Check the first letter.
	or a,a
	jr z,not_found			; Nul if end of list.
	inc hl				; Skip first letter.
	cp a,b
	jr nz,not_match
	ld a,(hl)			; Check the second letter.
	cp a,c
	jr z,found
not_match:
	inc hl				; Skip second letter.
	inc hl				; Skip value.
	inc hl
	jp loop				; TODO check if end of array.
found:
	inc hl				; Skip second letter.
done:
	ld bc,hl			; Found it, return address in BC.
	pop hl
	ret
not_found:
	; TODO check out of variable space.
	ld (hl),b			; Write name.
	inc hl
	ld (hl),c
	inc hl
	ld (hl),0			; Initialize value.
	inc hl
	ld (hl),0
	dec hl				; Go back to value.
	jr done
#endlocal
	
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
write_unsigned_decimal_word:
#local
	push iy
	push hl
	push bc
	push de
	ld b,0				; Whether we've printed anything yet.
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
	; Here we omit leading zeros:
	cp a,'0'			; Write any non-zero digit.
	jr nz,write_the_digit
	ld c,a				; Save A.
	ld a,b				; See if we've written any digit yet.
	or a,a
	ld a,c				; Restore A.
	jr nz,write_the_digit
	ld a,e				; See if we're on the last digit.
	cp a,1
	ld a,c				; Restore A.
	jr nz,skip_the_digit
write_the_digit:
	call write_char
	ld b,1				; Record that we've written any digit.
skip_the_digit:
	inc iy				; Next power of ten.
	inc iy
	ld a,e
	cp a,1				; See if that was the last one.
	jp nz,digit_loop
	pop de
	pop bc
	pop hl
	pop iy
	ret
#endlocal

; Write in decimal the signed word in HL. Destroys HL.
; TODO perhaps accept DE since that's what will be on the
; stack after an expression.
write_signed_decimal_word:
#local
	bit 7,h
	jp z,write_unsigned_decimal_word
	xor a,a				; Negate HL: First clear A.
	sub a,l
	ld l,a				; L = -L, carry iff L != 0.
	sbc a,a				; A = orig L == 0 ? 0 : -1.
	sub a,h
	ld h,a				; H = -H with borrow from L.
	ld a,'-'
	call write_char
	jp write_unsigned_decimal_word
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
	call enable_cursor
	call poll_keyboard
	or a
	jp z,loop
	call disable_cursor

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
	ld de,(cursor)
	dec de
	ld (cursor),de
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
	m_add a
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

; Generate a random 16-bit number, returning it in DE.
rnd:
#local
	; 16-bit xorshift pseudorandom number generator by John Metcalf.
	; de ^= de << 7
	; de ^= de >> 9
	; de ^= de << 8
	; From https://wikiti.brandonw.net/index.php?title=Z80_Routines:Math:Random
	ld de,(rnd_seed)

	ld a,d
	rra
	ld a,e
	rra
	xor d
	ld d,a
	ld a,e
	rra
	ld a,d
	rra
	xor e
	ld e,a
	xor d
	ld d,a

	ld (rnd_seed),de
	ret
#endlocal

; Set the pixel at X location B (0-127) and Y location C (0-47).
set_pixel:
#local
	push de

	ld a,b				; Make sure X is within bounds.
	cp a,128
	jp nc,runtime_error
	ld a,c				; Make sure Y is within bounds.
	cp a,48
	jp nc,runtime_error

	; First, we have to compute D=Y/3 and C=Y%3. We do both at once with
	; repeated subtraction of 3.
	ld d,255			; Start counter at -1, it's pre-incremented.
	ld a,c				; Put Y into A.
divmod3:
	inc d				; Count number of times we can subtract 3.
	sub a,3
	jr nc,divmod3			; Keep subtracting until we're negative.
	add a,3
	ld c,a				; C = Y%3

	; Next we want to compute the index location on the screen
	; and put that in DE. The computation is (Y/3)*64 + X/2.
	; We've already computed Y/3. The approach here is to start
	; with Y/3 in the high byte of DE and X*2 in the low byte.
	; This is equal to (Y/3)*256 + X*2, which is four times too high.
	; Do two 16-bit right shifts to get the correct value, and leave
	; the carry to hold the original least significant bit of X.
	ld e,b				; Original X value.
	sla e				; DE = (Y/3)*256 + X*2
	srl d				; DE >>= 1
	rr e				; DE = (Y/3)*128 + X
	srl d				; DE >>= 1
	rr e				; DE = (Y/3)*64 + X/2

	; DE now has the index into the screen location, and
	; carry has the least significant bit of the X location.
	; We now calculate the bit number (0-5) for the pixel within
	; the byte, and raise 2 to that power to get the bit pattern.
	ld a,c				; Y%3
	adc a,a				; Y%3 + X%2
	inc a				; djnz loops can't have zero iterations.
	ld b,a				; Load djnz counter.
	xor a,a				; Start with zero.
	scf				; And load the carry from the right.
power2:
	adc a,a				; First iteration becomes 1, then doubles.
	djnz power2

	; Now A is one of 1, 2, 4, 8, 16, or 32.
	ld c,a				; Stash it in C.

	; Fix up the address so it points to memory.
	ld a,d				; High byte of index.
	or a,hi(SCREEN_BEGIN)		; Position it on the screen.
	ld d,a

	; See what's there already.
	ld a,(de)
	or a,a
	; Copy the bug in the original ROM that doesn't check >= 192.
	jp m,byte_okay
	ld a,0x80
byte_okay:
	or a,c				; Set the pixel.
	ld (de),a			; And write it back to memory.

	pop de
	ret
#endlocal

; Divides BC by DE, putting quotient in AC and remainder in HL.
;
; This is a normal long division algorithm, where for each bit we
; see if the divisor can be subtracted, and if it can, we do so
; and record a 1 in the quotient. Whatever's left is the remainder.
;
; Algorithm:
; HL = 0                Remainder.
; AC = BC               Divisor.
; For 16 iterations:
;     HL <- AC <- 1     Shift 1 in because it's easy here.
;     If HL >= DE:
;         HL -= DE
;         AC -= 1	Remove the 1 we shifted in earlier.
bc_div_de:
#local
	ld hl,0				; Clear remainder.
	ld a,b				; Put dividend in AC.
	ld b,16				; Number of iterations (16 bits to process).
loop:
	sll c				; Stream divident out to carry, and
	rla				; ... stream in a 1 bit (might fix below).
	adc hl,hl			; Stream dividend into HL.
	sbc hl,de			; Subtract divisor, there's never a borrow.
	jr nc,continue			; See if we went below zero.
	add hl,de			; We did, put it back.
	dec c				; And remove the +1 we added at the top.
continue:
	djnz loop
	ret
#endlocal

; 16-bit signed or unsigned multiply. HL = BC*DE
bc_mul_de:
#local
	ld hl,0				; Clear HL.
	ld a,16				; 16 iterations of the loop.
loop:
	add hl,hl			; HL <<= 1, shift in 0, carry out.
	rl e				; DE <<= 1, shift in carry.
	rl d				; Shift out MSB of DE.
	jr nc,skip			; If carry shifted out...
	add hl,bc			; HL += BC.
skip:
	dec a				; Next loop iteration.
	jr nz,loop
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
runtime_error_msg:
	db "Runtime error", NL, 0
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

; Operator stack.
op_stack:
	ds MAX_OP_STACK_SIZE

; Number of operators in the op_stack.
op_stack_size:
	ds 1

; Forward reference to the end of the line.
eol_ref:
	ds 2

; Variables. Each variable is the name of the variable (one char, then
; a second optional char or nul), then the two-byte value. If the first
; byte of the name is zero, then this and all following entries are unused.
variables:
	ds MAX_VARS*4

; Where the program is compiled to.
binary:
	ds BINARY_SIZE

; Mark where our variables end.
bss_end:

program:
; Random pixels on the screen.
; line10:	db lo(line20), hi(line20), lo(10), hi(10), 0, 0, T_CLS, 0
; line20: db lo(line30), hi(line30), lo(20), hi(20), 0, 0, T_SET, '(', T_RND, '(127),', T_RND, '(47))', 0
; line30: db lo(line_end), hi(line_end), lo(30), hi(30), 0, 0, T_GOTO, ' 20', 0

; Fill screen with characters.
line10:	db lo(line20), hi(line20), lo(10), hi(10), 0, 0, 'I', T_OP_EQU, '15360', 0
line20: db lo(line30), hi(line30), lo(20), hi(20), 0, 0, T_POKE, ' I,191', 0
line30: db lo(line40), hi(line40), lo(30), hi(30), 0, 0, 'I', T_OP_EQU, 'I', T_OP_ADD, '1', 0
line40: db lo(line_end), hi(line_end), lo(40), hi(40), 0, 0, T_IF, ' I', T_OP_LT, '16384 ', T_THEN, ' ', T_GOTO, ' 20', 0


line_end: db 0, 0, 0, 0, 0, 0

	end 0x0000
