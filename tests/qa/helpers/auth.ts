import { expect, type Page } from "@playwright/test";

export function hasE2ECredentials(): boolean {
  return Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
}

export async function ensureLoggedIn(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan E2E_EMAIL o E2E_PASSWORD para pruebas autenticadas");
  }

  await page.goto("/dashboard", { waitUntil: "networkidle" });

  if (page.url().includes("/login")) {
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.getByRole("button", { name: /iniciar sesi/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
  }

  await expect(page).toHaveURL(/\/dashboard/);
}
