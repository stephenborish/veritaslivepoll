
import os
import re

def fix_broken_comments(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()
    
    keywords = ["const", "let", "var", "function", "if", "for", "while", "return", "setTimeout", "try", "switch", "case", "break", "continue", "throw", "await", "async", "window", "document", "console"]
    
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
            new_lines.append(line)
            continue
            
        fixed = False
        for kw in keywords:
            # Look for keyword with word boundaries, and something before it
            # The 'something before' should not just be whitespace
            match = re.search(rf'^(\s*\S+.*?)\b{kw}\b\s*(.*)$', line)
            if match:
                pre_full, post = match.groups()
                # If pre_full ends with something that looks like English or broken code
                # e.g., "System===" or "Calculate min/max for scaling "
                
                # Heuristic: if 'pre' contains English words or doesn't look like a valid statement prefix
                pre_stripped = pre_full.strip()
                
                # Avoid catching valid JS like "if (x) {"
                if pre_stripped.endswith('(') or pre_stripped.endswith('{') or pre_stripped.endswith(','):
                    continue
                
                # If it contains English-looking tokens or is just weird
                if any(c in pre_stripped for c in ['=', '/', ' ']) or len(pre_stripped) > 5:
                     print(f"Fixing: {line.strip()[:50]}...")
                     indent = re.match(r'^\s*', line).group(0)
                     new_lines.append(f"{indent}// {pre_stripped}\n")
                     new_lines.append(f"{indent}{kw} {post}\n")
                     fixed = True
                     break
        
        if not fixed:
            new_lines.append(line)
            
    with open(filepath, 'w') as f:
        f.writelines(new_lines)

if __name__ == "__main__":
    fix_broken_comments("/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html")
    print("Broken comments fixed (v4).")
