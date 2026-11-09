import { Bell, BellOff, ChevronLeft, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, useOperation, useResource } from "../api";
import { useAuth } from "../auth";
import { ReadingEditor } from "../components/chat";
import { GraphView } from "../components/graph-lazy";
import { NewsRow } from "../components/news";
import {
  ErrorState,
  Feedback,
  formatDate,
  Loading,
  PageHeading,
  Tabs,
} from "../components/ui";
import type { NewsEvent } from "../types";

export function EventPage() {
  const { id } = useParams();
  const auth = useAuth();
  const resource = useResource<NewsEvent>(auth.ready ? `/events/${id}` : null);
  const follow = useOperation();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'reports';
  const [showEditor, setShowEditor] = useState(false);
  if (!auth.ready || (resource.loading && !resource.data)) return <Loading />;
  if (!resource.data)
    return resource.error ? (
      <ErrorState error={resource.error} retry={resource.reload} />
    ) : null;
  const event = resource.data;
  return (
    <>
      <Link className="text-link back-link" to="/trends">
        <ChevronLeft size={14} />
        站内热点
      </Link>
      <PageHeading
        title={event.title}
        description={event.summary}
        actions={
          <>
            {auth.user ? (
              <button
                className="button secondary"
                disabled={follow.busy}
                onClick={() =>
                  follow.run(
                    () =>
                      api(
                        event.following ? `/follows/event/${id}` : '/follows',
                        event.following ? 'DELETE' : 'POST',
                        event.following ? undefined : { kind: 'event', id },
                      ),
                    () =>
                      resource.setData({
                        ...event,
                        following: !event.following,
                      }),
                  )
                }
              >
                {event.following ? <BellOff size={15} /> : <Bell size={15} />}
                {event.following ? '取消关注' : '关注进展'}
              </button>
            ) : (
              <Link
                className="button secondary"
                to={`/login?returnTo=/events/${id}`}
              >
                登录后关注
              </Link>
            )}
            <button
              className="button primary"
              onClick={() => setShowEditor(!showEditor)}
            >
              <MessageCircle size={16} />
              {showEditor ? '收起编辑' : '询问编辑'}
            </button>
          </>
        }
      />
      <Feedback operation={follow} />
      <div className={`read-layout ${showEditor ? 'with-editor' : ''}`}>
        <section>
          <Tabs
            value={view}
            options={[
              { value: 'reports', label: '多源报道', count: event.news.length },
              { value: 'timeline', label: '事件时间线' },
              { value: 'graph', label: '关系图' },
            ]}
            onChange={(value) => setParams({ view: value })}
          />
          {view === 'reports' ? (
            <div className="news-list">
              {event.news.map((news) => (
                <NewsRow key={news.id} news={news} />
              ))}
            </div>
          ) : view === 'timeline' ? (
            <div className="panel timeline">
              {event.timeline.map((news) => (
                <div className="timeline-item" key={news.id}>
                  <time>
                    {news.publishedAt
                      ? formatDate(news.publishedAt, true)
                      : '未提供日期'}
                  </time>
                  <NewsRow news={news} compact />
                </div>
              ))}
            </div>
          ) : (
            <section className="panel">
              <GraphView graph={event.graph} />
            </section>
          )}
        </section>
        {showEditor && (
          <ReadingEditor
            context={{ kind: 'event', id }}
            onClose={() => setShowEditor(false)}
          />
        )}
      </div>
    </>
  );
}
