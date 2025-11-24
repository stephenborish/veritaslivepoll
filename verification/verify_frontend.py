import sys
from playwright.sync_api import sync_playwright, expect

def verify_teacher_dashboard():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the mock dashboard
        # Note: We need to construct the full HTML first or use a simple server.
        # Since we can't easily spin up a full server with the templating engine here,
        # we will create a static HTML file that mimics the structure by concatenating the parts.
        # However, without the Apps Script runtime (google.script.run), dynamic parts won't work.
        # But we can verify the initial static structure and CSS.

        # For this environment, we will assume we can construct a 'mock_teacher_dashboard.html'
        # by reading the files and doing a simple string replacement for includes.

        # Define the path for the mock file
        mock_file_path = "verification/mock_teacher_dashboard.html"

        # Navigate to the local file
        page.goto(f"file://{sys.path[0]}/../{mock_file_path}")

        # Wait for the dashboard to load (looking for a key element)
        # The dashboard might be hidden initially or waiting for data.
        # We look for the header or sidebar which should be visible.
        expect(page.locator("#header-default")).to_be_visible()

        # Check if the 'Start Session' button is present and has type="button"
        start_btn = page.locator("#start-poll-btn")
        expect(start_btn).to_be_visible()
        expect(start_btn).to_have_attribute("type", "button")

        # Check other buttons
        expect(page.locator("#send-link-btn")).to_have_attribute("type", "button")
        expect(page.locator("#view-links-btn")).to_have_attribute("type", "button")

        # Take a screenshot
        screenshot_path = "verification/teacher_dashboard_verified.png"
        page.screenshot(path=screenshot_path)

        print(f"Verification successful. Screenshot saved to {screenshot_path}")
        browser.close()

if __name__ == "__main__":
    # This script assumes the mock HTML file has been created by the agent before running this.
    verify_teacher_dashboard()
