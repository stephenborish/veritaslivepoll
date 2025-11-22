from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local HTML file
        cwd = os.getcwd()
        file_path = f"file://{cwd}/verification/test_loader.html"
        page.goto(file_path)

        # Wait for a moment to let animations start (though screenshots capture a moment)
        page.wait_for_timeout(1000)

        # Take screenshot
        page.screenshot(path="verification/loader_verification.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    run()
