/**
 * Smoke tests for Kaya web app
 * Fast, non-blocking tests
 */

import { test, expect } from '@playwright/test';

// Shorter default timeout
test.setTimeout(10000);

test.describe('App Loading', () => {
  test('app loads and shows main UI', async ({ page }) => {
    await page.goto('/');
    // Use exact match to avoid multiple matches
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
  });

  test('page has correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Kaya/);
  });
});

test.describe('Header Actions', () => {
  test('has New, Open, Save buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'New', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeVisible();
  });
});

test.describe('Board Display', () => {
  test('board is visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban').first()).toBeVisible();
  });
});

test.describe('Keyboard Navigation', () => {
  test('arrow keys work', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.shudan-goban')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Home');
    await page.keyboard.press('End');

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Dark Mode', () => {
  test('respects dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Comment Editing', () => {
  test('can edit and save comments', async ({ page }) => {
    await page.goto('/');

    // Click the edit comment button
    const editButton = page.locator('.comment-edit-button');
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Verify we're in editing mode - textarea should appear
    const textarea = page.locator('.comment-textarea');
    await expect(textarea).toBeVisible();

    // Type a comment
    const testComment = 'Test comment from e2e';
    await textarea.fill(testComment);

    // Save using the save button
    const saveButton = page.locator('.comment-save-button');
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    // Verify we exited edit mode (textarea should be gone)
    await expect(textarea).not.toBeVisible();

    // Verify the comment was saved (should appear in markdown display)
    await expect(page.locator('.comment-markdown')).toContainText(testComment);
  });

  test('can cancel comment editing with Escape', async ({ page }) => {
    await page.goto('/');

    // Enter edit mode
    await page.locator('.comment-edit-button').click();
    const textarea = page.locator('.comment-textarea');
    await expect(textarea).toBeVisible();

    // Type something
    await textarea.fill('This should be cancelled');

    // Press Escape to cancel
    await page.keyboard.press('Escape');

    // Verify we exited edit mode
    await expect(textarea).not.toBeVisible();
  });

  test('Enter key saves comment', async ({ page }) => {
    await page.goto('/');

    // Enter edit mode
    await page.locator('.comment-edit-button').click();
    const textarea = page.locator('.comment-textarea');
    await expect(textarea).toBeVisible();

    // Type a comment and press Enter to save
    const testComment = 'Saved with Enter key';
    await textarea.fill(testComment);
    await page.keyboard.press('Enter');

    // Verify we exited edit mode and comment was saved
    await expect(textarea).not.toBeVisible();
    await expect(page.locator('.comment-markdown')).toContainText(testComment);
  });
});
