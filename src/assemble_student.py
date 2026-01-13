
import os
import re

base_dir = '/Users/stephenborish/veritas (01.07.26)/veritaslivepoll/src'
view_file = os.path.join(base_dir, 'Student_View.html')
output_file = os.path.join(base_dir, 'preview_student.html')

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
        # Recursively resolve includes if any
        return resolve_includes(file_content)

    return pattern.sub(replace_func, content)

def clean_apps_script_tags(content):
    # Replace the variable injections with null so the JS fallback takes over
    content = content.replace("<?!= JSON.stringify(firebaseConfig) ?>", "null")
    content = content.replace("<?!= Veritas.Config.DEBUG_FIREBASE ? 'true' : 'false' ?>", "true")
    # Add dummy sessionToken and studentEmail
    content = content.replace("<?= sessionToken ?>", "dummy-token")
    content = content.replace("<?= studentEmail ?>", "student1@example.com")
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
