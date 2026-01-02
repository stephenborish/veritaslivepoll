#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def surgery():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix the Prettier error: actionHtml = `<button class="toast-action-btn`>${action.label}</button>\`;
    # Actually, it's likely many tags are like this now.
    
    # Fix class=`something` -> class="something"
    content = re.sub(r'class=`([^`\${}]+)`', r'class="\1"', content)
    # Fix class=`${...}` -> class="${...}"
    content = re.sub(r'class=`(\${[^}]+})`', r'class="\1"', content)
    # Fix src=`...` -> src="..."
    content = re.sub(r'src=`([^`\${}]+)`', r'src="\1"', content)
    # Fix src=`${...}` -> src="${...}"
    content = re.sub(r'src=`(\${[^}]+})`', r'src="\1"', content)
    
    # Fix mismatched imgsrc
    content = content.replace("imgsrc=", "img src=")
    content = content.replace("<divclass=", "<div class=")
    content = content.replace("<spanclass=", "<span class=")

    # Fix the literal backslashes I saw earlier
    content = content.replace("\\`", "`")

    # Fix the trailing garbage at 194/195
    content = content.replace("</button>\\`;", "</button>`;")
    content = content.replace("toast.innerHTML = \\`", "toast.innerHTML = `")
    
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Surgery applied.")

if __name__ == "__main__":
    surgery()
