from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load local file
        path = os.path.abspath('verification/mock_question_bank.html')
        page.goto('file://' + path)

        # Wait for data load
        page.wait_for_selector('text=What is 2+2?')

        # Take screenshot
        page.screenshot(path='verification/qb_view.png')
        browser.close()

if __name__ == '__main__':
    run()
