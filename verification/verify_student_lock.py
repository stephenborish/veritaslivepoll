from playwright.sync_api import sync_playwright
import os
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 800})

    file_path = os.path.abspath("verification/mock_student_view.html")
    page.goto(f"file://{file_path}")

    # Trigger a violation (Tab Exit)
    print("Triggering tab switch violation...")
    page.evaluate("window.triggerSecurityViolation('tab_switch')")

    # Check for Lock UI
    page.wait_for_selector("#status-container", state="visible")
    status_msg = page.locator("#status-message").text_content()
    print(f"Lock Message: {status_msg}")

    # Accept various lock messages
    valid_msgs = ["LOCKED", "paused", "Violation", "Fullscreen required", "SESSION LOCKED"]
    if any(msg in status_msg for msg in valid_msgs):
        print("PASS: Lock UI appeared.")
    else:
        print(f"FAIL: Unexpected message: {status_msg}")

    page.screenshot(path="verification/student_lock_initial.png")

    # Check sessionStorage
    lock_val = page.evaluate("sessionStorage.getItem('veritas_lock_active')")
    print(f"SessionStorage lock value: {lock_val}")
    if lock_val != 'true':
        print("FAIL: veritas_lock_active not set in sessionStorage")

    # Reload page to test persistence
    print("Reloading page...")
    page.reload()

    # Simulate app initialization attempting to update view or poll
    # This triggers the guard clause we added
    page.evaluate("if (typeof updateStudentView === 'function') updateStudentView({})")

    # Check persistence
    try:
        page.wait_for_selector("#status-container", state="visible", timeout=5000)
        status_msg_reload = page.locator("#status-message").text_content()
        print(f"Lock Message after reload: {status_msg_reload}")

        if any(msg in status_msg_reload for msg in valid_msgs):
            print("PASS: Lock persisted after reload.")
        else:
            print("FAIL: Lock UI appeared but message mismatch.")
    except Exception as e:
        print(f"FAIL: Lock UI did not appear after reload. Error: {e}")
        # Debug: check sessionStorage again
        lock_val_reload = page.evaluate("sessionStorage.getItem('veritas_lock_active')")
        print(f"SessionStorage lock value after reload: {lock_val_reload}")

    page.screenshot(path="verification/student_lock_persist.png")
    browser.close()

with sync_playwright() as p: run(p)
