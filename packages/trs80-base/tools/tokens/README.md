
I copy/pasted the list of reserved words, tokens, and entry locations from
this web page:

https://www.trs-80.com/wordpress/zaps-patches-pokes-tips/model-iii-rom-explained-part-2/

(see address 1608) into a spreadsheet and exported the tokens.csv file. Convert this
to TypeScript using this command:

    python3 process_tokens.py < tokens.csv > ../../src/BasicTokens.ts


