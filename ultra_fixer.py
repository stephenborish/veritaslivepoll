
import os

def ultra_fixer_v2(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    chars = list(content)
    n = len(chars)
    i = 0
    
    in_quote = None 
    in_comment = None # 'line' or 'block'
    opener_index = -1
    
    to_backtick = set()
    
    while i < n:
        c = chars[i]
        
        # Skip escaped characters if in quote
        if in_quote and c == '\\':
            i += 2
            continue
            
        if in_comment == 'line':
            if c == '\n':
                in_comment = None
        elif in_comment == 'block':
            if c == '*' and i + 1 < n and chars[i+1] == '/':
                in_comment = None
                i += 2
                continue
        elif in_quote:
            if c == in_quote:
                body = "".join(chars[opener_index+1 : i])
                if in_quote in ("'", '"'):
                    # Convert ONLY if it contains a newline or ${
                    if '\n' in body or '${' in body:
                        to_backtick.add(opener_index)
                        to_backtick.add(i)
                in_quote = None
        else:
            # Check for comments
            if c == '/' and i + 1 < n:
                if chars[i+1] == '/':
                    in_comment = 'line'
                    i += 2
                    continue
                elif chars[i+1] == '*':
                    in_comment = 'block'
                    i += 2
                    continue
            
            # Check for strings
            if c in ("'", '"', '`'):
                in_quote = c
                opener_index = i
        i += 1
        
    # Apply changes
    for idx in to_backtick:
        chars[idx] = '`';
        
    new_content = "".join(chars)
    
    with open(filepath, 'w') as f:
        f.write(new_content)

if __name__ == "__main__":
    target = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"
    ultra_fixer_v2(target)
    print("Ultra Fixer V2 applied.")
