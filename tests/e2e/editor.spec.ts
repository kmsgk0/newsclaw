import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { register, fits } from "./helpers";

test("UI-04 material dialog supports keyboard dismissal and returns focus", async ({page}) => {
  await register(page);
  const trigger=page.locator('.chat-header').getByRole('button',{name:'选择阅读材料',exact:true});
  await trigger.focus();await trigger.press('Enter');
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("UI-05 a late conversation response cannot populate a new conversation", async ({page}) => {
  await register(page);
  const id=randomUUID();
  let release!:()=>void;
  let requested!:()=>void;
  let fulfilled!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{requested=resolve;});
  const completed=new Promise<void>(resolve=>{fulfilled=resolve;});
  let first=true;
  await page.route(`**/api/v1/conversations/${id}`,async route=>{
    if(first){first=false;requested();await gate;}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'OK',data:{id,title:'原会话',context:null,messages:[{id:randomUUID(),role:'user',content:'原会话的内容',status:'completed',sources:[],createdAt:'2026-11-24T00:00:00Z'}]}})});
    fulfilled();
  });
  await page.goto(`/editor?conversation=${id}`);
  await started;
  await page.getByRole('button',{name:'新建会话',exact:true}).click();
  await expect(page).not.toHaveURL(/conversation=/);
  await expect(page.getByRole('heading',{name:'想了解什么新闻？',exact:true})).toBeVisible();
  const input=page.getByLabel('向编辑提问',{exact:true});
  await input.fill('新会话草稿');
  release();await completed;
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await expect(input).toHaveValue('新会话草稿');
  await page.goto(`/editor?conversation=${id}`);
  await expect(page.locator('.chat-message.user .prose')).toHaveText('原会话的内容');
});

test("UI-03 EDITOR-03 composer, material selection, citations and separate conversations", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 740 });
  await register(page);
  const composer = page.locator(".composer");
  await expect(composer).toBeVisible();
  expect(
    await composer.evaluate(
      (element) => element.getBoundingClientRect().bottom <= innerHeight,
    ),
  ).toBe(true);
  await page
    .locator(".chat-header")
    .getByRole("button", { name: "选择阅读材料", exact: true })
    .click();
  await page.getByRole("dialog").locator(".material-result").first().click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".chat-header")).toContainText("新闻：");
  await page.getByLabel("向编辑提问", { exact: true }).fill("请概括当前报道。");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  await expect(
    page.locator(".chat-message.assistant .message-actions"),
  ).toBeVisible();
  await expect(page.locator(".chat-message.user")).toHaveCount(1);
  await expect(
    page.locator(".chat-message.assistant .citation"),
  ).toHaveAttribute("href", /\/news\//);
  const originalUrl = page.url();
  expect(originalUrl).toContain("conversation=");
  await page.getByRole("button", { name: "新建会话", exact: true }).click();
  await expect(page.locator(".chat-message")).toHaveCount(0);
  expect(page.url()).not.toContain("conversation=");
  await page.goto(originalUrl);
  await expect(page.locator(".chat-message.user")).toHaveCount(1);
  await expect(page.locator(".chat-message.assistant .citation")).toBeVisible();
  expect(
    await composer.evaluate(
      (element) => element.getBoundingClientRect().bottom <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("editor-workspace.png") });
});

test("UI-02 citation aliases preserve nonconsecutive source labels", async ({
  page,
}) => {
  await register(page);
  const news = (
    await (await page.request.get("/api/v1/news?pageSize=100")).json()
  ).data.items;
  const first = news.find(
    (item: { title: string }) =>
      item.title === "云杉引擎开放试用：关注测试条件与未公布信息",
  );
  const second = news.find(
    (item: { title: string }) =>
      item.title === "独立测试观察：不同样本下的云杉引擎表现",
  );
  await page.route("**/api/v1/editor/digests?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "OK",
        data: {
          items: [
            {
              date: "2026-11-09",
              content: "官方报道 [2]。独立报道 [N4]。",
              generatedAt: "2026-11-09T08:00:00+08:00",
              sources: [
                { ...first, label: "N2" },
                { ...second, label: "N4" },
              ],
            },
          ],
          availableDates: ["2026-11-09"],
          status: "ready",
          latestTask: null,
        },
      }),
    }),
  );
  await page.getByRole("button", { name: "个人日报", exact: true }).click();
  await expect(
    page
      .locator(".reading-history .prose")
      .getByRole("link", { name: "[2]", exact: true }),
  ).toHaveAttribute("href", `/news/${first.id}`);
  await expect(
    page
      .locator(".reading-history .prose")
      .getByRole("link", { name: "[N4]", exact: true }),
  ).toHaveAttribute("href", `/news/${second.id}`);
});

test("EDITOR-03 UI-03 retrieval failure keeps its cause after reload and clears after retry", async ({
  page,
}) => {
  await register(page);
  const question = `error-feedback-quota-${randomUUID()}`;
  await page.getByRole("textbox", { name: "向编辑提问" }).fill(question);
  await page.getByRole("button", { name: "发送问题" }).click();
  const failed = page.locator(".chat-message.assistant").getByRole("alert");
  await expect(failed).toContainText("新闻检索服务额度已用完");
  await failed.getByText("错误详情", { exact: true }).click();
  const request = await failed.locator("small").innerText();
  expect(request).toMatch(/请求标识：.+/);
  await page.reload();
  await expect(failed).toContainText("新闻检索服务额度已用完");
  await failed.getByText("错误详情", { exact: true }).click();
  await expect(failed.locator("small")).toHaveText(request);
  await page.getByRole("button", { name: "重试回答" }).click();
  await expect(page.locator(".chat-message.assistant .prose")).toContainText(
    "商业价格尚未公布",
  );
  await expect(page.locator(".chat-message.assistant .tag.red")).toHaveCount(0);
  await expect(
    page.locator(".chat-message.assistant").getByRole("alert"),
  ).toHaveCount(0);
  await expect(page.locator(".chat-message.user")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".chat-message.assistant .prose")).toContainText(
    "商业价格尚未公布",
  );
  await expect(
    page.locator(".chat-message.assistant").getByRole("alert"),
  ).toHaveCount(0);
  await fits(page);
});

test("EDITOR-03 stopped streamed request can retry without duplicating the question", async ({
  page,
}, info) => {
  await register(page);
  const question = "scroll-reading-fixture 请说明材料中的测试条件。";
  await page.getByLabel("向编辑提问", { exact: true }).fill(question);
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  const answer = page.locator(".chat-message.assistant");
  await expect(answer).toBeVisible();
  const cancelled = page.waitForEvent("requestfailed", request => /\/conversations\/[^/]+\/messages$/.test(new URL(request.url()).pathname));
  await page.getByRole("button", { name: "停止回答", exact: true }).click();
  await cancelled;
  await page.waitForLoadState("networkidle");
  await expect(answer.locator(".tag.red")).toHaveText("未完成");
  await expect(answer.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试回答", exact: true })).toBeEnabled();
  await expect(page.locator(".chat-message.user .prose")).toHaveText(question);
  await page.screenshot({ path: info.outputPath("stopped-answer.png") });
  await page.reload();
  await expect(answer.locator(".tag.red")).toHaveText("未完成");
  await page.getByRole("button", { name: "重试回答", exact: true }).click();
  await expect(answer.locator(".prose")).toContainText("正文结束，保留来源。");
  await expect(page.getByRole("button", { name: "发送问题", exact: true })).toBeVisible();
  await expect(answer.getByRole("alert")).toHaveCount(0);
  await expect(answer.locator(".tag.red")).toHaveCount(0);
  await expect(page.locator(".chat-message.user")).toHaveCount(1);
  await expect(answer).toHaveCount(1);
  await page.reload();
  await expect(answer.locator(".prose")).toContainText("正文结束，保留来源。");
  await expect(page.locator(".chat-message.user .prose")).toHaveText(question);
});

test("UI-02 cited sources stay visible while other retrieved material is collapsed", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 740 });
  await register(page);
  const id = randomUUID();
  const sources = Array.from({ length: 20 }, (_, index) => ({
    id: randomUUID(),
    label: `N${index + 1}`,
    title: `报道 ${index + 1}：测试条件与来源说明`,
    sourceName: "阅读测试材料",
    url: `https://example.org/reading/${index + 1}`,
  }));
  await page.route(`**/api/v1/conversations/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        code: "OK",
        data: {
          id,
          title: "有来源的简短回答",
          context: null,
          messages: [
            {
              id: randomUUID(),
              role: "user",
              content: "请简要说明测试条件。",
              status: "completed",
              sources: [],
              createdAt: "2026-11-09T08:00:00Z",
            },
            {
              id: randomUUID(),
              role: "assistant",
              content:
                "官方测试包含 1000 条请求 [N7]。独立测试使用不同样本 [15]。代码示例 `引用 [N1]` 保留原样。",
              status: "completed",
              sources,
              createdAt: "2026-11-09T08:00:01Z",
            },
          ],
        },
      }),
    }),
  );
  await page.goto(`/editor?conversation=${id}`);
  const answer = page.locator(".chat-message.assistant");
  await expect(answer.locator(".prose")).toContainText("官方测试包含");
  await expect(answer.locator(".sources .source-row:visible")).toHaveCount(2);
  await expect(
    answer.locator(".sources .source-row:visible .source-link > span"),
  ).toHaveText(["N7", "N15"]);
  await expect(
    answer.getByRole("link", { name: "[N7]", exact: true }),
  ).toHaveAttribute("href", `/news/${sources[6].id}`);
  await expect(
    answer.getByRole("link", { name: "[15]", exact: true }),
  ).toHaveAttribute("href", `/news/${sources[14].id}`);
  const within = () =>
    answer.locator(".prose").evaluate((element) => {
      const box = element.getBoundingClientRect(),
        view = element.closest(".chat-messages")!.getBoundingClientRect();
      return box.top >= view.top && box.bottom <= view.bottom;
    });
  await expect.poll(within).toBe(true);
  const other = answer.getByText("其他检索材料（18）", { exact: true });
  await other.focus();
  await other.press("Enter");
  await expect(answer.locator(".sources .source-row:visible")).toHaveCount(20);
  await other.press("Enter");
  await expect(answer.locator(".sources .source-row:visible")).toHaveCount(2);
  await page.reload();
  await expect(answer.locator(".sources .source-row:visible")).toHaveCount(2);
  await expect.poll(within).toBe(true);
  await fits(page);
  await page.screenshot({
    path: info.outputPath("answer-and-cited-sources.png"),
  });
});

test("UI-02 streaming keeps manual reading position and returns to the answer", async ({
  page,
}, info) => {
  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1440, height: 740 });
  await register(page);
  await page
    .getByLabel("向编辑提问", { exact: true })
    .fill("scroll-reading-fixture");
  await page.getByRole("button", { name: "发送问题", exact: true }).click();
  const reader = page.locator(".chat-messages");
  await expect
    .poll(() => page.locator(".chat-message.assistant .prose p").count())
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(64);
  await reader.evaluate((element) =>
    element.scrollTo({ top: 0, behavior: "instant" }),
  );
  await expect(
    page.getByRole("button", { name: "回到最新内容", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "发送问题", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => reader.evaluate((element) => element.scrollTop))
    .toBeLessThan(2);
  await page.getByRole("button", { name: "回到最新内容", exact: true }).click();
  await expect(
    page.locator(".chat-message.assistant .prose p").last(),
  ).toContainText("正文结束");
  await expect(
    page.locator(".chat-message.assistant .prose p").last(),
  ).toBeInViewport();
  await expect(
    page.locator(".chat-message.assistant .sources .source-row:visible"),
  ).toHaveCount(1);
  await fits(page);
});
