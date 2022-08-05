\ (n d -- q)
: / /mod swap drop ;
\ (n d -- r)
: mod /mod drop ;
\ (a b c -- a b c b c)
: 2dup over over ;
\ control structures.
: if immediate ' 0branch , here @ 0 , ;
: then immediate dup here @ swap - swap ! ;
: else immediate ' branch , here @ 0 , swap dup here @ swap - swap ! ;
: begin immediate here @ ;
: until immediate ' 0branch , here @ - , ;
: again immediate ' branch , here @ - , ;
: while immediate ' 0branch , here @ 0 , ;
: repeat immediate ' branch , swap here @ - , dup here @ swap - swap ! ;
\ basic logic and math.
: not if 0 else 1 then ;
: <= 2dup < -rot = or ;
: > <= not ;
: >= < not ;
: <> = not ;
\ write a space to the console.
: space 32 emit ;
\ dump all defined words (including native) to console.
: words latest @ begin ?dup while dup 3 + tell space @ repeat cr ;
\ add address of word being compiled to code segment.
: recurse immediate latest @ >cfa , ;
\ set the output base for the u. command
: decimal 10 base ! ;
: hex 16 base ! ;
: u. base @ /mod ?dup if recurse then dup 10 < if 48 else 55 then + emit ;
\ (x y -- y)
: nip swap drop ;
\ (x y -- y x y )
: tuck swap over ;
\ increment.
: 1+ 1 + ;
\ (x_u ... x_1 x_0 u -- x_u ... x_1 x_0 x_u)
: pick
    1+ \ add one because of 'u' on the stack
    2 * \ multiply by the word size
    dsp@ + \ add to the stack pointer
    @ \ and fetch
;
\ define a constant
: constant word create ' enter , ' lit , , ' exit , ;
\ def a var
: variable here @ 0 , word create ' enter , ' lit , , ' exit , ;

\ graphics routines
: rx gfx_width rndn ;
: ry gfx_height rndn ;
: rp rx ry set ;
: demo begin rp again ;

: do begin ;
: loop 1 + = until drop drop ;

\ My own array words.
: array here @ dup rot 2 * + here ! word create ' enter , ' lit , , ' exit , ; \ def an array, specify size in elements
: a[] swap 2 * + ; \ ( index array -- address )
: a@ a[] @ ; \ ( index array -- value )
: a! a[] ! ; \ ( value index array -- )
: @low @ $00FF and ;
: @high @ 8>> ;
: !low dup @ $FF00 and rot $00FF and or swap ! ;
: !high dup @ $00FF and rot 8<< or swap ! ;
: a@low a[] @low ;
: a@high a[] @high ;
: a!low a[] !low ; \ ( value index array -- )
: a!high a[] !high ; \ ( value index array -- )
