import { test, expect } from "@playwright/test";
import { navigate, fits } from "./helpers";

test("NEWS-04 public reading, filters, empty results and responsive navigation", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "资讯中心" })).toBeVisible();
  await expect(page.locator(".news-row")).not.toHaveCount(0);
  await fits(page);
  await page.screenshot({
    path: info.outputPath("news-feed.png"),
    fullPage: true,
  });
  await page
    .getByRole("textbox", { name: "资讯关键词" })
    .fill("没有这篇新闻_反例");
  await page.getByRole("button", { name: "搜索资讯", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "没有匹配的报道" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(page.locator(".news-row")).not.toHaveCount(0);
  await navigate(page, "阅读技能");
  await expect(page.locator(".skill-card")).toHaveCount(5);
  await fits(page);
  await page.screenshot({
    path: info.outputPath("skills.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("OPS-03 failed news request stays an error and retry recovers", async ({
  page,
}) => {
  await page.route("**/api/v1/news?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "新闻检索暂不可用",
        data: null,
        requestId: "fixture-failure",
      }),
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("新闻检索暂不可用");
  await expect(
    page.getByRole("heading", { name: "新闻库正在等待第一批内容" }),
  ).toHaveCount(0);
  await page.unroute("**/api/v1/news?**");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".news-row")).not.toHaveCount(0);
});

test("UI-02 NEWS-04 structured article stays readable and returns to filtered list", async ({
  page,
}, info) => {
  await page.goto("/?q=云杉&domain=人工智能");
  await expect(page.locator(".news-row")).not.toHaveCount(0);
  await page
    .getByRole("link", {
      name: "云杉引擎开放试用：关注测试条件与未公布信息",
      exact: true,
    })
    .click();
  const prose = page.locator(".article > .prose");
  await expect(
    prose.getByRole("heading", { name: "开放试用与测试范围", exact: true }),
  ).toBeVisible();
  await expect(prose.locator("ul ul li")).toHaveCount(2);
  await expect(prose.locator(".markdown-table table")).toBeVisible();
  await expect(prose.locator("pre code")).toContainText("const response");
  await expect(prose.locator("h4")).toHaveCSS("font-weight", "650");
  await expect(prose.locator('input[type="checkbox"]')).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("structured-article.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "询问编辑", exact: true }).click();
  await expect(page.locator(".read-editor .chat-panel")).toBeVisible();
  expect(
    await page
      .locator(".read-editor")
      .evaluate(
        (element) => element.getBoundingClientRect().bottom <= innerHeight,
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "关闭阅读编辑", exact: true }).click();
  await expect(page.locator(".read-editor")).toHaveCount(0);
  await page.getByRole("link", { name: "返回资讯中心", exact: true }).click();
  await expect(page).toHaveURL(/q=.*domain=/);
  await expect(page.getByRole("textbox", { name: "资讯关键词" })).toHaveValue(
    "云杉",
  );
  await expect(page.getByRole("combobox", { name: "筛选领域" })).toHaveValue(
    "人工智能",
  );
});
