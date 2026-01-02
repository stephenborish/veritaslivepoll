#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def master_clean():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Simplify double quotes
    content = content.replace('""', '"')
    
    # 2. Fix the flex gap pattern
    content = re.sub(r'class="flex"\s*gap-(\d+)"', r'class="flex gap-\1"', content)
    content = re.sub(r'class="flex-1"\s*space-y-(\d+)"', r'class="flex-1 space-y-\1"', content)
    
    # 3. Ensure all src="${...}" are properly quoted and inside backticks
    # Pattern: src="${...}"
    # If it's already Correct, don't touch.
    # If it's src="${...} (missing "), fix it.
    content = re.sub(r'src="(\${[^}]+})([^"]|$)', r'src="\1"\2', content)
    
    # 4. Fix mismatched quotes in type comparisons
    content = content.replace("type === `warn'", "type === 'warn'")
    content = content.replace("type === 'warn`", "type === 'warn'")
    
    # 5. Remove any leading backslashes before backticks that aren't meant to be there
    content = content.replace("\\`", "`")

    # 6. Fix specific identified line 454 etc
    content = content.replace('class="flex gap-4""', 'class="flex gap-4"')
    content = content.replace('class="flex gap-2""', 'class="flex gap-2"')

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Master clean applied.")

if __name__ == "__main__":
    master_clean()
