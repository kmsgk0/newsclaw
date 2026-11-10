import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { navigate, register } from "./helpers";

test("SKILL-01 EDITOR-03 brief starts with selected material and renders one result", async ({
  page,
}) => {
  await register(page);
  await navigate(page, "阅读技能");
  const skill = page.locator(".skill-card").filter({
    has: page.getByRole("heading", { name: "专题简报", exact: true }),
  });
  await skill.getByRole("button", { name: "安装并使用", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").locator(".material-result").first().click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".chat-header")).toContainText("新闻：");
  await expect(
    page.getByRole("combobox", { name: "选择阅读技能" }),
  ).not.toHaveValue("");
  await page
    .getByLabel("向编辑提问", { exact: true })
    .fill("整理当前材料的简报。");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存到专题", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".chat-message.assistant > .prose")).toHaveCount(0);
  await expect(
    page.locator(".chat-message.assistant .artifact-preview .prose"),
  ).toHaveCount(1);
});

test("SKILL-04 existing publication opens with its saved description and example", async ({
  page,
}) => {
  await register(page);
  const description = "按来源逐项整理技术发布，保留测试条件。";
  const example = "## 发布摘要\n\n两篇报道采用不同样本，商业价格尚未披露。";
  // A controlled existing-publication response isolates form hydration from publishing writes.
  await page.route("**/api/v1/skills/mine", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "OK",
        data: {
          items: [
            {
              id: randomUUID(),
              templateId: randomUUID(),
              kind: "brief",
              name: "我的技术简报",
              instructions: "保留事实与来源。",
              outputFormat: "简报",
              enabled: true,
              publication: {
                id: randomUUID(),
                status: "published",
                description,
                example,
              },
            },
          ],
        },
      }),
    }),
  );
  await navigate(page, "阅读技能");
  await page.getByRole("button", { name: /^我的技能/ }).click();
  await page.getByRole("button", { name: "更新公开版本", exact: true }).click();
  await expect(page.getByLabel("公开介绍", { exact: true })).toHaveValue(
    description,
  );
  await expect(page.getByLabel("公开效果示例", { exact: true })).toHaveValue(
    example,
  );
  await page.getByRole("button", { name: "预览公开内容", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(description);
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "发布摘要", exact: true }),
  ).toBeVisible();
});
