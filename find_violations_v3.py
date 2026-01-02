
import re

def find_violations(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    violations = []
    
    # 1. Detect multi-line strings NOT using backticks
    single_quote_open = False
    double_quote_open = False
    
    for i, line in enumerate(lines):
        line_no = i + 1
        stripped = line.strip()
        
        # Simple heuristic: if a line starts with a quote or has an open quote and ends without closing it
        # and doesn't have a backslash at the end, it might be a multi-line string violation.
        
        # We need to be careful about backticks and comments
        # This is a bit complex to do perfectly with regex/simple logic, but let's try.
        
        # If we are in a single/double quote and the line ends, it's a violation UNLESS there's a backslash
        
        # Let's use a state machine for quotes
        j = 0
        while j < len(line):
            char = line[j]
            next_char = line[j+1] if j+1 < len(line) else ''
            
            if char == '\\': # Skip next char
                j += 2
                continue
            
            if char == '`':
                # We ignore backticks for single/double quote tracking
                pass
            elif char == "'":
                if not double_quote_open:
                    single_quote_open = not single_quote_open
            elif char == '"':
                if not single_quote_open:
                    double_quote_open = not double_quote_open
            
            j += 1
            
        if (single_quote_open or double_quote_open) and not line.rstrip().endswith('\\') and not line.rstrip().endswith('+'):
            # Check if the next line starts with something that looks like a continuation
            if i + 1 < len(lines):
                next_line = lines[i+1].strip()
                if next_line and not next_line.startswith(('+', '.', '}', ')', ']', ';')):
                   violations.append(f"Line {line_no}: Possible unterminated string (single_quote_open={single_quote_open}, double_quote_open={double_quote_open})")
                   # Reset for next line to avoid cascading errors in detection
                   single_quote_open = False
                   double_quote_open = False

    # 2. Detect ${...} not in backticks
    # This is also tricky because it could be in a comment or in a backtick string already.
    # Let's look for '${' or "${"
    for i, line in enumerate(lines):
        if ("'${" in line or '"${' in line) and '`' not in line:
            violations.append(f"Line {i+1}: Possible template literal placeholder inside single/double quotes: {line.strip()}")

    return violations

if __name__ == "__main__":
    file_path = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"
    violations = find_violations(file_path)
    for v in violations:
        print(v)
