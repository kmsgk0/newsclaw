import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, operationId, useOperation, useResource } from "../../api";
import { TaskWatch } from "../../components/task-status";
import { Empty, ErrorState, Feedback, formatDate, Loading } from "../../components/ui";
import type { Task } from "../../types";


export function TaskManagement() {
  const resource = useResource<{
    items: Task[];
    queue: { waiting: number; active: number; delayed: number; failed: number };
    dead: number;
  }>('/admin/tasks');
  const [selected, setSelected] = useState<Task | null>(null);
  const operation = useOperation();
  return (
    <>
      <div className="toolbar">
        <p className="muted">公共内容处理任务</p>
        <span className="spacer" />
        <button className="button secondary small" onClick={resource.reload}>
          <RefreshCw size={13} />
          刷新
        </button>
      </div>
      <Feedback operation={operation} />
      {selected && <TaskWatch task={selected} onComplete={resource.reload} />}
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data && (
        <section className="panel table-scroll">
          <div className="task-metrics">
            {[
              { label: '等待', value: resource.data.queue.waiting },
              { label: '执行中', value: resource.data.queue.active },
              { label: '延迟重试', value: resource.data.queue.delayed },
              { label: '失败', value: resource.data.queue.failed },
              { label: '死信', value: resource.data.dead },
            ].map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>尝试次数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((task) => (
                <tr key={task.id ?? task.taskId}>
                  <td>
                    <strong>
                      {{
                        collect: '采集整理',
                        daily: '日报生成',
                        journal: '编辑手记',
                        notify: '更新提醒',
                      }[task.type ?? ''] ?? task.type}
                    </strong>
                    <small>{formatDate(task.createdAt, true)}</small>
                    <details>
                      <summary>任务标识</summary>
                      <small>{task.id ?? task.taskId}</small>
                    </details>
                  </td>
                  <td>
                    <span
                      className={`tag ${task.status === 'succeeded' ? 'green' : task.status === 'failed' ? 'red' : ''}`}
                    >
                      {
                        {
                          pending: '等待',
                          running: '执行中',
                          succeeded:
                            task.result?.status === 'empty' ? '无内容' : '成功',
                          failed: '失败',
                        }[task.status]
                      }
                    </span>
                    {task.error && (
                      <small>
                        {typeof task.error === 'string'
                          ? task.error
                          : task.error.message}
                      </small>
                    )}
                  </td>
                  <td>
                    {task.attempts ?? 0}
                    {task.startedAt && task.finishedAt && (
                      <small>
                        {Math.max(
                          0,
                          (Date.parse(task.finishedAt) -
                            Date.parse(task.startedAt)) /
                            1000,
                        ).toFixed(1)}{' '}
                        秒
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="button secondary small"
                        onClick={() => setSelected(task)}
                      >
                        查看进度
                      </button>
                      {task.status === 'failed' && (
                        <button
                          className="button secondary small"
                          disabled={operation.busy}
                          onClick={() =>
                            operation.run(
                              () =>
                                api<Task>(
                                  `/admin/tasks/${task.id ?? task.taskId}/retry`,
                                  'POST',
                                  { operationId: operationId() },
                                ),
                              (value) => {
                                setSelected(value);
                                resource.reload();
                              },
                            )
                          }
                        >
                          <RefreshCw size={13} />
                          重试
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!resource.data.items.length && <Empty title="暂无公共任务" />}
        </section>
      )}
    </>
  );
}
