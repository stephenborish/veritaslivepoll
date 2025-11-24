import os
from playwright.sync_api import sync_playwright, expect

def verify_toast_interaction():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the mock HTML file
        file_path = os.path.abspath("verification/mock_toast_test.html")
        page.goto(f"file://{file_path}")

        # Click the trigger button
        page.click("#trigger-toast-btn")

        # Wait for toast to appear
        toast = page.locator(".toast")
        expect(toast).to_be_visible()

        # Take screenshot of the toast
        page.screenshot(path="verification/toast_visible.png")
        print("Screenshot saved: verification/toast_visible.png")

        # Check if action button exists inside toast
        action_btn = toast.locator(".toast-action-btn")
        expect(action_btn).to_be_visible()
        expect(action_btn).to_have_text("Reveal Answer")

        # Click the action button
        # We need to handle the alert that pops up
        page.on("dialog", lambda dialog: dialog.accept())
        action_btn.click()

        # Verify the result log shows the click
        result_log = page.locator("#result-log")
        expect(result_log).to_contain_text("Reveal Answers button clicked!")

        print("Toast verification successful!")
        browser.close()

if __name__ == "__main__":
    verify_toast_interaction()
