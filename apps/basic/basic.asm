SCREEN_WIDTH equ 64
SCREEN_HEIGHT equ 16
SCREEN_BEGIN equ 0x3C00
SCREEN_SIZE equ SCREEN_WIDTH*SCREEN_HEIGHT
SCREEN_END equ SCREEN_BEGIN+SCREEN_SIZE
CURSOR_CHAR equ 128+16+32
CLEAR_CHAR equ 32
INPUT_BUFFER_SIZE equ 64
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
	ld (hl),CLEAR_CHAR
	ld de,SCREEN_BEGIN+1
	ld bc,SCREEN_SIZE-1

	ldir

	pop bc
	pop de
	pop hl

	ld hl,SCREEN_BEGIN
	ld (cursor),hl
	call enable_cursor
	
	ret
#endlocal

; Write the nul-terminated string at HL
; to the cursor position. Leaves HL
; one past the nul.
write_text:
#local
	push de
	call disable_cursor
	ld de,(cursor)

loop:
	ld a,(hl)
	inc hl
	or a
	jp z,end_loop

	cp a,10
	jp z,newline

	ld (de),a
	inc de
	jp loop

newline:
	ld a,e
	add a,SCREEN_WIDTH
	ld e,a
	ld a,d
	adc 0
	ld d,a
	ld a,e
	and a,~(SCREEN_WIDTH-1)
	ld e,a
	; TODO scroll when past the bottom of the screen.
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

	cp a,10
	jp z,done

	cp a,8
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
	; TODO check C against B.

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
; Shift is not included. If multiple keys are
; being pressed, the one most recently pressed
; is returned.
poll_keyboard:
#local
	; TODO remove these?
	push hl
	push bc
	push de

	; Pointer to the keyboard matrix.
	ld bc,KEYBOARD_BEGIN+0x01
	; Pointer into the keyboard buffer.
	ld hl,keyboard_buffer
	; The row we're on.
	ld d,0
byte_loop:
	; Load byte from keyboard matrix.
	ld a,(bc)
	; Save it.
	ld e,a
	; See what's changed since last time.
	xor a,(hl)
	; Save new value.
	ld (hl),e
	; See what's pressed since last time.
	and a,e
	; If anything has been pressed, handle it.
	jr nz,found_key
	; Next row.
	inc d
	inc hl
	rlc c
	; If bit 8 isn't set, then there's more to do.
	jp p,byte_loop
	; Done checking all rows.
	xor a,a
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
	in (0xec) ; Reset timer latch.
	pop af
	ret
#endlocal
	
boot_message:
	db "BASIC Compiler", 10, 0
ready_prompt:
	db "Ready", 10, 0
line_prompt:
	db ">", 0
keyboard_matrix_unshifted:
	db "@abcdefghijklmnopqrstuvwxyz     0123456789:;,-./", 10, 0, 27, 0, 0, 8, 9, 32
keyboard_matrix_shifted:
	db "`ABCDEFGHIJKLMNOPQRSTUVWXYZ     _!", 34, "#$%&'()*+<=>?", 10, 0, 27, 0, 0, 8, 9, 32

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
	