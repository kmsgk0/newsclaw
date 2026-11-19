import {test,expect} from '@playwright/test';
import {register,fits} from './helpers';

test('EDITOR-07 readers control automatic generation and recover their settings',async({page})=>{
  await register(page);
  await page.getByRole('button',{name:'编辑设置',exact:true}).click();
  await expect(page.getByLabel('生成频率',{exact:true})).toHaveValue('manual');
  await page.getByLabel('生成频率',{exact:true}).selectOption('updates');
  await page.getByLabel('每日自动调用上限',{exact:true}).fill('2');
  await page.getByLabel('每日开始小时',{exact:true}).fill('9');
  await page.getByRole('button',{name:'保存自动生成设置',exact:true}).click();
  await expect(page.getByText('自动生成设置已保存',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('生成频率',{exact:true})).toHaveValue('updates');
  await expect(page.getByLabel('每日自动调用上限',{exact:true})).toHaveValue('2');
  await expect(page.getByLabel('每日开始小时',{exact:true})).toHaveValue('9');
  await expect(page.getByText(/自动调用 0 \/ 2 次/)).toBeVisible();
  await fits(page);
});
