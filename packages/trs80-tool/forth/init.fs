\ (n d -- q)
: / /mod swap drop ;
\ (n d -- r)
: mod /mod drop ;
\ define a constant: 123 constant foo
: constant word create ' enter , ' lit , , ' exit , ;
\ define a variable, initialized to 0: variable foo
\ read with: foo @
\ write with: 5 foo !
: variable here @ 0 , word create ' enter , ' lit , , ' exit , ;
\ control structures: cond if code else code then
: if immediate ' 0branch , here @ 0 , ;
: then immediate dup here @ swap - swap ! ;
: else immediate ' branch , here @ 0 , swap dup here @ swap - swap ! ;
: not if 0 else 1 then ;
\ (a b c -- a b c b c)
: 2dup over over ;
\ basic logic and math.
: <= 2dup < -rot = or ;
: > <= not ;
: >= < not ;
: <> = not ;
\ push address of next position in code segment. starts all loops, essentially
\ recording the top address of the loop.
: begin immediate here @ ;
\ loop until non-zero: begin 123 . cr 0 until
\ add "0branch <DELTA>" to code, where DELTA is the relative jump to the start of the loop.
\ the only thing left on the parameter stack (after the top address) should be the test value.
: until immediate ' 0branch , here @ - , ;
\ infinite loop: begin 123 . cr until
\ add "branch <DELTA>" to code, where DELTA is the relative jump to the start of the loop.
\ the top of the parameter stack should be the top addressed pushed by "begin".
: again immediate ' branch , here @ - , ;
\ loop while non-zero: 5 begin ?dup while dup . cr 1 - repeat
\ add "0branch 0" to code, where 0 is a temporary that's replaced by "repeat" later.
\ push the address of the zero.
: while immediate ' 0branch , here @ 0 , ;
\ end while loop (see above). add "branch <DELTA>" where DELTA is the relative jump to
\ the top of the loop. Also update the 0 added by "while" with the current IP (past the loop).
: repeat immediate ' branch , swap here @ - , dup here @ swap - swap ! ;

\ do loop: 10 0 do i . cr loop
\ loops from 0 (inclusive) to 10 (exclusive), setting i to value.
\ Do loops can be nested three times. Define a stack pointer variable
\ for the stack. The stack grows downward. First the limit is pushed,
\ then the index.
variable doloopptr
\ Allocate space for the three indices and the three limits
\ (3 depth * 2 vars * 2 bytes = 12 bytes).
here @ 12 + here !
\ Initialize the stack pointer to just above the stack.
here @ doloopptr !
\ Define some index accessors, from the inside out.
: i doloopptr @ @ ;
: j doloopptr @ 4 + @ ;
: k doloopptr @ 8 + @ ;
\ : foo 10 0 do i . cr loop ;
\ Compiles to:
\ 10 0 i ! limit ! (*) limit i @ > 0branch (to end) i . cr i @ 1 + i ! branch (to *) (end)
: do immediate
    ' doloopptr ,       \ pre-decrement do-loop stack pointer
        ' @ ,
        ' lit ,
        4 ,
        ' - ,
        ' doloopptr ,
        ' ! ,
    ' doloopptr ,       \ save index
        ' @ ,
        ' ! ,
    ' doloopptr ,       \ save bound
        ' @ ,
        ' lit ,
        2 ,
        ' + ,
        ' ! ,
    here @              \ push location of start of loop
    ' doloopptr ,       \ read bound
        ' @ ,
        ' lit ,
        2 ,
        ' + ,
        ' @ ,
    ' i ,               \ read index
    ' > ,               \ compare, true (non-zero) if bound > index (still looping)
    ' 0branch ,         \ loop if false (no longer looping
    here @ 0 ,          \ leave space for jump amount, and push its location
    ;
: loop immediate
    ' i ,               \ read index
    ' lit ,             \ increment
        1 ,
        ' + ,
    ' doloopptr ,       \ write index
        ' @ ,
        ' ! ,
    ' branch ,          \ jump to top
    swap here @ - ,     \ compute and write jump-to-top amount
    dup here @ swap - swap ! \ write to branch jump location
    ' doloopptr ,       \ post-increment do-loop stack pointer
        ' @ ,
        ' lit ,
        4 ,
        ' + ,
        ' doloopptr ,
        ' ! ,
    ;

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

\ Swap two variables. Pass in their addresses.
: swapvar           \ &a &b
    dup @           \ &a &b b
    rot             \ &b b &a
    dup @           \ &b b &a a
    swap            \ &b b a &a
    rot             \ &b a &a b
    swap            \ &b a b &a
    !               \ &b a
    swap            \ a &b
    !
    ;

\ The difference between two variables: abs(a - b)
: diff              \ a b
    over            \ a b a
    over            \ a b a b
    < if            \ a b (a < b)
        swap        \ b a
    then
    -
    ;

\ graphics routines
\ (x1 y1 x2 y2 --)
variable line-x1
variable line-x2
variable line-y1
variable line-y2
variable line-dx
variable line-dy
variable line-m
variable line-v
: line
    \ Save parameters.
    line-y2 !
    line-x2 !
    line-y1 !
    line-x1 !
    \ See if we have a mostly-vertical or mostly-horizontal line.
    line-x1 @ line-x2 @ diff line-y1 @ line-y2 @ diff < if
        \ dx < dy, vertical line.
        line-y2 @ line-y1 @ < if
            line-x1 line-x2 swapvar
            line-y1 line-y2 swapvar
        then
        line-x2 @ line-x1 @ - line-dx !
        line-y2 @ line-y1 @ - line-dy !
        line-x1 @ 256 * line-v !
        line-x1 @ line-x2 @ < if
            line-dx @ 256 * line-dy @ / line-m !
            line-y2 @ 1 + line-y1 @ do
                line-v @ 256 / i set
                line-v @ line-m @ + line-v !
            loop
        else
            0 line-dx @ - 256 * line-dy @ / line-m !
            line-y2 @ 1 + line-y1 @ do
                line-v @ 256 / i set
                line-v @ line-m @ - line-v !
            loop
        then
    else
        \ dy < dx, horizontal line.
        line-x2 @ line-x1 @ < if
            line-x1 line-x2 swapvar
            line-y1 line-y2 swapvar
        then
        line-x2 @ line-x1 @ - line-dx !
        line-y2 @ line-y1 @ - line-dy !
        line-y1 @ 256 * line-v !
        line-y1 @ line-y2 @ < if
            line-dy @ 256 * line-dx @ / line-m !
            line-x2 @ 1 + line-x1 @ do
                i line-v @ 256 / set
                line-v @ line-m @ + line-v !
            loop
        else
            0 line-dy @ - 256 * line-dx @ / line-m !
            line-x2 @ 1 + line-x1 @ do
                i line-v @ 256 / set
                line-v @ line-m @ - line-v !
            loop
        then
    then
    ;

: rx width rndn ;
: ry height rndn ;
: demo-points cls begin
        rx ry set
    again ;
: demo-lines cls begin
        rx ry rx ry line
    again ;
: demo-star cls
    13 0 do 64 24 i 10 * 0 line loop
    13 0 do 64 24 i 10 * 47 line loop
    12 0 do 64 24 0 i 4 * line loop
    12 0 do 64 24 127 i 4 * line loop
    ;
\ 4 0 do 117 i 10 * 10 + 10 24 line loop ;

\ My own array words.
\ : array here @ dup rot 2 * + here ! word create ' enter , ' lit , , ' exit , ; \ def an array, specify size in elements
\ : a[] swap 2 * + ; \ ( index array -- address )
\ : a@ a[] @ ; \ ( index array -- value )
\ : a! a[] ! ; \ ( value index array -- )
\ : @low @ $00FF and ;
\ : @high @ 8>> ;
\ : !low dup @ $FF00 and rot $00FF and or swap ! ;
\ : !high dup @ $00FF and rot 8<< or swap ! ;
\ : a@low a[] @low ;
\ : a@high a[] @high ;
\ : a!low a[] !low ; \ ( value index array -- )
\ : a!high a[] !high ; \ ( value index array -- )
