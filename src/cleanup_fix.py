#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def cleanup():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix the breakage from previous script:
    # ` ... src=`${...}` ... ` should be ` ... src="${...}" ... `
    # or ` ... src='${...}' ... `
    
    # Find nested backticks: ` followed by `
    # Actually, let's just find and fix the specific `src=`${...}`` pattern
    content = content.replace("src=`${", "src=\"${")
    content = content.replace("}` ", "}\" ")
    content = content.replace("}\">", "}\">") # Close double quote
    
    # Wait, the previous script might have replaced inner double quotes with backticks.
    # Let's target: src=`${VARIABLE}` 
    content = re.sub(r'src=`\${(.*?)}`', r'src="${\1}"', content)
    content = re.sub(r'class=`(.*?)\${(.*?)}`', r'class="\1${\2}"', content)
    content = re.sub(r'id=`(.*?)\${(.*?)}`', r'id="\1${\2}"', content)

    # Fix the trailing garbage from my script at 4109 etc
    content = content.replace(": `';", ": '';")
    
    # Now, let's fix the multi-line single quoted strings properly.
    # A multi-line single quoted string is: ' ... \n ... '
    # We should convert it to ` ... \n ... ` ONLY if it's not already inside a backtick.
    
    # Let's use a very specific approach for the known functions.
    
    # Joining lines for any '...' that spans a line
    # But ONLY for those that end in a newline and aren't closed.
    
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Cleanup applied.")

if __name__ == "__main__":
    cleanup()
