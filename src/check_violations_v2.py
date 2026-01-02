#!/usr/bin/env python3
import re

def check_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Strip single line comments
    content = re.sub(r'//.*', '', content)
    # Strip multi line comments
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    
    lines = content.splitlines()
    violations = []
    
    in_sq = False
    in_dq = False
    in_tl = False
    
    for i, line in enumerate(lines):
        line_num = i + 1
        j = 0
        while j < len(line):
            c = line[j]
            if c == '\\':
                j += 2
                continue
            if c == "'" and not in_dq and not in_tl: in_sq = not in_sq
            elif c == '"' and not in_sq and not in_tl: in_dq = not in_dq
            elif c == '`' and not in_sq and not in_dq: in_tl = not in_tl
            j += 1
        
        if in_sq: violations.append((line_num, "Single quote"))
        if in_dq: violations.append((line_num, "Double quote"))
        # Template literals ARE allowed to span lines, so we don't report in_tl
        
    return violations

if __name__ == "__main__":
    file = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"
    v = check_file(file)
    for l, m in v:
        print(f"Line {l}: Unterminated {m}")
