from playwright.sync_api import sync_playwright
import os

def verify_teacher_header_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the mock HTML file directly
        # Since we are in a serverless environment, we will construct a complete HTML file
        # that mimics the teacher view structure by combining Teacher_View (Head/Scripts) and Teacher_Body

        # Read necessary files
        with open('src/Teacher_Body.html', 'r') as f:
            body_content = f.read()

        # We need a basic HTML wrapper to render Tailwind
        html_content = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Veritas Live Poll - Layout Verification</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
            <script>
                tailwind.config = {{
                    theme: {{
                        extend: {{
                            colors: {{
                                'veritas-navy': '#002e6d',
                                'veritas-gold': '#c5a05a',
                                'brand-white': '#ffffff',
                                'brand-dark-gray': '#242424',
                                'brand-light-gray': '#d9e0e7',
                            }}
                        }}
                    }}
                }}
            </script>
            <style>
              /* Mock loader hide */
              #loader {{ display: none !important; }}
            </style>
        </head>
        <body class="bg-gray-100 h-screen overflow-hidden">
            {body_content}

            <script>
                // Mock script to show the live header
                document.addEventListener('DOMContentLoaded', function() {{
                    document.getElementById('header-default').style.display = 'none';
                    document.getElementById('header-live').style.display = 'flex'; // Header is flex
                    document.getElementById('dashboard').style.display = 'none';
                    document.getElementById('live-view').style.display = 'grid'; // Live view is grid

                    // Populate some dummy data
                    document.getElementById('header-poll-name').textContent = "AP Biology - Photosynthesis";
                    document.getElementById('live-question-info').textContent = "Q3 / 10";
                }});
            </script>
        </body>
        </html>
        """

        # Write temporary HTML file
        with open('verification/mock_dashboard.html', 'w') as f:
            f.write(html_content)

        # Open the file
        page.goto(f"file://{os.path.abspath('verification/mock_dashboard.html')}")

        # Wait for Tailwind to process
        page.wait_for_timeout(1000)

        # Take a screenshot of the header specifically
        header = page.locator('#header-live')
        header.screenshot(path='verification/teacher_header_layout.png')

        # Also take full page just in case
        page.screenshot(path='verification/teacher_full_layout.png')

        print("Screenshots generated.")
        browser.close()

if __name__ == "__main__":
    verify_teacher_header_layout()
