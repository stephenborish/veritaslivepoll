#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix_all_tags():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Pattern: class="material-symbols-outlined> 
    # Must add " before >
    content = content.replace('class="material-symbols-outlined>', 'class="material-symbols-outlined">')
    
    # Fix other common ones
    content = content.replace('type="button', 'type="button"')
    content = content.replace('class="hidden', 'class="hidden"')
    content = content.replace('class="flex', 'class="flex"')
    content = content.replace('class="h-4 w-4', 'class="h-4 w-4"')
    content = content.replace('class="relative', 'class="relative"')
    
    # More general fix for missing closing quote before >
    # Match: attribute="ValueNotClosed>
    # This is tricky, but let's try for specific known attributes
    for attr in ['class', 'style', 'id', 'onclick', 'type', 'name', 'value', 'placeholder']:
        # Match attr=" followed by non-quotes until >
        content = re.sub(f'({attr}="[^">]+)(?=>)', r'\1"', content)

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("All tags fixed.")

if __name__ == "__main__":
    fix_all_tags()
