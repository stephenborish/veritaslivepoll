
import os
import re

def split_merged_lines(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    new_lines = []
    for line in lines:
        # If a line has a comment and then significant code keywords
        # Example: // some comment const x = 1
        # Example: // some comment function test() {
        # But wait, code often has // at the end: const x = 1; // comment. That's fine.
        # We only care when // is at the START (or just whitespace) and then has code.
        
        stripped = line.strip()
        if stripped.startswith('//'):
            # Look for common JS keywords after some words
            # We want to catch "// comment function" but NOT "// comment with function in name"
            # Actually, most of these merged lines happened at specific keywords.
            
            # Pattern: // ... (function|const|var|if\(|let|return|{)
            match = re.search(r'(//.*?)(function\b|const\b|var\b|if\s*\(|let\b|return\b|setTimeout\b|\{)', line)
            if match:
                # Split it
                pre = line[:match.start(2)]
                post = line[match.start(2):]
                new_lines.append(pre + '\n')
                # Recursively check post in case there are more
                # For now just add it
                new_lines.append(' ' * (len(line) - len(line.lstrip())) + post)
                continue
        
        # Also check for "} function" or "} var" or "} if"
        # Since the user's file has some weirdness
        if '}' in line and not stripped.startswith('//'):
             # Pattern: } (function|const|var|if|let|return)
             match = re.search(r'(\}\s*)(function|const|var|if|let|return|setTimeout)', line)
             if match:
                pre = line[:match.start(2)]
                post = line[match.start(2):]
                new_lines.append(pre + '\n')
                new_lines.append(' ' * (len(line) - len(line.lstrip())) + post)
                continue

        new_lines.append(line)

    with open(filepath, 'w') as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    split_merged_lines("/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html")
    print("Merged lines split.")
