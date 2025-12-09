from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 800})

    file_path = os.path.abspath("verification/mock_teacher_view.html")
    page.goto(f"file://{file_path}")

    # 1. Verify Calculator Toggle
    calc_btn = page.locator("#header-calc-toggle")
    calc_btn.wait_for(state="visible")
    print(f"Calculator button visible: {calc_btn.is_visible()}")

    # 2. Verify Layout Gap Removal
    live_view = page.locator("#live-view")
    classes = live_view.get_attribute("class")
    print(f"Live View Classes: {classes}")

    page.screenshot(path="verification/teacher_ui_check.png")
    browser.close()

with sync_playwright() as p: run(p)
