import { Link, useSearchParams } from "react-router";
import { query, useResource } from "../api";
import {
  Empty,
  ErrorState,
  formatDate,
  Loading,
  PageHeading,
  Pagination,
} from "../components/ui";
import type { Trend } from "../types";


export function TrendsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const days = Number(params.get('days') ?? 1);
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const resource = useResource<{
    items: Trend[];
    range: { from: string; to: string };
    trendRange?: { from: string; to: string };
    method: string;
    total: number;
    pageSize: number;
  }>(
    `/trends?${query({ page, historyDays: 7, from: from.slice(0, 13) + ':00:00.000Z' })}`,
  );
  return (
    <>
      <PageHeading
        title="站内热点"
        description="按本站收录报道观察事件热度，趋势展示最近七天的报道量。"
      />
      <div className="toolbar">
        <label htmlFor="trend-range">热榜范围</label>
        <select
          id="trend-range"
          className="filter-select"
          value={days}
          onChange={(event) => setParams({ days: event.target.value })}
        >
          <option value={1}>最近 24 小时</option>
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
        </select>
      </div>
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data && (
        <>
          <p className="context-note">
            {resource.data.method} ·{' '}
            {formatDate(resource.data.range.from, true)} 至{' '}
            {formatDate(resource.data.range.to, true)}
          </p>
          <section className="panel">
            {resource.data.items.length ? (
              resource.data.items.map((trend, index) => (
                <article className="trend-item" key={trend.id}>
                  <span className="rank-number">
                    {(page - 1) * resource.data!.pageSize + index + 1}
                  </span>
                  <div>
                    <h2>
                      <Link to={`/events/${trend.id}`}>{trend.title}</Link>
                    </h2>
                    <div className="trend-meta">
                      <span>{trend.sourceCount} 个来源</span>
                      <span>{trend.reportCount} 篇报道</span>
                    </div>
                  </div>
                  <TrendSparkline history={trend.history} />
                </article>
              ))
            ) : (
              <Empty title="暂无热点统计">可以扩大热榜时间范围。</Empty>
            )}
          </section>
          <Pagination
            page={page}
            pageSize={resource.data.pageSize}
            total={resource.data.total}
            onChange={(value) =>
              setParams({ days: String(days), page: String(value) })
            }
          />
        </>
      )}
    </>
  );
}

function TrendSparkline({ history }: { history: Trend['history'] }) {
  if (history.length < 2)
    return <span className="content-meta">历史统计积累中</span>;
  const values = history.map((point) => point.reportCount);
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (value, index) =>
        `${(index / (values.length - 1)) * 130 + 5},${48 - (value / max) * 40}`,
    )
    .join(' ');
  return (
    <figure className="trend-chart">
      <svg
        className="sparkline"
        viewBox="0 0 140 54"
        role="img"
        aria-label={history
          .map((point) => `${point.date}：${point.reportCount} 篇`)
          .join('；')}
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        {values.map((value, index) => (
          <circle
            key={index}
            cx={(index / (values.length - 1)) * 130 + 5}
            cy={48 - (value / max) * 40}
            r="2.5"
            fill="currentColor"
          />
        ))}
      </svg>
      <figcaption>
        {formatDate(history[0].date)} 至{' '}
        {formatDate(history[history.length - 1].date)}
      </figcaption>
    </figure>
  );
}
