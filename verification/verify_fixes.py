
from playwright.sync_api import Page, expect, sync_playwright
import os

def test_fixes(page: Page):
    cwd = os.getcwd()
    file_path = f"file://{cwd}/verification/mock_teacher.html"

    console_messages = []
    page.on("console", lambda msg: console_messages.append(msg.text))

    page.goto(file_path)

    print("Waiting for tests to complete...")
    page.wait_for_timeout(3000)

    logs = "\n".join(console_messages)
    print(f"Captured Logs:\n{logs}")

    # Verify Fallback
    assert "Mock: getLivePollData called" in logs, "Fallback did not call server"

    # Verify Sidebar
    assert "SUCCESS: Sidebar is correctly hidden" in logs, "Sidebar visibility fix failed"

    print("ALL VERIFICATIONS PASSED")
    page.screenshot(path="verification/verification.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_fixes(page)
        finally:
            browser.close()
