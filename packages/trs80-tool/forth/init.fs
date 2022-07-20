: / /mod swap drop ;
: mod /mod drop ;
: 2dup over over ;
: if immediate ' 0branch , here @ 0000 , ;
: then immediate dup here @ swap - swap ! ;
: else immediate ' branch , here @ 0000 , swap dup here @ swap - swap ! ;
: begin immediate here @ ;
: until immediate ' 0branch , here @ - , ;
: again immediate ' branch , here @ - , ;
: while immediate ' 0branch , here @ 0000 , ;
: repeat immediate ' branch , swap here @ - , dup here @ swap - swap ! ;
: not if 0000 else 0001 then ;
: <= 2dup < -rot = or ;
: > <= not ;
: >= < not ;
: <> = not ;
: space 0020 emit ;
: words latest @ begin ?dup while dup 0003 + tell space @ repeat cr ;
: recurse immediate latest @ >cfa , ;
: decimal 000a base ! ;
: hex 0010 base ! ;
: u. base @ /mod ?dup if recurse then dup 000a < if 0030 else 000a - 0041 then + emit ;
: nip swap drop ; \ ( x y -- y )
: tuck swap over ; \ (x y -- y x y )
: 1+ 0001 + ;
: pick \ ( x_u ... x_1 x_0 u -- x_u ... x_1 x_0 x_u )
    1+ \ add one because of 'u' on the stack
    0002 * \ multiply by the word size
    dsp@ + \ add to the stack pointer
    @ \ and fetch
;
: constant word create ' enter , ' lit , , ' exit , ; \ define a constant
: variable here @ 0000 , word create ' enter , ' lit , , ' exit , ; \ def a var

: rx gfx_width rndn ;
: ry gfx_height rndn ;
\ : rl rx ry rx ry line ;
\ : rc rnd rnd rnd color ;
\ : demo begin rc rl again ;

\ My own array words.
: array here @ dup rot 0002 * + here ! word create ' enter , ' lit , , ' exit , ; \ def an array, specify size in elements
: a[] swap 0002 * + ; \ ( index array -- address )
: a@ a[] @ ; \ ( index array -- value )
: a! a[] ! ; \ ( value index array -- )
: @low @ 00FF and ;
: @high @ 8>> ;
: !low dup @ FF00 and rot 00FF and or swap ! ;
: !high dup @ 00FF and rot 8<< or swap ! ;
: a@low a[] @low ;
: a@high a[] @high ;
: a!low a[] !low ; \ ( value index array -- )
: a!high a[] !high ; \ ( value index array -- )
