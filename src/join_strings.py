#!/usr/bin/env python3
import os

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix_multiline_strings():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    result = []
    in_sq = False
    in_dq = False
    in_tl = False
    
    i = 0
    while i < len(content):
        c = content[i]
        
        # Lookahead for escaping
        if c == '\\':
            result.append(c)
            if i + 1 < len(content):
                result.append(content[i+1])
                i += 2
                continue
        
        # Handle newlines inside single/double quotes
        if c == '\n' and (in_sq or in_dq):
            # Join line: skip newline AND all following whitespace
            i += 1
            while i < len(content) and content[i] in ' \t':
                i += 1
            # Add a single space to separate if it was formatted
            # result.append(' ') 
            # Actually, most of these are HTML, so no space might be better for tags, 
            # but space is safer for attributes.
            continue
            
        if c == "'" and not in_dq and not in_tl: in_sq = not in_sq
        elif c == '"' and not in_sq and not in_tl: in_dq = not in_dq
        elif c == '`' and not in_sq and not in_dq: in_tl = not in_tl
        
        result.append(c)
        i += 1
        
    new_content = "".join(result)
    
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Multi-line string joiner applied.")

if __name__ == "__main__":
    fix_multiline_strings()
