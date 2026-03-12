import { test, expect } from "@playwright/test";
import { ensureLoggedIn, hasE2ECredentials } from "./helpers/auth";

const PAGES: Array<{ path: string; heading: RegExp }> = [
  { path: "/dashboard", heading: /(Dashboard|Hola)/i },
  { path: "/dashboard/guide", heading: /Primeros 30 minutos/i },
  { path: "/dashboard/inbox", heading: /Bandeja/i },
  { path: "/dashboard/workflows", heading: /Workflows/i },
  { path: "/dashboard/campaigns", heading: /Campanas/i },
  { path: "/dashboard/routing", heading: /Routing/i },
  { path: "/dashboard/payments", heading: /Pagos/i },
  { path: "/dashboard/channels", heading: /Canales/i },
];

test.describe("qa smoke", () => {
  test.skip(!hasE2ECredentials(), "Se requieren E2E_EMAIL y E2E_PASSWORD");

  test("core pages render sin quiebres visuales", async ({ page }) => {
    await ensureLoggedIn(page);

    for (const target of PAGES) {
      await page.goto(target.path, { waitUntil: "networkidle" });
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(target.heading);
      await expect(page.locator("text=Application error")).toHaveCount(0);
      await expect(page.locator("text=Unhandled Runtime Error")).toHaveCount(0);
    }
  });

  test("navegacion clara: operacion vs configuracion", async ({ page }) => {
    await ensureLoggedIn(page);

    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByText(/Operacion diaria/i)).toBeVisible();
    await expect(page.getByText(/Configuracion y automatizacion/i)).toBeVisible();

    const html = await page.content();
    expect(html.includes(String.fromCharCode(195))).toBeFalsy();
  });
});
