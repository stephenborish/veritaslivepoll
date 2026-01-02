#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def purge_bad_backticks():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Rule 1: Replace backtick followed by > with just > (e.g. style="...`>)
    content = content.replace("`>", ">")
    
    # Rule 2: Replace backtick followed by " with just " (e.g. style="...`")
    content = content.replace("`\"", "\"")
    
    # Rule 3: Replace " followed by ` with just " (e.g. style="`...)
    content = content.replace("\"`", "\"")

    # Rule 4: Fix specific line 205 issue
    content = content.replace("18px`", "18px\"")

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Purge applied.")

if __name__ == "__main__":
    purge_bad_backticks()
