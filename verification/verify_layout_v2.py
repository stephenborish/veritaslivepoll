import os
from playwright.sync_api import sync_playwright

def verify_teacher_header_layout():
    # 1. Create a temporary mock HTML file that includes the necessary styles and the header
    # We need to mock the Tailwind CSS and Material Symbols

    mock_html_path = "/home/jules/verification/mock_teacher_header.html"

    # Read the updated Teacher_Body.html
    with open("src/Teacher_Body.html", "r") as f:
        body_content = f.read()

    # Extract just the header part we are interested in (header-live)
    # We'll wrap it in a full HTML structure

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mock Header Verification</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet" />
        <script>
            tailwind.config = {{
                theme: {{
                    extend: {{
                        colors: {{
                            'veritas-navy': '#002e6d',
                            'veritas-gold': '#c69214',
                        }}
                    }}
                }}
            }}
        </script>
    </head>
    <body class="bg-gray-100">
        <div class="flex h-screen w-full flex-col">
            <!-- Injecting the body content directly -->
            {body_content}
        </div>

        <script>
            // Force show the live header and hide the default header for verification
            document.getElementById('header-default').style.display = 'none';
            document.getElementById('header-live').style.display = 'block';

            // Populate some mock data
            document.getElementById('header-poll-name').textContent = "Test Poll: Chapter 5";
            document.getElementById('live-question-info').textContent = "Q3 / 12";
        </script>
    </body>
    </html>
    """

    with open(mock_html_path, "w") as f:
        f.write(html_content)

    # 2. Run Playwright to render this and take a screenshot
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})

        # Load the local file
        page.goto(f"file://{mock_html_path}")

        # Wait for Tailwind to process
        page.wait_for_timeout(1000)

        # Take a screenshot of the header area
        header = page.locator("#header-live")
        header.screenshot(path="/home/jules/verification/teacher_header_layout_v2.png")

        print(f"Screenshot saved to verification/teacher_header_layout_v2.png")
        browser.close()

if __name__ == "__main__":
    os.makedirs("/home/jules/verification", exist_ok=True)
    verify_teacher_header_layout()
