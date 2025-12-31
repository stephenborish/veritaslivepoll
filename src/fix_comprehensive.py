#!/usr/bin/env python3
"""
Comprehensive fix for Teacher_Scripts.html - fixes ALL broken string patterns.
This script identifies and fixes:
1. Multi-line single-quoted strings (invalid JS)
2. Multi-line template literals (valid but causing issues)
3. String concatenation patterns like '... ' + var + ' ...' that should be template literals
"""
import re
import os

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix_file():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    changes_made = 0
    
    # =========================================================================
    # FIX 1: Find and fix multi-line single-quoted strings with img src
    # Pattern: '<img src="' + VAR + '"\n...attributes...>'
    # =========================================================================
    
    # Match: html += '<img src="' + VARIABLE + '"\n ... >';
    img_pattern = re.compile(
        r"html \+= '<img src=\"' \+ ([^+]+?) \+ '\"\s*\n([^']*?)>'",
        re.MULTILINE | re.DOTALL
    )
    
    def fix_img_tag(match):
        variable = match.group(1).strip()
        rest = match.group(2).strip()
        # Clean up the rest - remove excessive whitespace and newlines
        rest = ' '.join(rest.split())
        return f'html += `<img src="${{{variable}}}" {rest}>`'
    
    new_content, count = img_pattern.subn(fix_img_tag, content)
    if count > 0:
        print(f"Fixed {count} img src patterns")
        changes_made += count
        content = new_content
    
    # =========================================================================
    # FIX 2: Find multi-line single-quoted HTML strings and join them
    # Pattern: html += '<element\n  class="...">' should be single line
    # =========================================================================
    
    # This is tricky - we need to find strings that span lines
    # Look for: += '<tag\n ... >' and join them
    
    multiline_html_pattern = re.compile(
        r"(html \+= ')(<[a-z]+)\s*\n\s*(class=\"[^\"]+\"[^']*?)(')",
        re.MULTILINE
    )
    
    def fix_multiline_html(match):
        prefix = match.group(1)
        tag = match.group(2)
        attrs = match.group(3).strip()
        suffix = match.group(4)
        # Join with single space
        result = f"{prefix}{tag} {attrs}{suffix}"
        return result
    
    new_content, count = multiline_html_pattern.subn(fix_multiline_html, content)
    if count > 0:
        print(f"Fixed {count} multi-line HTML patterns")
        changes_made += count
        content = new_content
    
    # =========================================================================
    # FIX 3: Fix template literals with newlines in them
    # Pattern: html += `<element\n  class="...">` - these are technically valid
    # but can cause issues, so we'll join them too
    # =========================================================================
    
    template_multiline_pattern = re.compile(
        r"(html \+= `)(<[a-z]+)\s*\n\s*(class=\"[^\"]+\"[^`]*?)(`)",
        re.MULTILINE
    )
    
    def fix_template_multiline(match):
        prefix = match.group(1)
        tag = match.group(2)
        attrs = match.group(3).strip()
        suffix = match.group(4)
        result = f"{prefix}{tag} {attrs}{suffix}"
        return result
    
    new_content, count = template_multiline_pattern.subn(fix_template_multiline, content)
    if count > 0:
        print(f"Fixed {count} template literal multi-line patterns")
        changes_made += count
        content = new_content
    
    # =========================================================================
    # FIX 4: Fix var assignments with multi-line strings
    # Pattern: var optClass = 'text\ntext...'
    # =========================================================================
    
    var_multiline_pattern = re.compile(
        r"(var \w+ = ['\`])([^'\`]+)(\n\s+)([^'\`]+)(['\`])",
        re.MULTILINE
    )
    
    def fix_var_multiline(match):
        prefix = match.group(1)
        part1 = match.group(2)
        part2 = match.group(4)
        suffix = match.group(5)
        # Join with single space
        return f"{prefix}{part1} {part2.strip()}{suffix}"
    
    # Only apply if the pattern is clearly a CSS class string
    # Be careful here - only fix known problematic patterns
    
    # =========================================================================
    # FIX 5: Specific known patterns that keep failing
    # =========================================================================
    
    # Pattern: opt.imageURL multi-line img
    content = re.sub(
        r"html \+= '<img src=\"' \+ escapeHtml\(opt\.imageURL\) \+ '\"\s*\n\s*alt=\"Option image\"\s*\n\s*class=\"mt-2 max-w-\[200px\] max-h-\[150px\] rounded border border-brand-light-gray dark:border-brand-dark-gray/40\"\s*\n\s*referrerpolicy=\"no-referrer\"\s*\n\s*onerror=\"this\.style\.display=\\\\'none\\\\';\"\>';",
        'html += `<img src="${escapeHtml(opt.imageURL)}" alt="Option image" class="mt-2 max-w-[200px] max-h-[150px] rounded border border-brand-light-gray dark:border-brand-dark-gray/40" referrerpolicy="no-referrer" onerror="this.style.display=\'none\';">`;',
        content
    )
    
    # =========================================================================
    # Save the fixed content
    # =========================================================================
    
    if content != original_content:
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"File updated successfully. Total changes: {changes_made}+")
    else:
        print("No changes made by regex patterns.")
    
    return content != original_content

if __name__ == "__main__":
    fix_file()
