import os
import re

SRC_DIR = 'src'

def include(filename):
    # Apps Script include logic usually just finds the file.
    # We are looking in SRC_DIR.
    # Filename might be passed as 'Common_Head' or 'Common_Head.html'
    # Apps Script usually adds .html if missing

    possible_paths = [
        os.path.join(SRC_DIR, filename),
        os.path.join(SRC_DIR, filename + '.html')
    ]

    for p in possible_paths:
        if os.path.exists(p):
            with open(p, 'r') as f:
                content = f.read()
            # Recursively process includes in the included file
            return process_includes(content)

    return f"<!-- ERROR: Could not find {filename} -->"

def process_includes(content):
    # Regex to find <?!= include('Filename'); ?>
    # This is a simplified regex for the standard pattern used in this project
    pattern = re.compile(r"<\?!=\s*include\('([^']+)'\);\s*\?>")

    def replace(match):
        return include(match.group(1))

    return pattern.sub(replace, content)

def render_file(filename, output_filename):
    filepath = os.path.join(SRC_DIR, filename)
    with open(filepath, 'r') as f:
        content = f.read()

    rendered = process_includes(content)

    # Mock other scriptlets
    rendered = rendered.replace('<?= sessionToken ?>', 'MOCK_TOKEN')

    with open(output_filename, 'w') as f:
        f.write(rendered)
    print(f"Rendered {filename} to {output_filename}")

if __name__ == "__main__":
    render_file('Teacher_View.html', 'verification/teacher_rendered.html')
    render_file('Student_View.html', 'verification/student_rendered.html')
