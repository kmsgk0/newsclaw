import { test, expect } from "@playwright/test";
import { navigate, fits } from "./helpers";

test("ACC-05 OPS-02 administrator runs public collection and digest tasks", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin");
  await page.getByLabel("用户名", { exact: true }).fill("api_manager");
  await page.getByLabel("密码", { exact: true }).fill("correct-password");
  await page
    .locator(".auth-form")
    .getByRole("button", { name: "登录", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "管理工作台", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "采集", exact: true }).first().click();
  await expect(page.locator(".task-status")).toContainText("处理完成");
  await page.getByRole("button", { name: "新闻与事件", exact: true }).click();
  await page.getByRole("button", { name: "生成日报", exact: true }).click();
  await expect(page.locator(".task-status")).toContainText("处理完成");
  await page.getByRole("button", { name: "公开技能", exact: true }).click();
  await expect(page.locator(".data-table tbody tr")).toHaveCount(5);
  await page.getByRole("button", { name: "后台任务", exact: true }).click();
  await expect(page.locator(".data-table tbody tr")).not.toHaveCount(0);
  await fits(page);
  await page.screenshot({
    path: info.outputPath("admin-tasks.png"),
    fullPage: true,
  });
  await navigate(page, "站内热点");
  await page.locator(".trend-item h2 a").first().click();
  await expect(
    page.getByRole("button", { name: "事件时间线", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await expect(page.locator("main")).toContainText(/关系列表|尚无可展示的关系/);
  expect(errors).toEqual([]);
});
