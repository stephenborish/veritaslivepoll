
import os
import re

base_dir = os.path.dirname(os.path.abspath(__file__))
public_dir = os.path.join(os.path.dirname(base_dir), 'public')
view_file = os.path.join(base_dir, 'Teacher_View.html')
output_file = os.path.join(public_dir, 'index.html')

def read_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except FileNotFoundError:
        print(f"Warning: File not found {path}")
        return f"<!-- File not found: {path} -->"

def resolve_includes(content):
    # Regex for <?!= include('Filename'); ?>
    pattern = re.compile(r"<\?!= include\(['\"](.+?)['\"]\);\s*\?>")
    
    def replace_func(match):
        filename = match.group(1)
        file_path = os.path.join(base_dir, filename + '.html')
        file_content = read_file(file_path)
        return resolve_includes(file_content)

    return pattern.sub(replace_func, content)

def clean_apps_script_tags(content):
    content = content.replace("<?!= JSON.stringify(firebaseConfig) ?>", "null")
    content = content.replace("<?!= Veritas.Config.DEBUG_FIREBASE ? 'true' : 'false' ?>", "true")
    return content

try:
    print(f"Building from {view_file} to {output_file}...")
    main_content = read_file(view_file)
    assembled = resolve_includes(main_content)
    assembled = clean_apps_script_tags(assembled)
    
    # Ensure public dir exists
    if not os.path.exists(public_dir):
        os.makedirs(public_dir)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(assembled)
    print(f"Successfully created {output_file}")
except Exception as e:
    print(f"Error: {e}")
