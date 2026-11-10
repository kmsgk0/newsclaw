import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "打开导航", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page
    .locator(".sidebar")
    .getByRole("link", { name, exact: true })
    .click();
}

export async function register(page: Page) {
  const username = `ui_${randomUUID().slice(0, 8)}`;
  await page.goto("/editor");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await page.getByRole("link", { name: "创建账号", exact: true }).click();
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("ReadingFixture2026!");
  await page.getByRole("button", { name: "创建账号并开始阅读" }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "我的编辑",
  );
  return username;
}

export async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
