
import os

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix_newlines():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        
        # Check for start of broken string: html += ' (newline)
        # OR: line ends with ' but is clearly an open string assignment
        
        # Specific fix for renderReviewSummary pattern seen:
        # html += '
        # </div>';
        
        if line.strip().endswith("html += '"):
             # It expects content on next lines.
             if i + 1 < len(lines):
                 next_line = lines[i+1]
                 # If next line looks like HTML tag and ends with '; or '
                 if next_line.strip().startswith("<") or next_line.strip().startswith("</div>"):
                      # Merge
                      # Remove the trailing ' from line 1 check
                      # Actually, just join them.
                      # html += '</div>';
                      # We want to remove the newline.
                      joined = line.rstrip() + next_line.lstrip()
                      new_lines.append(joined)
                      i += 2
                      continue
        
        # Another pattern:
        # html += '<div
        # class="...">';
        if line.strip().endswith("html += '<div"):
             if i + 1 < len(lines):
                 next_line = lines[i+1]
                 if next_line.strip().startswith("class="):
                      joined = line.rstrip() + " " + next_line.lstrip()
                      new_lines.append(joined)
                      i += 2
                      continue

        # General fix for lines ending in single quote that shouldn't (open string)
        # Verify if it's "html += '"
        
        new_lines.append(line)
        i += 1
        
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Fixed newlines.")

if __name__ == "__main__":
    fix_newlines()
