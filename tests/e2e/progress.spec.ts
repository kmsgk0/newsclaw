import {test,expect} from '@playwright/test';
import {register,navigate,fits} from './helpers';

test('TOPIC-07 readers review grouped new reports and acknowledge the current batch',async({page},info)=>{
  await register(page);await navigate(page,'我的专题');
  await page.getByRole('button',{name:'新建专题',exact:true}).click();
  await page.getByLabel('专题名称',{exact:true}).fill('新增进展样本');
  await page.getByLabel('关注关键词',{exact:true}).fill('云杉');
  await page.getByRole('button',{name:'创建专题',exact:true}).click();
  await page.getByRole('button',{name:/^新增进展/}).click();
  await expect(page.getByRole('heading',{name:'自上次阅读以来',exact:true})).toBeVisible();
  await expect(page.locator('.news-row').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('topic-progress.png')});
  await page.getByRole('button',{name:'将本批全部新增报道标为已读',exact:true}).click();
  await expect(page.getByRole('heading',{name:'没有新增进展',exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'没有新增进展',exact:true})).toBeVisible();
  await fits(page);
});
