
import re

def check_braces(filename):
    with open(filename, 'r') as f:
        content = f.read()

    # Simple counter
    balance = 0
    stack = []
    
    lines = content.split('\n')
    
    for i, line in enumerate(lines):
        # Remove comments // ...
        line = re.sub(r'//.*', '', line)
        
        # We should also handle /* ... */ and strings, but let's try simple first.
        # This is a rough check.
        
        for char in line:
            if char == '{':
                balance += 1
                stack.append(i + 1)
            elif char == '}':
                balance -= 1
                if stack:
                    stack.pop()
    
    print(f"Final Balance: {balance}")
    if balance != 0:
        print("Unbalanced braces!")
        if stack:
            print(f"Last unclosed brace potentially at line: {stack[-1]}")
    else:
        print("Braces are balanced (assuming no trickery with strings/comments)")

check_braces('src/Student_Scripts.html')
