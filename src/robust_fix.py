#!/usr/bin/env python3
import os
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def robust_fix():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. First, fix the known "flex"-1 and "flex" gap patterns
    content = content.replace('"flex"-1', '"flex-1"')
    content = content.replace('"flex" gap-4', '"flex gap-4"')
    content = content.replace('"flex" gap-2', '"flex gap-2"')
    
    # 2. Fix the broken material-symbols-outlined pattern
    content = content.replace('class="material-symbols-outlined>', 'class="material-symbols-outlined">')
    
    # 3. Use an interactive-like state machine to find and fix unclosed quotes IN ATTRIBUTES
    # Attribute pattern: name="Value (possibly containing ${...})
    # If we see name="...>${...} or name="...>
    # we should add the missing quote.
    
    result = []
    in_tl = False
    in_attr = False
    i = 0
    while i < len(content):
        c = content[i]
        
        # Handle escapes
        if c == '\\':
            result.append(c)
            if i+1 < len(content):
                result.append(content[i+1])
                i += 2
            else:
                i += 1
            continue
            
        if c == '`' and not in_attr:
            in_tl = not in_tl
        
        # If we are inside a template literal, we look for attributes
        if in_tl:
            if c == '=':
                # Look ahead for a quote
                if i+1 < len(content) and content[i+1] == '"':
                    in_attr = True
            elif c == '"' and in_attr:
                in_attr = False
            elif c == '>' and in_attr:
                # OOPS! We reached the end of a tag but didn't close the attribute!
                # Add the closing quote before the >
                result.append('"')
                in_attr = False
        
        result.append(c)
        i += 1
        
    content = "".join(result)
    
    # 4. Final sweep for the newly introduced "flex" gap-4 type things
    # If we have "Attribute" Something
    content = re.sub(r'class="([^">]+)"\s*([^=">\s]+)(?=[^>]*>)', r'class="\1 \2', content)

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Robust fix applied.")

if __name__ == "__main__":
    robust_fix()
