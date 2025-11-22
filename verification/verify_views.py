from playwright.sync_api import sync_playwright, expect

def verify_renders():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        # Verify Teacher View
        page = browser.new_page()
        page.goto("file://" + os.path.abspath("verification/teacher_rendered.html"))
        # The title is updated dynamically by JS to include the timer, so we check for a substring or regex
        expect(page).to_have_title(re.compile(r"Veritas Live Poll"))
        # Check for some known content from Teacher_Body or Scripts to ensure they loaded
        # Using a generic selector that should exist if styles loaded
        # The body classes are modified by JS/Tailwind setup, checking for partial match
        expect(page.locator("body")).to_have_class(re.compile(r"bg-background-light"))
        page.screenshot(path="verification/teacher_view.png")
        print("Teacher view verified and screenshot taken.")

        # Verify Student View
        page = browser.new_page()
        page.goto("file://" + os.path.abspath("verification/student_rendered.html"))
        expect(page).to_have_title("Veritas Live Poll - Student")
        expect(page.locator("body")).to_have_class(re.compile(r"bg-white"))
        page.screenshot(path="verification/student_view.png")
        print("Student view verified and screenshot taken.")

        browser.close()

import os
import re
if __name__ == "__main__":
    verify_renders()
