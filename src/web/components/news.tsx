import { ArrowRight } from "lucide-react";
import { type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import type { NewsItem } from "../types";
import { formatDate } from "./ui";


export const positions = new Map<string, number>();

export function contentUpdateState(news: NewsItem) {
  const values = ['source', 'summary', 'translation', 'index'].map(
    (key) => news.processing?.[key],
  );
  return values.includes('failed') || news.processing?.error
    ? 'failed'
    : values.some((value) => value === 'pending' || value === 'running')
      ? 'active'
      : 'retained';
}

export function NewsRow({
  news,
  compact = false,
  index,
  actions,
}: {
  news: NewsItem;
  compact?: boolean;
  index?: number;
  actions?: ReactNode;
}) {
  const location = useLocation();
  const from = location.pathname + location.search;
  const remember = () => positions.set(from, window.scrollY);
  const linkState = {
    from,
    fromLabel: location.pathname.startsWith('/topics')
      ? '返回专题'
      : location.pathname.startsWith('/library')
        ? '返回收藏与记录'
        : location.pathname.startsWith('/events')
          ? '返回事件'
          : '返回资讯中心',
  };
  return (
    <article className={`news-row ${compact ? 'compact' : ''}`}>
      {index !== undefined && (
        <span className="rank-number">
          {String(index + 1).padStart(2, '0')}
        </span>
      )}
      <div className="news-row-body">
        <div className="news-meta">
          <span>{news.sourceName}</span>
          <time dateTime={news.publishedAt ?? undefined}>
            {news.publishedAt
              ? formatDate(news.publishedAt, true)
              : '未提供发布时间'}
          </time>
          {news.domain && <span className="tag">{news.domain}</span>}
        </div>
        <h3>
          <Link to={`/news/${news.id}`} state={linkState} onClick={remember}>
            {news.title}
          </Link>
        </h3>
        {news.summary && <p className="news-summary">{news.summary}</p>}
        {!compact && (
          <div className="news-row-footer">
            {news.eventId && (
              <Link to={`/events/${news.eventId}`}>
                查看事件
                <ArrowRight size={12} />
              </Link>
            )}
            {news.contentScope === 'summary' && (
              <span className="content-meta">
                {news.processing?.material === 'title-only'
                  ? '仅标题'
                  : '来源摘要'}
              </span>
            )}
            {news.processing?.stale === true && (
              <span className="content-meta">
                {
                  {
                    failed: '部分内容未更新',
                    active: '内容更新中',
                    retained: '保留上次整理结果',
                  }[contentUpdateState(news)]
                }
              </span>
            )}
            {actions}
          </div>
        )}
      </div>
    </article>
  );
}
