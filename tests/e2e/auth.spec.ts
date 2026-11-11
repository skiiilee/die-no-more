import { expect, test } from "@playwright/test";

test("signed-out visitors are sent to S01 with the return path", async ({ page }) => {
  await page.goto("/plants");
  await expect(page).toHaveURL(/\/login\?next=%2Fplants$/);
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
});

test("S01 shows only a password field and a confirm button", async ({ page }) => {
  await page.goto("/login");
  // Wireframe pages 3–4: one visible input, a password field (no email field).
  const inputs = page.locator("input:not([type=hidden])");
  await expect(inputs).toHaveCount(1);
  await expect(inputs).toHaveAttribute("type", "password");
  await expect(page.getByPlaceholder("비밀번호")).toBeVisible();
  await expect(page.getByRole("button", { name: "확인" })).toBeVisible();
});

test("a failed sign-in shows an error and stays on S01", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("비밀번호").fill("definitely-wrong");
  await page.getByRole("button", { name: "확인" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
