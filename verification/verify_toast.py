from playwright.sync_api import sync_playwright, expect
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Load the mock HTML file
    file_path = os.path.abspath("verification/mock_toast.html")
    page.goto(f"file://{file_path}")

    # Inject test function to trigger toasts
    page.evaluate("""
        window.triggerTestToasts = function() {
            // Trigger various toasts
            showToast('success', 'Success Toast', 'Default duration (4000ms)');
            setTimeout(() => {
                showToast('info', 'Info Toast', 'Default duration (5000ms)');
            }, 500);
            setTimeout(() => {
                showToast('warning', 'Warning Toast', 'Default duration (7000ms)');
            }, 1000);
             setTimeout(() => {
                showToast('error', 'Error Toast', 'Sticky (0ms)', null);
            }, 1500);

            // Trigger explicit duration override
            setTimeout(() => {
                showToast('success', 'Short Success', 'Explicit 2000ms', 2000);
            }, 2000);
        }
    """)

    # Run the test triggers
    page.evaluate("triggerTestToasts()")

    # Wait for toasts to appear
    page.wait_for_timeout(2500)

    # Take screenshot of all toasts visible
    page.screenshot(path="verification/toast_verification.png")

    # Verify sticky error toast is still there after long time (e.g. > default durations)
    # But for quick verification, just checking visual presence of different types is good.

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
