import { test, expect } from '@playwright/test';

test.describe('Leads Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await page.goto('/login');
    await page.getByLabel('Email Address').fill('admin@tulip.com');
    await page.getByLabel('Password').fill('Admin@2025');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
  });

  test('should navigate to leads page', async ({ page }) => {
    // Click on Leads in sidebar
    await page.getByRole('button', { name: 'Leads' }).click();

    // Should navigate to leads page
    await expect(page).toHaveURL('/leads');

    // Check leads page elements - Leads button should be highlighted/active
    await expect(page.locator('.MuiDataGrid-root')).toBeVisible({ timeout: 10000 });
  });

  test('should show leads data grid', async ({ page }) => {
    await page.goto('/leads');

    // Wait for page load
    await page.waitForLoadState('networkidle');

    // Check for DataGrid
    const dataGrid = page.locator('.MuiDataGrid-root');
    await expect(dataGrid).toBeVisible({ timeout: 10000 });
  });

  test('should open create lead modal', async ({ page }) => {
    await page.goto('/leads');

    // Click Add Lead button
    await page.getByRole('button', { name: /add lead/i }).click();

    // Modal should open
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create New Lead').first()).toBeVisible();

    // Check form fields exist
    await expect(page.getByLabel('Name *')).toBeVisible();
    await expect(page.getByLabel('Phone Number *')).toBeVisible();
  });

  test('should show sidebar navigation', async ({ page }) => {
    // Check sidebar items
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Leads' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bulk Upload' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  });
});
