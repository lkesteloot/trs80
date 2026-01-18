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
KEYBOARD_BEGIN equ 0x3800
CURSOR_HALF_PERIOD equ 7
CURSOR_DISABLED equ 0xFF

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
	; Configure stack.
	ld sp,0x0000

	; Configure cursor.
	ld hl,SCREEN_BEGIN
	ld (cursor),hl
	ld hl,cursor_counter
	ld (hl),CURSOR_DISABLED

	; Initialize other variables.
	ld a,0
	ld (write_char_buffer+1),a
	ld ix,keyboard_buffer
	ld (ix+0),a
	ld (ix+1),a
	ld (ix+2),a
	ld (ix+3),a
	ld (ix+4),a
	ld (ix+5),a
	ld (ix+6),a

	; Configure and enable interrupts.
	im 1 ; rst 38 on maskable interrupt
	ld a,0x04
	out (0xe0),a ; enable timer interrupt
	ei

	; Clear the screen; home cursor.
	call cls
	
	; Write boot message.
	ld hl,boot_message
	call write_text

	ld hl,ready_prompt
	call write_text

prompt_loop:
	ld hl,line_prompt
	call write_text

	ld hl,input_buffer
	ld b,INPUT_BUFFER_SIZE
	call read_text
	call tokenize
	call detokenize
	ld a,NL
	call write_char

	jp prompt_loop

; Clear the screen and reset the cursor
; to the top-left corner.
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

; Tokenize the string at HL in-place, nul-terminating the result.
; TODO this routine is *much* slower than the TRS-80's. Compare it to theirs.
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
	ld a,'{'
	call write_char
	ld a,(bc)			; Read the token.
print_token_loop:
	and a,0x7F			; Clear high bit.
	call write_char
	inc bc
	ld a,(bc)
	or a,a
	jp p,print_token_loop		; Until we reach start of next token.
	ld a,'}'
	call write_char
	inc hl				; Next input char.
	jp loop

plain_char:
	call write_char			; Write plain char.
	inc hl				; Next input char.
	jp loop

done:
	pop bc
	pop hl
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
	
boot_message:
	db "Model III Basic Compiler", NL
	db "(c) '26 Lawrence Kesteloot", NL, 0
ready_prompt:
	db "Ready", NL, 0
line_prompt:
	db ">", 0
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
	
; Variables in RAM.
	.org 0x4000

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

	end 0x0000
	