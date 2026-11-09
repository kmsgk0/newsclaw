import { Check } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { api, useOperation, useResource } from "../api";
import {
  Empty,
  ErrorState,
  Feedback,
  formatDate,
  Loading,
  PageHeading,
  Pagination,
  SectionHeading,
  Tabs,
} from "../components/ui";
import type { Follow, Notification } from "../types";


function updatedNotifications() {
  window.dispatchEvent(new Event('newsclaw:notifications'));
}

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'messages';
  const page = Number(params.get('page') ?? 1);
  const navigate = useNavigate();
  const resource = useResource<{
    total: number;
    pageSize: number;
    items: Notification[];
    unreadCount: number;
  }>(`/notifications?page=${page}`);
  const follows = useResource<{ items: Follow[] }>('/follows');
  const operation = useOperation();
  function refresh() {
    resource.reload();
    follows.reload();
    updatedNotifications();
  }
  return (
    <>
      <PageHeading title="消息与关注" />
      <Tabs
        value={view}
        options={[
          {
            value: 'messages',
            label: '更新提醒',
            count: resource.data?.unreadCount,
          },
          {
            value: 'follows',
            label: '我的关注',
            count: follows.data?.items.length,
          },
        ]}
        onChange={(value) => setParams({ view: value })}
      />
      <Feedback operation={operation} />
      {view === 'follows' ? (
        <>
          {follows.loading && <Loading />}
          {follows.error && (
            <ErrorState error={follows.error} retry={follows.reload} />
          )}
          <section className="panel">
            {follows.data?.items.length ? (
              follows.data.items.map((item) => (
                <article className="follow-row" key={`${item.kind}-${item.id}`}>
                  <div>
                    <span className="tag">
                      {item.kind === 'event' ? '事件' : '专题'}
                    </span>
                    <Link to={item.url}>{item.title}</Link>
                  </div>
                  <button
                    className="button secondary small"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(
                        () => api(`/follows/${item.kind}/${item.id}`, 'DELETE'),
                        refresh,
                      )
                    }
                  >
                    取消关注
                  </button>
                </article>
              ))
            ) : (
              <Empty title="还没有关注">
                在事件或专题中选择关注，收到后续报道提醒。
              </Empty>
            )}
          </section>
        </>
      ) : (
        <>
          {resource.loading && !resource.data && <Loading />}
          {resource.error && (
            <ErrorState error={resource.error} retry={resource.reload} />
          )}
          {resource.data && (
            <section className="panel">
              <SectionHeading
                title={
                  resource.data.unreadCount
                    ? `${resource.data.unreadCount} 条未读消息`
                    : '更新提醒'
                }
              >
                {resource.data.unreadCount > 0 && (
                  <button
                    className="button secondary small"
                    disabled={operation.busy}
                    onClick={() =>
                      operation.run(
                        () =>
                          api('/notifications/read-all', 'PATCH', {
                            read: true,
                          }),
                        refresh,
                      )
                    }
                  >
                    <Check size={14} />
                    全部已读
                  </button>
                )}
              </SectionHeading>
              {resource.data.items.length ? (
                resource.data.items.map((item) => (
                  <article
                    className={`notification-row ${item.readAt ? '' : 'unread'}`}
                    key={item.id}
                  >
                    <span className="notification-dot" />
                    <div>
                      <h3>
                        <button
                          className="notification-title"
                          disabled={operation.busy}
                          onClick={() =>
                            operation.run(
                              async () => {
                                if (!item.readAt)
                                  await api(
                                    `/notifications/${item.id}`,
                                    'PATCH',
                                    { read: true },
                                  );
                              },
                              () => {
                                updatedNotifications();
                                navigate(`/news/${item.newsId}`);
                              },
                            )
                          }
                        >
                          {item.title}
                        </button>
                      </h3>
                      <p className="muted">
                        {item.sourceName} · {formatDate(item.createdAt, true)}
                      </p>
                      {item.reasons?.length ? (
                        <p className="notification-reasons">
                          来自关注：
                          {item.reasons.map((reason) => (
                            <Link
                              key={`${reason.kind}-${reason.id}`}
                              to={reason.url}
                            >
                              {reason.title}
                            </Link>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    {!item.readAt && (
                      <button
                        className="button quiet small"
                        disabled={operation.busy}
                        onClick={() =>
                          operation.run(
                            () =>
                              api(`/notifications/${item.id}`, 'PATCH', {
                                read: true,
                              }),
                            refresh,
                          )
                        }
                      >
                        <Check size={14} />
                        标为已读
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <Empty title="暂时没有更新">
                  关注的事件或专题出现新报道时，会在这里提醒。
                </Empty>
              )}
              <Pagination
                page={page}
                pageSize={resource.data.pageSize}
                total={resource.data.total}
                onChange={(value) => setParams({ view, page: String(value) })}
              />
            </section>
          )}
        </>
      )}
    </>
  );
}
