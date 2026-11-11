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

// CI runs without Supabase env, so this covers the "not configured" path only.
// Wrong password and rate limiting are covered by src/service/auth-service.test.ts;
// a real sign-in E2E needs a test Supabase project (not set up yet).
test("without auth config, sign-in shows the setup message and stays on S01", async ({ page }) => {
  test.skip(!!process.env.SUPABASE_URL, "auth is configured in this environment");
  await page.goto("/login?next=%2Fplants");
  await page.getByPlaceholder("비밀번호").fill("any-password");
  await page.getByRole("button", { name: "확인" }).click();
  // Next.js's route announcer also has role="alert", so match ours by text.
  await expect(
    page.getByRole("alert").filter({ hasText: "로그인 설정이 아직 완료되지 않았습니다" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Fplants$/);
});
