import os
from playwright.sync_api import sync_playwright, expect

def verify_dropdown():
    # Get absolute path to mock_dashboard.html
    cwd = os.getcwd()
    file_path = f"file://{cwd}/verification/mock_dashboard.html"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Set viewport to ensure dropdown is visible
        page.set_viewport_size({"width": 1280, "height": 800})

        print(f"Navigating to {file_path}")
        page.goto(file_path)

        # Wait for table to render
        page.wait_for_selector("#polls-table-body tr", timeout=5000)

        # Find the first "Options" button
        options_btn = page.locator(".poll-options-btn").first
        expect(options_btn).to_be_visible()

        print("Clicking Options button...")
        options_btn.click()

        # Wait for dropdown to appear
        # The dropdown is appended to body with class fixed z-[9999]
        dropdown = page.locator("body > div.fixed.z-\\[9999\\]")
        expect(dropdown).to_be_visible()

        print("Dropdown visible. Taking screenshot...")
        page.screenshot(path="verification/dropdown_screenshot.png")

        # Verify dropdown items
        expect(dropdown).to_contain_text("Edit")
        expect(dropdown).to_contain_text("Duplicate")
        expect(dropdown).to_contain_text("Preview")
        expect(dropdown).to_contain_text("Delete")

        print("Verification successful.")
        browser.close()

if __name__ == "__main__":
    verify_dropdown()