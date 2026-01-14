
import os
import re

base_dir = os.path.dirname(os.path.abspath(__file__))
view_file = os.path.join(base_dir, 'Teacher_View.html')
output_file = os.path.join(base_dir, 'preview_teacher.html')

def read_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Warning: File not found {path}")
        return f"<!-- File not found: {path} -->"

def resolve_includes(content):
    # Regex for <?!= include('Filename'); ?>
    # Handles potential varying whitespace/quotes
    pattern = re.compile(r"<\?!= include\(['\"](.+?)['\"]\);\s*\?>")
    
    def replace_func(match):
        filename = match.group(1)
        # Try finding the file with .html extension if not present, though in this repo they seem to have it or not in the include call?
        # Looking at Teacher_View: include('Common_Head') -> Common_Head.html (based on file list)
        # So we append .html
        file_path = os.path.join(base_dir, filename + '.html')
        file_content = read_file(file_path)
        # Recursively resolve includes if any
        return resolve_includes(file_content)

    return pattern.sub(replace_func, content)

def clean_apps_script_tags(content):
    # Replace the variable injections with null so the JS fallback takes over
    content = content.replace("<?!= JSON.stringify(firebaseConfig) ?>", "null")
    content = content.replace("<?!= Veritas.Config.DEBUG_FIREBASE ? 'true' : 'false' ?>", "true")
    return content

try:
    main_content = read_file(view_file)
    assembled = resolve_includes(main_content)
    assembled = clean_apps_script_tags(assembled)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(assembled)
    print(f"Successfully created {output_file}")
except Exception as e:
    print(f"Error: {e}")
