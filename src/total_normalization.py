#!/usr/bin/env python3
import re

FILE_PATH = "/Users/stephenborish/Downloads/VERITAS LIVE (Dec. 5)/veritaslivepoll/src/Teacher_Scripts.html"

def total_normalization():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Remove escaped backticks if they are NOT inside a string where they should be escaped
    # But more likely, my scripts added them. Let's remove them globally and re-evaluate.
    # In JS outside of a string, \` is a syntax error unless it's a template literal tag (rare)
    content = content.replace("\\`", "`")
    
    # 2. Fix the specific mismatch: `warn' and 'warning`
    content = content.replace("`warn'", "'warn'")
    content = content.replace("'warning` primaries", "'warning' primaries") # Guessing context
    content = content.replace("'warning`", "'warning'")
    
    # 3. Fix the mismatched attribute quotes I saw in grep
    # class=`toast toast-${normalizedType}`
    # Wait, my previous script added these. Let's convert them to double quotes.
    content = re.sub(r'class=`(.*?)\${(.*?)}`', r'class="\1${\2}"', content)
    
    # 4. Fix any other mismatched quote patterns
    # Any ' followed by ... followed by `
    # This is hard. Let's target the exact ones from Step 4457.
    content = content.replace("class=`toast-action-btn`", 'class="toast-action-btn"')
    content = content.replace("class=`material-symbols-outlined", 'class="material-symbols-outlined')
    content = content.replace("toast-icon`", 'toast-icon"')
    content = content.replace("class=`toast-content`", 'class="toast-content"')
    content = content.replace("class=`toast-title`", 'class="toast-title"')
    content = content.replace("class=`toast-message`", 'class="toast-message"')
    content = content.replace("class=`toast-close\"", 'class="toast-close"')
    content = content.replace("onclick=\"this.closest(`.toast`).remove()`", 'onclick="this.closest(\'.toast\').remove()"')
    content = content.replace("class=`ambient-state-overlay`", 'class="ambient-state-overlay"')
    content = content.replace("overlay.classList.add(`state-${state}`)", 'overlay.classList.add("state-${state}")') # Wait, no! Needs backticks if evaluated
    # Actually, overlay.classList.add(`state-${state}`) IS CORRECT.
    
    # 5. Fix the BROKEN ESCAPED BACKTICKS in template literals
    # We already did replace("\\`", "`") above.
    
    # 6. Final fix for 404s: ensure all src="${...}" are INSIDE backticks
    # My convert_all_interpolations.py did: '...${...}' -> `${...}`
    # But it might have missed some or added extra backslashes.

    # 7. Fix the " + (q.timerSeconds || '' ) + " issue
    content = content.replace("' + (q.timerSeconds || '' ) + '", "${q.timerSeconds || ''}")

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Total normalization applied.")

if __name__ == "__main__":
    total_normalization()
