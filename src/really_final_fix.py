#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def really_final_fix():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix attribute="...`} 
    # Match id="...`} or src="...`} or class="...`} 
    content = re.sub(r'(\w+)="(\${[^}]+})`', r'\1="\2"', content)
    
    # Fix attribute=`..."} 
    content = re.sub(r'(\w+)=`(\${[^}]+})"', r'\1="\2"', content)
    
    # Fix attribute=`...`}
    content = re.sub(r'(\w+)=`(\${[^}]+})`', r'\1="\2"', content)
    
    # Fix specific broken pattern from line 9805: src="${...}`
    content = re.sub(r'src="\${([^}]+)}`', r'src="${\1}"', content)
    # And data-q-index="${...}`
    content = re.sub(r'data-([\w-]+)="\${([^}]+)}`', r'data-\1="${\2}"', content)

    # Fix the weird line 4110 issue: var questionHtml = '<div>
    # Convert '<div> to `<div> and find the closing '
    # This is hard. Let's just convert ALL multi-line strings to backticks.
    
    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Really final fix applied.")

if __name__ == "__main__":
    really_final_fix()
