#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def convert_to_template_literals():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Match multi-line single quoted strings
    # We use a non-greedy match to avoid matching across multiple valid strings
    sq_pattern = re.compile(r"'([^']*?\n[^']*?)'", re.MULTILINE | re.DOTALL)
    
    def repl_sq(match):
        inner = match.group(1)
        # If it's already a template literal or contains escaping, be careful.
        # But here we just want to convert to backticks.
        # Escape any existing backticks inside.
        inner = inner.replace('`', '\\`')
        return f"`{inner}`"
    
    content = sq_pattern.sub(repl_sq, content)
    
    # 2. Match multi-line double quoted strings
    dq_pattern = re.compile(r'"([^"]*?\n[^"]*?)"', re.MULTILINE | re.DOTALL)
    
    def repl_dq(match):
        inner = match.group(1)
        inner = inner.replace('`', '\\`')
        return f"`{inner}`"
    
    content = dq_pattern.sub(repl_dq, content)

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Multi-line strings converted to template literals.")

if __name__ == "__main__":
    convert_to_template_literals()
