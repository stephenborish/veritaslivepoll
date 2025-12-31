#!/usr/bin/env python3
"""
Final fix for remaining opt.imageURL pattern.
"""
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Fix 1: opt.imageURL pattern - this is a multi-line single-quoted string 
    # that has newlines in it which is invalid JS
    
    # Pattern to match:
    # html += '<img src="' + escapeHtml(opt.imageURL) + '"
    #   alt="Option image"
    #   class="..."
    #   referrerpolicy="no-referrer"
    #   onerror="this.style.display=\'none\';">';
    
    pattern1 = re.compile(
        r"html \+= '<img src=\"' \+ escapeHtml\(opt\.imageURL\) \+ '\"\s+"
        r"alt=\"Option image\"\s+"
        r"class=\"mt-2 max-w-\[200px\] max-h-\[150px\] rounded border border-brand-light-gray dark:border-brand-dark-gray/40\"\s+"
        r"referrerpolicy=\"no-referrer\"\s+"
        r"onerror=\"this\.style\.display=\\'none\\';\">';",
        re.MULTILINE | re.DOTALL
    )
    
    replacement1 = 'html += `<img src="${escapeHtml(opt.imageURL)}" alt="Option image" class="mt-2 max-w-[200px] max-h-[150px] rounded border border-brand-light-gray dark:border-brand-dark-gray/40" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';">`;'
    
    content, count1 = pattern1.subn(replacement1, content)
    print(f"Fixed {count1} opt.imageURL patterns")
    
    # Fix 2: Multi-line span template literal
    pattern2 = re.compile(
        r"html \+= `<span\s+class=\"material-symbols-outlined text-green-600 dark:text-green-400\">check_circle</span>`;",
        re.MULTILINE | re.DOTALL
    )
    
    replacement2 = 'html += `<span class="material-symbols-outlined text-green-600 dark:text-green-400">check_circle</span>`;'
    
    content, count2 = pattern2.subn(replacement2, content)
    print(f"Fixed {count2} span template literal patterns")
    
    if content != original:
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(content)
        print("File updated.")
    else:
        print("No changes made.")

if __name__ == "__main__":
    fix()
