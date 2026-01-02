#!/usr/bin/env python3
import re
import sys

def find_multiline_violations(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    violations = []
    in_single_quote = False
    in_double_quote = False
    in_template_literal = False
    
    for i, line in enumerate(lines):
        line_num = i + 1
        j = 0
        while j < len(line):
            char = line[j]
            prev_char = line[j-1] if j > 0 else ''
            
            if char == '\\': # Skip next char
                j += 2
                continue
            
            if char == "'" and not in_double_quote and not in_template_literal:
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote and not in_template_literal:
                in_double_quote = not in_double_quote
            elif char == '`' and not in_single_quote and not in_double_quote:
                in_template_literal = not in_template_literal
            
            j += 1
        
        # At the end of the line, if we are still in a single or double quote, it's a violation
        if in_single_quote:
            violations.append((line_num, "Unterminated single quote"))
            # We don't reset, because it might be a valid multi-line string (which is the violation)
        if in_double_quote:
            violations.append((line_num, "Unterminated double quote"))
            
    return violations

if __name__ == "__main__":
    file = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"
    violations = find_multiline_violations(file)
    for line, msg in violations:
        print(f"Line {line}: {msg}")
