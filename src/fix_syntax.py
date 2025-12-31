
import os
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix_file():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # FIX 1: Checkbox ternary split
        # specific pattern: data-q-index="' + qIndex + '" ' + (q.metacognitionEnabled ? '
        if "data-q-index=\"' + qIndex + '\" ' + (q.metacognitionEnabled ? '" in line and line.strip().endswith("'"):
            # Check next line for "checked' : '' )"
            if i + 1 < len(lines):
                next_line = lines[i+1]
                if "checked' : '' )" in next_line:
                    # Merge lines
                    indent = line[:line.find("data-q-index")]
                    fixed_line = indent + "data-q-index=\"' + qIndex + '\" ' + (q.metacognitionEnabled ? 'checked' : '')\n"
                    new_lines.append(fixed_line)
                    i += 2
                    continue

        # FIX 2: bodyHtml broken init and comments
        # Pattern: ; // Compact
        if "; // Compact" in line and i + 5 < len(lines):
             # We suspect lines like:
             # ; // Compact
             # Question Body
             # var
             # bodyHtml='...'
             # + // Question
             # Row: Text +
             # Image
             # Upload '<div ...'
             
             # We will look ahead to see if we match the start of this block
             # and replace the whole block with clean code.
             
             # Let's count how many lines to skip.
             # We want to replace from "; // Compact" down to "Upload '<div class=\"flex gap-3\">'"
             # Or more robustly, find the start of bodyHtml assignment
             
             # Using a simple state machine for this block
             # We will just replace the problematic lines if we find the signature
             pass

        # Robust fix for FIX 2:
        if "var" in line and "bodyHtml='<div class=\"question-card-body" in lines[i+1]:
             # Join var and bodyHtml line
             indent = lines[i+1][:lines[i+1].find("bodyHtml")]
             new_lines.append(indent + "var bodyHtml = '<div class=\"question-card-body p-4 space-y-3\">'\n")
             i += 2 # Skip var and bodyHtml lines
             continue
        
        if "+ // Question" in line:
             if i + 3 < len(lines):
                  # Skip the broken comment lines "Row: Text +", "Image", "Upload '<div..."
                  # We want to Output: + '<div class="flex gap-3">'
                  # But we need to verify we are in the broken block.
                  if "Row: Text +" in lines[i+1] and "Image" in lines[i+2]:
                      new_lines.append(lines[i][:lines[i].find("+")] + "+ '<div class=\"flex gap-3\">'\n")
                      i += 4 # Skip '+ // Question', 'Row...', 'Image', "Upload '<div..."
                      continue

        # FIX 3: renderReviewSummary line breaks?
        # Use regex to find single quoted strings ending with newline?
        # Risky to auto-fix everything.
        
        new_lines.append(line)
        i += 1

    # Overwrite
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Fixed syntax errors.")

if __name__ == "__main__":
    fix_file()
