
import subprocess
import os
import re

def get_first_syntax_error():
    # Re-extract
    with open("src/Teacher_Scripts.html", 'r') as f:
        content = f.read()
    
    # Extract script content
    match = re.search(r'<script>(.*?)</script>', content, re.DOTALL)
    if not match:
        return None, "No script tags"
    
    script_content = match.group(1)
    with open("temp_scripts_loop.js", "w") as f:
        f.write(script_content)
    
    result = subprocess.run(["node", "-c", "temp_scripts_loop.js"], capture_output=True, text=True)
    if result.returncode == 0:
        return None, "OK"
    
    # Extract line number from error
    # temp_scripts_loop.js:385
    err_match = re.search(r'temp_scripts_loop.js:(\d+)', result.stderr)
    if not err_match:
         return None, result.stderr
    
    return int(err_match.group(1)), result.stderr

def fix_line(line_num):
    filepath = "src/Teacher_Scripts.html"
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    # Line number in temp_scripts corresponds to line in HTML?
    # No, we need to find the offset.
    # Actually, if we added <script> at line 1, then line N in temp is line N+1 in HTML?
    # Let's just find the line in the HTML file.
    
    # Re-extract to find where script starts
    with open(filepath, 'r') as f:
        full_content = f.read()
    
    script_start_idx = full_content.find('<script>')
    if script_start_idx == -1: return False
    
    # Count lines before script_start
    lines_before = full_content[:script_start_idx].count('\n') + 1
    
    html_target_line = lines_before + line_num
    
    target_idx = html_target_line - 1
    if target_idx >= len(lines): return False
    
    original_line = lines[target_idx]
    
    # If it's already a comment, something else is wrong
    if original_line.strip().startswith('//'):
         return False
    
    # Check if it looks like a comment (starts with word, not keyword)
    # Actually, even if it doesn't, we are desperate.
    # But let's be careful.
    
    # Just comment it out if it contains English-looking stuff
    # Or start with a capital letter and space?
    
    print(f"Fixing line {html_target_line}: {original_line.strip()}")
    lines[target_idx] = "  // " + original_line.lstrip()
    
    with open(filepath, 'w') as f:
        f.writelines(lines)
    return True

if __name__ == "__main__":
    for _ in range(50):
        line_num, err = get_first_syntax_error()
        if line_num is None:
            print(f"Finished: {err}")
            break
        
        if not fix_line(line_num):
            print(f"Failed to fix line {line_num}. Error: {err}")
            break
