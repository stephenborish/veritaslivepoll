
import re

def fix_teacher_scripts(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Match ' followed by content followed by ` and fix it to ` ... `
    content = re.sub(r" '([^'\s][^`\n]*?)`", r" `\1`", content)
    
    # Match ` followed by content followed by ' and fix it to ` ... `
    content = re.sub(r" `([^`\s][^'\n]*?)'", r" `\1`", content)
    
    # Specific fix for line 8095: html += '<div class="mb-6">`;
    content = content.replace("html += '<div class=\"mb-6\">`;", "html += `<div class=\"mb-6\">`;")

    with open(filepath, 'w') as f:
        f.write(content)

if __name__ == "__main__":
    fix_teacher_scripts("/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html")
    print("Mismatched quote fix applied.")
