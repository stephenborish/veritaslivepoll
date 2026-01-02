
import os
import re

def mega_fix(filepath):
    with open(filepath, 'r') as f:
        text = f.read()

    # We want to split lines that were concatenated, but avoid splitting inside strings or comments.
    # This is hard without a full parser. Let's use a simpler approach:
    # Split on keywords IF they are preceded by a non-newline character.
    
    keywords = ["const", "let", "var", "function", "if", "for", "while", "return", "setTimeout", "setInterval", "try", "catch", "finally", "switch", "case", "default", "break", "continue", "throw", "await", "async", "window", "document"]
    
    # 1. Split on keywords preceded by code (excluding strings/comments)
    for kw in keywords:
        # Match anything then the keyword, making sure it's not a property access or similar
        # e.g., "};const" -> "};\nconst"
        # We'll use a regex that looks for a word boundary and a preceding character that isn't a newline or space
        text = re.sub(rf'([^\n\s;{{}}\[])\s*\b{kw}\b', rf'\1\n{kw}', text)
        
    # 2. Split on delimiters followed by code
    # e.g., "};if" -> "};\nif"
    text = re.sub(r'([;{}])\s*([a-zA-Z_$])', r'\1\n\2', text)
    
    # 3. Fix the specific `${` issue - it should NEVER be split
    text = text.replace('${\n', '${')

    with open(filepath, 'w') as f:
        f.write(text)

if __name__ == "__main__":
    mega_fix("/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html")
    print("Mega Fixer applied (refined).")
