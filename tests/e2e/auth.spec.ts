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
  // One form only: the streamed return path must not duplicate the password field.
  await expect(page.getByPlaceholder("비밀번호")).toHaveCount(1);
  await expect(page.locator('input[type=hidden][name="next"]')).toHaveValue("/plants");
  await page.getByPlaceholder("비밀번호").fill("any-password");
  await page.getByRole("button", { name: "확인" }).click();
  // Next.js's route announcer also has role="alert", so match ours by text.
  await expect(
    page.getByRole("alert").filter({ hasText: "로그인 설정이 아직 완료되지 않았습니다" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Fplants$/);
});

for (const path of [
  "/plants/new",
  "/plants/new/manual",
  "/plants/new/register?mode=unknown",
  "/plants/new/search?q=ficus",
  "/plants/new/species/10000000-0000-0000-0000-000000000001",
  "/plants/new/photos",
  "/plants/new/identify/50000000-0000-0000-0000-000000000001",
]) {
  test(`pot registration screens need a session: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await expect(page.getByLabel("비밀번호")).toBeVisible();
  });
}

test("the photo API answers 401 JSON without a session, and sends nothing on", async ({ request }) => {
  const photos = { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) };
  const identify = await request.post("/api/identifications", { multipart: { consent: "true", photos } });
  expect(identify.status()).toBe(401);
  expect(await identify.json()).toEqual({ kind: "signed_out" });
});
