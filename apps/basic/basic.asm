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
	push af
	call blink_cursor
	; Reset timer latch.
	in (0xec)
	pop af
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

	; Configure interrupts.
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
	and a,255-SCREEN_WIDTH+1
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
	call read_key
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

; Read a key from the keyboard and put its
; ASCII value in A.
read_key:
#local
	push hl
	push bc
	push de

	; Pointer to the keyboard matrix.
	ld hl,KEYBOARD_BEGIN+1
	; Pointer into the letter array.
	ld de,0
loop:
	; Load byte from keyboard matrix.
	ld a,(hl)
	; Number of bits to check.
	ld b,8
bit_loop:
	; Check lowest bit.
	bit 0,a
	; Its key is pressed.
	jp nz,found

	; Shift to the next key.
	srl a
	; Next byte in letter array.
	inc de
	; Loop through all bits.
	djnz bit_loop

	; Shift low byte of HL to get next byte address.
	ld a,l
	sla a
	ld l,a
	cp 0x80
	jp nz,loop

	; No key is down.
	xor a
	jp done

found:

	; Wait until key is released.
	; TODO handle key repeat here by timing out.
	; Actually no remove this altogether and check
	; the next time we come in!
release_loop:
	ld a,(hl)
	or a
	jp nz,release_loop

	; See if shift key is pressed.
	ld hl,keyboard_matrix_shifted
	ld a,(KEYBOARD_BEGIN+128)
	or a
	jp nz,shift_pressed
	ld hl,keyboard_matrix_unshifted

shift_pressed:
	ld a,e
	add a,l
	ld e,a
	ld a,d
	adc a,h
	ld d,a
	ld a,(de)

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

; Blink the cursor if it's enabled. Call this only from an
; interrupt context.
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
; TODO all these variables need to be initialized explicitly by code.
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

	end
	