#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def final_fix():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern 1: id=`${...}` -> id="${...}"
    content = re.sub(r'id=`\${(.*?)}`', r'id="${\1}"', content)
    # Pattern 2: class=`${...}` -> class="${...}"
    content = re.sub(r'class=`(.*?)\${(.*?)}`', r'class="\1${\2}"', content)
    # Pattern 3: src=`${...}` -> src="${...}"
    content = re.sub(r'src=`\${(.*?)}`', r'src="${\1}"', content)
    # Pattern 4: data-.*?=`${...}`
    content = re.sub(r'(\w+)=`\${(.*?)}`', r'\1="${\2}"', content)
    
    # General cleanup: nested backticks inside a backtick area.
    # This is hard with regex, but we can look for specific common ones.
    
    # Re-fix the broken quotes from my previous joined results.
    # If we have ` ... src="${...}" ... `, that's correct.
    # If we have ` ... src=`${...}` ... `, that's wrong.
    
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Final fix applied.")

if __name__ == "__main__":
    final_fix()
