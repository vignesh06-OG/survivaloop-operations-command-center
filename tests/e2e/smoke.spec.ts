import { test, expect } from '@playwright/test';

test.describe('Survivaloop Smoke Tests', () => {
  test('Role chooser visible when logged out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Demo Identity')).toBeVisible();
    await expect(page.locator('text=Admin').first()).toBeVisible();
    await expect(page.locator('text=Supervisor')).toBeVisible();
    await expect(page.locator('text=Field Worker')).toBeVisible();
    await expect(page.locator('text=Auditor')).toBeVisible();
  });

  test('Supervisor login lands correctly', async ({ page }) => {
    await page.goto('/');
    // Mock login by hitting the API and setting cookie
    const loginRes = await page.request.post('/api/auth/demo/SUPERVISOR');
    expect(loginRes.status()).toBe(200);
    await page.goto('/');
    
    // Should see command center stats
    await expect(page.locator('text=Command Center').first()).toBeVisible();
    
    // Seed endpoint returns ok
    const seedRes = await page.request.post('/api/simulate');
    expect(seedRes.status()).toBe(200);
    const json = await seedRes.json();
    expect(json.ok).toBe(true);

    // Oversight returns 200
    const overRes = await page.request.get('/api/oversight');
    expect(overRes.status()).toBe(200);
  });

  test('Field worker tasks >= 5 and start task returns 200', async ({ page }) => {
    const loginRes = await page.request.post('/api/auth/demo/FIELD_WORKER');
    expect(loginRes.status()).toBe(200);
    
    const tasksRes = await page.request.get('/api/tasks');
    expect(tasksRes.status()).toBe(200);
    const tasks = await tasksRes.json();
    expect(tasks.length).toBeGreaterThanOrEqual(5);

    // start task returns 200
    const startRes = await page.request.patch(`/api/tasks/${tasks[0].id}`, {
      data: { to: 'IN_PROGRESS' }
    });
    expect(startRes.status()).toBe(200);
  });
});
