#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def convert_all_interpolations():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Match any single quoted string containing ${
    # Pattern: ' [^']* ${ [^']* '
    sq_pattern = re.compile(r"'((?:[^'\\]|\\.)*\$\{.*?)'", re.MULTILINE)
    
    def repl_sq(match):
        inner = match.group(1)
        # Escape any single quotes that were literal
        inner = inner.replace("'", "\\'")
        return f"`{inner}`"
    
    content = sq_pattern.sub(repl_sq, content)
    
    # Match any double quoted string containing ${
    dq_pattern = re.compile(r"\"((?:[^\"\\]|\\.)*\$\{.*?)\"", re.MULTILINE)
    
    def repl_dq(match):
        inner = match.group(1)
        inner = inner.replace('"', '\\"')
        return f"`{inner}`"
    
    content = dq_pattern.sub(repl_dq, content)

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("All interpolation strings converted to template literals.")

if __name__ == "__main__":
    convert_all_interpolations()
