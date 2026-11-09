import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { navigate, register, fits } from "./helpers";

test("NEWS-05 SKILL-02 TOPIC-01 favorite, skill, sourced artifact and revocable sharing", async ({
  page,
}, info) => {
  await register(page);
  await navigate(page, "资讯中心");
  await page.locator(".news-row h3 a").first().click();
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "已收藏", exact: true }),
  ).toBeVisible();
  await navigate(page, "阅读技能");
  const skill = page.locator(".skill-card").filter({
    has: page.getByRole("heading", { name: "思维导图", exact: true }),
  });
  await skill.getByRole("button", { name: "安装技能", exact: true }).click();
  await expect(skill.getByRole("button", { name: "开始使用" })).toBeVisible();
  await navigate(page, "我的专题");
  await page.getByRole("button", { name: "新建专题", exact: true }).click();
  const topicName = `云杉研究 ${randomUUID().slice(0, 5)}`;
  await page.getByLabel("专题名称", { exact: true }).fill(topicName);
  await page.getByLabel("关注关键词", { exact: true }).fill("云杉");
  await page.getByRole("button", { name: "创建专题", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: topicName, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".news-row")).not.toHaveCount(0);
  await page.getByRole("button", { name: "让编辑整理", exact: true }).click();
  await page
    .getByLabel("选择阅读技能", { exact: true })
    .selectOption({ label: "思维导图" });
  await page
    .getByLabel("向编辑提问", { exact: true })
    .fill("请把当前专题整理成有来源的思维导图。");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存到专题", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "保存到专题", exact: true }).click();
  await page
    .getByLabel("选择专题", { exact: true })
    .selectOption({ label: topicName });
  await page.getByRole("button", { name: "保存成果", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("已保存到专题");
  await page.getByRole("button", { name: "关闭对话框", exact: true }).click();
  await page.getByRole("button", { name: "关闭阅读编辑", exact: true }).click();
  await page.getByRole("button", { name: /^阅读成果/ }).click();
  await expect(page.locator(".saved-artifact")).toHaveCount(1);
  await page.getByRole("button", { name: "预览并分享", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("预览公开内容");
  await page
    .getByRole("button", { name: "确认生成分享链接", exact: true })
    .click();
  const share = page.getByRole("link", { name: "公开分享页", exact: true });
  await expect(share).toBeVisible();
  const href = await share.getAttribute("href");
  await fits(page);
  await page.screenshot({
    path: info.outputPath("topic-artifact.png"),
    fullPage: true,
  });
  await share.click();
  await expect(page.locator(".share-article h1")).toContainText("云杉");
  await expect(page.locator(".share-article")).toContainText("云杉");
  await page.goBack();
  await page.getByRole("button", { name: /^阅读成果/ }).click();
  await page.getByRole("button", { name: "撤销分享", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("分享已撤销");
  await page.goto(href!);
  await expect(page.getByRole("alert")).toContainText("不存在");
});

test("TOPIC-01 UI-02 note preview, editing and removal persist", async ({
  page,
}) => {
  await register(page);
  await navigate(page, "我的专题");
  await page.getByRole("button", { name: "新建专题", exact: true }).click();
  await page
    .getByLabel("专题名称", { exact: true })
    .fill(`阅读笔记 ${randomUUID().slice(0, 5)}`);
  await page.getByLabel("关注关键词", { exact: true }).fill("云杉");
  await page.getByRole("button", { name: "创建专题", exact: true }).click();
  await page.getByRole("button", { name: /^我的笔记/ }).click();
  await page
    .getByLabel("新增笔记", { exact: true })
    .fill("## 待跟进\n\n- 商业价格\n- 硬件配置");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".note-preview h2")).toHaveText("待跟进");
  await expect(page.locator(".note-preview li")).toHaveCount(2);
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.locator(".topic-notes article")).toHaveCount(1);
  await page.getByRole("button", { name: "编辑笔记", exact: true }).click();
  await page
    .getByLabel("修改笔记内容", { exact: true })
    .fill("## 已更新\n\n保留测量条件。");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.locator(".topic-notes")).toContainText("已更新");
  await page.reload();
  await expect(page.locator(".topic-notes h2")).toHaveText("已更新");
  await page.getByRole("button", { name: "删除笔记", exact: true }).click();
  await page.getByRole("button", { name: "确认删除笔记", exact: true }).click();
  await expect(page.locator(".topic-notes article")).toHaveCount(0);
});

test("TOPIC-05 UI-04 disconnected graph opens a readable group and keeps complete list", async ({
  page,
}, info) => {
  await page.goto("/?q=多组关系图");
  await page
    .getByRole("link", {
      name: "多组关系图：对象分组与来源阅读",
      exact: true,
    })
    .click();
  await page
    .locator(".article-meta")
    .getByRole("link", { name: "查看事件", exact: true })
    .click();
  await page.getByRole("button", { name: "关系图", exact: true }).click();
  await expect(page.locator(".graph-heading")).toContainText(
    "26 个对象 · 15 条关系",
  );
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "图形", exact: true }).click();
  const selector = page.getByRole("combobox", {
    name: "图形范围",
    exact: true,
  });
  await expect(selector).not.toHaveValue("all");
  await expect(page.locator(".react-flow__node")).toHaveCount(8);
  const effectiveFont = await page
    .locator(".react-flow__node")
    .first()
    .evaluate(
      (element) =>
        Number.parseFloat(getComputedStyle(element).fontSize) *
        new DOMMatrix(
          getComputedStyle(
            document.querySelector(".react-flow__viewport")!,
          ).transform,
        ).a,
    );
  expect(effectiveFont).toBeGreaterThanOrEqual(11.5);
  await selector.selectOption("all");
  await expect(page.locator(".react-flow__node")).toHaveCount(26);
  const spread = await page
    .locator(".react-flow__node")
    .evaluateAll((elements) => {
      const positions = elements.map((element) => ({
        x: new DOMMatrix(getComputedStyle(element).transform).e,
        y: new DOMMatrix(getComputedStyle(element).transform).f,
      }));
      return {
        width:
          Math.max(...positions.map((p) => p.x)) -
          Math.min(...positions.map((p) => p.x)),
        height:
          Math.max(...positions.map((p) => p.y)) -
          Math.min(...positions.map((p) => p.y)),
      };
    });
  expect(spread.width).toBeGreaterThan(spread.height * 0.65);
  await page.getByRole("button", { name: "关系列表", exact: true }).click();
  await expect(page.locator(".relation-list > article")).toHaveCount(23);
  await expect(page.locator(".relation-list")).toContainText("公开许可");
  await expect(page.locator(".relation-list a")).toHaveCount(23);
  await fits(page);
});
