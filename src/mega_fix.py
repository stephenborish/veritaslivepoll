#!/usr/bin/env python3
import re
import os

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def mega_fix():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # 1. Fix literal ${...} inside single-quoted strings
    # Pattern: ' ... ${ ... } ... '
    # We want to change the surrounding quotes to backticks
    
    # This is slightly dangerous if it's not a JS string, but in this file,
    # almost everything is JS code within a <script> block (since it's a _Scripts.html file)
    
    def fix_sq_literal(match):
        inner = match.group(1)
        if '${' in inner:
            # Check if it spans multiple lines. If it does, backticks are better anyway.
            # Clean up newlines if it's meant to be a single line HTML part
            cleaned = inner.replace("'", "\\'") # Escape any single quotes that are now inside backticks
            return f"`{cleaned}`"
        return f"'{inner}'"

    # Match single quoted strings
    # Regex for single quoted string: ' ( [^'\\] | \\. )* '
    sq_pattern = re.compile(r"'((?:[^'\\]|\\.)*)'")
    content = sq_pattern.sub(fix_sq_literal, content)
    
    # Do the same for double quotes
    def fix_dq_literal(match):
        inner = match.group(1)
        if '${' in inner:
            cleaned = inner.replace('"', '\\"')
            return f"`{cleaned}`"
        return f'"{inner}"'
    
    dq_pattern = re.compile(r'"((?:[^"\\]|\\.)*)"')
    content = dq_pattern.sub(fix_dq_literal, content)

    # 2. Fix multi-line single/double quoted strings (UNSUPPORTED in JS)
    # We'll use a more aggressive regex to find quotes that span lines
    
    # This is tricky because we don't want to match entire blocks of code.
    # But in this file, the "strings" are often HTML blocks.
    
    # Look for ' followed by many characters including newlines until '
    # BUT stop if we see a semicolon or something that indicates end of statement? 
    # No, strings can be part of expressions.
    
    # Let's target the specific broken patterns from the check_violations script.
    # Actually, let's just join lines for ANY single quoted string that has a newline.
    
    def fix_multiline_sq(match):
        content = match.group(1)
        if '\n' in content:
            # Convert to template literal
            return f"`{content}`"
        return f"'{content}'"
    
    # Aggressive multiline match for single quotes
    # Match ' until the next ' that is followed by something reasonable (like ; or + or ) or \n)
    # This is risky. Let's try to find the specific ones.
    
    # 3. Specific cleanups for the "English phrases"
    content = content.replace("min/max for scaling", "// min/max for scaling")
    content = content.replace("SVG if it does not exist", "// SVG if it does not exist")
    content = content.replace("Add gradient definition", "// Add gradient definition")
    content = content.replace("Clear previous content except defs", "// Clear previous content except defs")
    
    # 4. Fix split keywords (function\nName, var\nName)
    content = re.sub(r'\bfunction\s*\n\s*', 'function ', content)
    content = re.sub(r'\bvar\s*\n\s*', 'var ', content)
    content = re.sub(r'\bconst\s*\n\s*', 'const ', content)
    content = re.sub(r'\blet\s*\n\s*', 'let ', content)
    content = re.sub(r'\bwindow\.\s*\n\s*', 'window.', content)

    if content != original:
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Mega fix applied.")
    else:
        print("No changes made.")

if __name__ == "__main__":
    mega_fix()
