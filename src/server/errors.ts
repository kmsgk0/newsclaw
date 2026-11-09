export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const notFound = () => new AppError(404, 'NOT_FOUND', '内容不存在或无权访问');
export const forbidden = () => new AppError(403, 'FORBIDDEN', '此操作需要管理权限');
export const invalid = (message = '请检查输入内容') => new AppError(400, 'INVALID_INPUT', message);
export const unavailable = (message = '依赖服务暂不可用，请稍后重试') => new AppError(503, 'DEPENDENCY_UNAVAILABLE', message);
