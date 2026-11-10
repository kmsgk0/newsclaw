import { test, expect } from "@playwright/test";
import { navigate, register, fits } from "./helpers";

test("ACC-02 EDITOR-01 EDITOR-05 account, profile and memory persist through reload", async ({
  page,
}, info) => {
  const username = await register(page);
  await page.getByRole("button", { name: "编辑设置", exact: true }).click();
  await page.getByLabel("编辑名字", { exact: true }).fill("闻见");
  await page
    .getByLabel("兴趣与关注方向", { exact: true })
    .fill("关注开源模型，少看融资新闻。");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("编辑设置已保存");
  await page.reload();
  await expect(page.getByLabel("兴趣与关注方向", { exact: true })).toHaveValue(
    "关注开源模型，少看融资新闻。",
  );
  await page.getByRole("button", { name: "长期记忆", exact: true }).click();
  await page.getByRole("button", { name: "添加记忆", exact: true }).click();
  await page.getByLabel("记忆名称", { exact: true }).fill("回答偏好");
  await page
    .getByLabel("记忆内容", { exact: true })
    .fill("先给结论，再说明依据。");
  await page.getByRole("button", { name: "保存记忆", exact: true }).click();
  await expect(page.locator(".memory-card")).toContainText(
    "先给结论，再说明依据。",
  );
  await fits(page);
  await page.screenshot({
    path: info.outputPath("memories.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "删除回答偏好", exact: true }).click();
  await page.getByRole("button", { name: "确认删除记忆", exact: true }).click();
  await expect(page.locator(".memory-card")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => /token/i.test(key)),
    ),
  ).toBe(false);
  await navigate(page, "账号设置");
  await page
    .getByLabel("当前密码", { exact: true })
    .fill("ReadingFixture2026!");
  await page.getByLabel("新密码", { exact: true }).fill("UpdatedReading2026!");
  await page.getByRole("button", { name: "保存新密码", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("用户名", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill("UpdatedReading2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await navigate(page, "我的编辑");
  await page.getByRole("button", { name: "编辑设置", exact: true }).click();
  await expect(page.getByLabel("编辑名字", { exact: true })).toHaveValue(
    "闻见",
  );
});

test("ACC-01/02 UI-03 account errors explain the field or credentials and clear across forms", async ({
  page,
}) => {
  await page.goto("/register");
  await page.getByLabel("用户名", { exact: true }).fill("ab");
  await page.getByLabel("密码", { exact: true }).fill("short");
  await page.getByRole("button", { name: "创建账号并开始阅读" }).click();
  await expect(page.locator(".field-error").first()).toContainText(
    "用户名至少需要 3 个字符",
  );
  await page.getByLabel("用户名", { exact: true }).fill("api_reader_a");
  await page.getByRole("button", { name: "创建账号并开始阅读" }).click();
  await expect(page.locator(".field-error")).toContainText(
    "密码至少需要 8 个字符",
  );
  await page.getByLabel("密码", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "创建账号并开始阅读" }).click();
  await expect(page.getByRole("alert")).toContainText("用户名已被使用");
  await expect(page.getByRole("alert").locator("details")).toHaveCount(0);
  await expect(page.getByLabel("用户名", { exact: true })).toHaveValue(
    "api_reader_a",
  );
  await page.getByRole("link", { name: "去登录", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("用户名", { exact: true }).fill("api_reader_a");
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("用户名或密码错误");
  await expect(page.getByRole("alert").locator("details")).toHaveCount(0);
  await page.getByLabel("密码", { exact: true }).fill("correct-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await navigate(page, "账号设置");
  await page.getByLabel("当前密码", { exact: true }).fill("wrong-password");
  await page.getByLabel("新密码", { exact: true }).fill("AnotherFixture2026!");
  await page.getByRole("button", { name: "保存新密码" }).click();
  await expect(page.getByRole("alert")).toHaveText("当前密码不正确");
  await expect(page.getByLabel("新密码", { exact: true })).toHaveValue(
    "AnotherFixture2026!",
  );
  await fits(page);
});
