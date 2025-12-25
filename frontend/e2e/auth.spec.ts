import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');

    // Check login form elements
    await expect(page.getByText('Tulip CRM').first()).toBeVisible();
    await expect(page.getByText('Welcome Back')).toBeVisible();
    await expect(page.getByLabel('Email Address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('should login with valid admin credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill login form with admin credentials
    await page.getByLabel('Email Address').fill('admin@tulip.com');
    await page.getByLabel('Password').fill('Admin@2025');

    // Click sign in
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Wait for navigation to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });

    // Check dashboard loaded (first match in sidebar)
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to login page when not authenticated
    await expect(page).toHaveURL('/login');
  });
});
