#!/usr/bin/env python3
"""
Comprehensive fix for Teacher_Scripts.html string interpolation issues.
Converts all `' + variable + '` patterns in HTML strings to template literal syntax.
"""
import re
import os

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def fix_file():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original_content = content
    
    # =========================================================================
    # FIX 1: Convert specific broken patterns to template literals
    # =========================================================================
    
    # Pattern: '<img src="' + escapeHtml(variable) + '" ...>'
    # Should become: `<img src="${escapeHtml(variable)}" ...>`
    
    # This regex finds: '<img src="' + EXPR + '" followed by more content
    # We need to be careful to match the full img tag
    
    # Simpler approach: replace known broken patterns directly
    
    fixes = [
        # Line 975 - modalHtml image
        (
            """modalHtml += '<img src="' + imgSrc + '" style="max-width:90%;max-height:90%;" />';""",
            """modalHtml += `<img src="${imgSrc}" style="max-width:90%;max-height:90%;" />`;"""
        ),
        # Line 4159-4161 - renderReviewSummary question image
        (
            """var imageHtml = question.questionImageURL ? '<div class="mt-3"><img
                      src="' + escapeHtml(question.questionImageURL) + '" class="max-h-48 rounded-lg object-contain"
                      alt="Question image" /></div>' : '';""",
            """var imageHtml = question.questionImageURL ? `<div class="mt-3"><img src="${escapeHtml(question.questionImageURL)}" class="max-h-48 rounded-lg object-contain" alt="Question image" /></div>` : '';"""
        ),
        # Line 8101 - question image in some function
        (
            """html += '<img src="' + escapeHtml(q.questionImageURL) + '"""",
            """html += `<img src="${escapeHtml(q.questionImageURL)}"`"""
        ),
        # Line 8132 - option image  
        (
            """html += '<img src="' + escapeHtml(opt.imageURL) + '"""",
            """html += `<img src="${escapeHtml(opt.imageURL)}"`"""
        ),
        # Line 9336 - questionImagePreview
        (
            """html += '<img src="' + questionImagePreview + '"""",
            """html += `<img src="${questionImagePreview}"`"""
        ),
        # Line 9567 - answerPreview
        (
            """html += '<img src="' + answerPreview + '"""",
            """html += `<img src="${answerPreview}"`"""
        ),
        # Line 10221 - modal image
        (
            """modalHtml += '<img src="' + imgSrc + '"
                                                                                                 style="max-width:90%;max-height:90%;" />';""",
            """modalHtml += `<img src="${imgSrc}" style="max-width:90%;max-height:90%;" />`;"""
        ),
    ]
    
    for old, new in fixes:
        if old in content:
            content = content.replace(old, new)
            print(f"Fixed: {old[:60]}...")
    
    # =========================================================================
    # FIX 2: Use regex to catch remaining patterns
    # =========================================================================
    
    # Pattern: '<img src="' + VARIABLE + '" 
    # The key issue is single quotes being interpreted literally in template contexts
    
    # Simpler regex: find html strings with concatenation and convert them
    # Match: += '<img src="' + <anything> + '" 
    
    pattern1 = re.compile(
        r"(\+= '\s*<img src=\"')\s*\+\s*([^+]+)\s*\+\s*'\"",
        re.DOTALL
    )
    
    def fix_img_concat(match):
        prefix = match.group(1)
        variable = match.group(2).strip()
        # Convert to template literal
        return f'+= `<img src="${{{variable}}}"`'
    
    content = pattern1.sub(fix_img_concat, content)
    
    # Pattern for: src="' + variable + '" within larger strings
    pattern2 = re.compile(
        r'src="\'\\s*\+\\s*([^+]+)\\s*\+\\s*\'"'
    )
    
    def fix_src_concat(match):
        variable = match.group(1).strip()
        return f'src="${{{variable}}}"'
    
    # This is trickier because we're changing quote styles mid-string
    # Let's try a different approach - find the specific broken lines
    
    # =========================================================================
    # FIX 3: Handle multi-line broken patterns around lines 13890, 13971
    # These are in renderWizardQuestions
    # =========================================================================
    
    # Pattern at 13890-13895 looks like:
    # + '<img src="' +
    # qImagePreview
    # + '" class="...">'
    
    # We need to join these and convert to template literal
    
    # Let's just read line by line and fix these specific patterns
    lines = content.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check for the broken pattern: + '<img src="' +
        if "+ '<img src=\"' +" in line:
            # This is a broken multi-line pattern
            # Collect lines until we find the closing
            collected = [line]
            j = i + 1
            while j < len(lines):
                collected.append(lines[j])
                if "' ;" in lines[j] or "';" in lines[j] or lines[j].strip().endswith("';"):
                    break
                if "'>" in lines[j]:
                    break
                j += 1
            
            # Try to parse and fix this block
            block = '\n'.join(collected)
            # Extract the variable name (e.g., qImagePreview, optImagePreview)
            var_match = re.search(r'\+ \'\<img src="\' \+\s*(\w+)\s*\+', block, re.DOTALL)
            if var_match:
                var_name = var_match.group(1)
                # Find the class attribute
                class_match = re.search(r'class="([^"]*)"', block)
                class_attr = class_match.group(1) if class_match else ''
                ref_match = re.search(r'referrerpolicy="([^"]*)"', block)
                ref_attr = f' referrerpolicy="{ref_match.group(1)}"' if ref_match else ''
                
                # Build the fixed line
                indent = line[:len(line) - len(line.lstrip())]
                fixed = f'{indent}+ `<img src="${{{var_name}}}" class="{class_attr}"{ref_attr}>`'
                new_lines.append(fixed)
                i = j + 1
                continue
        
        new_lines.append(line)
        i += 1
    
    content = '\n'.join(new_lines)
    
    # =========================================================================
    # FIX 4: Fix value="' + ... + '" patterns (for timer input)
    # =========================================================================
    
    # Pattern: value="' + (q.timerSeconds || '') + '"
    # Should become: value="${q.timerSeconds || ''}"
    # But this requires the whole string to be a template literal
    
    timer_pattern = re.compile(
        r"value=\\\"' \\+\s*\(q\\.timerSeconds\s*\\|\\|\s*''\s*\)\s*\\+ '\\\"",
    )
    
    # =========================================================================
    # Save the fixed content
    # =========================================================================
    
    if content != original_content:
        with open(FILE_PATH, 'w', encoding='utf-8') as f:
            f.write(content)
        print("File updated successfully.")
    else:
        print("No changes made - patterns not found or already fixed.")
    
    return content != original_content

if __name__ == "__main__":
    fix_file()
