import { ZodError } from 'zod';

const labels: Record<string, string> = {
  username: '用户名', password: '密码', oldPassword: '当前密码', newPassword: '新密码',
  name: '名称', title: '标题', content: '内容', avatar: '头像地址', interests: '关注方向',
  description: '说明', instructions: '处理说明', outputFormat: '输出形式', example: '效果示例',
  url: '地址', keywords: '关键词', domain: '领域', date: '日期',
};

interface ValidationIssue {
  instancePath?: string;
  keyword: string;
  params: { missingProperty?: string; additionalProperty?: string; limit?: number };
}

export function inputErrors(error: unknown): Record<string, string> | null {
  const fields: Record<string, string> = {};
  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_form';
      const label = labels[path] ?? '此项';
      if (issue.code === 'too_small') fields[path] = issue.origin === 'number' ? `${label}不能小于 ${issue.minimum}` : `${label}至少需要 ${issue.minimum} ${issue.origin === 'string' ? '个字符' : '项'}`;
      else if (issue.code === 'too_big') fields[path] = issue.origin === 'number' ? `${label}不能大于 ${issue.maximum}` : `${label}不能超过 ${issue.maximum} ${issue.origin === 'string' ? '个字符' : '项'}`;
      else if (issue.code === 'invalid_format') fields[path] = path === 'username' ? '用户名只能包含文字、数字、下划线和连字符' : `${label}格式不正确`;
      else if (issue.code === 'invalid_type') fields[path] = `请填写有效的${label}`;
      else if (issue.code === 'invalid_value') fields[path] = `请选择有效的${label}`;
      else fields[path] = issue.code === 'custom' ? issue.message : `${label}不符合要求`;
    }
    return fields;
  }
  const issues = (error as { validation?: ValidationIssue[] })?.validation;
  if (!Array.isArray(issues)) return null;
  for (const issue of issues) {
    const path = issue.params.missingProperty ?? issue.params.additionalProperty ?? issue.instancePath?.replace(/^\//, '').replaceAll('/', '.') ?? '_form';
    const label = labels[path] ?? '此项';
    if (issue.keyword === 'required') fields[path] = `请填写${label}`;
    else if (issue.keyword === 'minLength') fields[path] = `${label}至少需要 ${issue.params.limit} 个字符`;
    else if (issue.keyword === 'maxLength') fields[path] = `${label}不能超过 ${issue.params.limit} 个字符`;
    else if (issue.keyword === 'additionalProperties') fields[path] = '不支持此字段';
    else fields[path] = `${label}格式或取值不正确`;
  }
  return fields;
}
