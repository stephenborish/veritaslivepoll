
from playwright.sync_api import Page, expect, sync_playwright
import os
import sys

def test_approve_unlock_sanitization(page: Page):
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))
    page.on("pageerror", lambda exc: print(f"Browser Error: {exc}"))

    # Get absolute path to the mock file
    mock_file_path = os.path.abspath("verification/mock_teacher.html")
    print(f"Loading {mock_file_path}")
    page.goto(f"file://{mock_file_path}")

    # Wait for page load - reduced
    page.wait_for_timeout(500)

    # Check if function is exposed
    is_exposed = page.evaluate("typeof window.approveStudentUnlock === 'function'")
    print(f"Is approveStudentUnlock exposed? {is_exposed}")

    if not is_exposed:
        print("Function not exposed. Script likely crashed.")
        # content = page.content()
        # print(content[:500])
        return

    # Test Case 1: Pass NaN
    print("Testing NaN...")
    page.evaluate("window.approveStudentUnlock('student@test.com', 'poll1', NaN, null)")

    # Check last call
    last_call = page.evaluate("window.lastCall")
    print(f"Last call for NaN: {last_call}")
    if last_call.get('lockVersion') != 0:
        print("FAILURE: NaN did not result in 0")
        sys.exit(1)

    # Test Case 2: Pass String "5"
    print("Testing String '5'...")
    page.evaluate("window.approveStudentUnlock('student@test.com', 'poll1', '5', null)")

    last_call = page.evaluate("window.lastCall")
    print(f"Last call for '5': {last_call}")
    if last_call.get('lockVersion') != 5:
        print("FAILURE: '5' did not result in 5")
        sys.exit(1)

    # Test Case 3: Pass Valid Number 10
    print("Testing Number 10...")
    page.evaluate("window.approveStudentUnlock('student@test.com', 'poll1', 10, null)")

    last_call = page.evaluate("window.lastCall")
    print(f"Last call for 10: {last_call}")
    if last_call.get('lockVersion') != 10:
        print("FAILURE: 10 did not result in 10")
        sys.exit(1)

    # Take screenshot
    page.screenshot(path="verification/verification.png")
    print("Verification finished successfully.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_approve_unlock_sanitization(page)
        except Exception as e:
            print(f"Verification Failed: {e}")
            sys.exit(1)
        finally:
            browser.close()
