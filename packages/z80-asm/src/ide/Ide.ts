
import CodeMirror from "codemirror";
import "codemirror/lib/codemirror.css";

const code = `
CSTART:
        LD      HL,WRKSPC       ; Start of workspace RAM
        LD      SP,HL           ; Set up a temporary stack
        JP      INITST          ; Go to initialise

INIT:   LD      DE,INITAB       ; Initialise workspace
        LD      B,INITBE-INITAB+3; Bytes to copy
        LD      HL,WRKSPC       ; Into workspace RAM
COPY:   LD      A,(DE)          ; Get source
        LD      (HL),A          ; To destination
        INC     HL              ; Next destination
        INC     DE              ; Next source
        DEC     B               ; Count bytes
        JP      NZ,COPY         ; More to move
        LD      SP,HL           ; Temporary stack
        CALL    CLREG           ; Clear registers and stack
        CALL    PRNTCRLF        ; Output CRLF
        LD      (BUFFER+72+1),A ; Mark end of buffer
        LD      (PROGST),A      ; Initialise program area
MSIZE:  LD      HL,MEMMSG       ; Point to message
        CALL    PRS             ; Output "Memory size"
        CALL    PROMPT          ; Get input with '?'
        CALL    GETCHR          ; Get next character
        OR      A               ; Set flags
        JP      NZ,TSTMEM       ; If number - Test if RAM there
        LD      HL,STLOOK       ; Point to start of RAM
`;

export function main() {
    const element = document.getElementById("editor") as HTMLElement;
    const config: CodeMirror.EditorConfiguration = {
        value: code,
        lineNumbers: true,
    };
    const cm = CodeMirror(element, config);
}

