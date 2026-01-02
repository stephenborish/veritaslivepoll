
import os

def fix_teacher_scripts(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    chars = list(content)
    i = 0
    in_single = False
    in_double = False
    in_backtick = False
    opener_pos = None
    
    while i < len(chars):
        c = chars[i]
        
        if c == '\\':
            i += 2
            continue
            
        if not in_single and not in_double and not in_backtick:
            if c == "'":
                in_single = True
                opener_pos = i
            elif c == '"':
                in_double = True
                opener_pos = i
            elif c == '`':
                in_backtick = True
                opener_pos = i
        elif in_single:
            if c == "'":
                in_single = False
            elif c == '\n':
                # Multi-line single quote detected!
                # We need to find the CLOSING quote and convert both to backticks.
                chars[opener_pos] = '`'
                # Find the next single quote (not escaped)
                k = i
                while k < len(chars):
                    if chars[k] == '\\':
                        k += 2
                        continue
                    if chars[k] == "'":
                        chars[k] = '`'
                        break
                    k += 1
                in_single = False
                # i = k # Optional: skip to the end of this block
        elif in_double:
            if c == '"':
                in_double = False
            elif c == '\n':
                # Multi-line double quote!
                chars[opener_pos] = '`'
                k = i
                while k < len(chars):
                    if chars[k] == '\\':
                        k += 2
                        continue
                    if chars[k] == '"':
                        chars[k] = '`'
                        break
                    k += 1
                in_double = False
        elif in_backtick:
            if c == '`':
                in_backtick = False
        
        i += 1

    content = "".join(chars)
    
    # Post-process: any ${...} that are now inside backticks (as they should be)
    # but might have bad internal quotes.
    # Actually, they should be fine.
    
    # One more thing: src="${...}" where quotes were double or single.
    # The loop above might have converted 'html += "<img src='${...}'>"'
    # into 'html += `<img src='${...}'>`'.
    # This is correct JS!
    
    with open(filepath, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix_teacher_scripts("/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html")
    print("Precise multi-line fix applied.")
