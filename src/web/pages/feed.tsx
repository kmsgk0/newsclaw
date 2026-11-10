import { ArrowRight, CalendarDays, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { query, useResource } from "../api";
import { Prose, Sources } from "../components/content";
import { NewsRow, positions } from "../components/news";
import {
  Empty,
  ErrorState,
  formatDate,
  Loading,
  PageHeading,
  Pagination,
  SectionHeading,
  Tabs,
  today,
} from "../components/ui";
import type { DigestHistory, NewsItem, Page, Source, Trend } from "../types";

function PublicDigest({ date }: { date?: string }) {
  const resource = useResource<DigestHistory>(`/digests?${query({ date })}`);
  const [params, setParams] = useSearchParams();
  const reload = resource.reload;
  const digestState = resource.data;
  useEffect(() => {
    if (!digestState || !['pending', 'running'].includes(digestState.status))
      return;
    const timer = setTimeout(reload, 1500);
    return () => clearTimeout(timer);
  }, [digestState, reload]);
  const statusText = {
    pending: '日报正在等待处理',
    running: '正在生成日报',
    failed: '日报生成未完成',
    empty: '这一天暂无可整理的新闻',
    idle: '这一天尚未生成日报',
    ready: '',
  };
  return (
    <>
      <div className="toolbar">
        <label htmlFor="public-digest-date">查看日期</label>
        <select
          id="public-digest-date"
          className="date-input"
          value={date ?? ''}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set('date', event.target.value);
            else next.delete('date');
            setParams(next);
          }}
        >
          <option value="">最新一期</option>
          {resource.data?.availableDates?.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
        <button className="button quiet small" onClick={resource.reload}>
          <RefreshCw size={13} />
          刷新
        </button>
      </div>
      {resource.loading && !resource.data && <Loading label="正在读取日报" />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data &&
        ['pending', 'running'].includes(resource.data.status) && (
          <Loading label={statusText[resource.data.status]} />
        )}
      {resource.data?.status === 'failed' && resource.data.items.length > 0 && (
        <p className="inline-notice">
          最新一次生成未完成，以下保留已有日报。请稍后刷新。
        </p>
      )}
      {resource.data?.items.length === 0 && (
        <section className="panel">
          <Empty
            title={statusText[resource.data.status] || '暂无日报'}
            action={
              <Link className="button secondary" to="/">
                阅读最新资讯
              </Link>
            }
          >
            新闻整理完成后会生成日报，也可以从可用日期中查看往期内容。
          </Empty>
        </section>
      )}
      {resource.data?.items.map((digest) => (
        <article className="panel reading-history" key={digest.date}>
          <p className="content-meta">全站日报 · {digest.date}</p>
          <h2>{digest.title ?? '全站日报'}</h2>
          <p className="muted">生成于 {formatDate(digest.generatedAt, true)}</p>
          <Prose sources={digest.sources}>{digest.content}</Prose>
          {digest.sources ? (
            <Sources sources={digest.sources} />
          ) : (
            digest.news?.map((news) => (
              <NewsRow key={news.id} news={news} compact />
            ))
          )}
        </article>
      ))}
    </>
  );
}

export function FeedPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const view = params.get('view') ?? 'news';
  const [search, setSearch] = useState(params.get('q') ?? '');
  const searchInput = useRef<HTMLInputElement>(null);
  const source = useResource<{
    items: Pick<Source, 'id' | 'name'>[];
    domains: string[];
  }>('/sources');
  const trends = useResource<{ items: Trend[] }>('/trends');
  const daily = useResource<DigestHistory>('/digests');
  const resource = useResource<Page<NewsItem>>(
    view === 'news'
      ? `/news?${query({ q: params.get('q'), domain: params.get('domain'), sourceId: params.get('sourceId'), language: params.get('language'), page: params.get('page') ?? 1 })}`
      : null,
  );
  useEffect(() => setSearch(params.get('q') ?? ''), [params]);
  useEffect(() => {
    if (params.get('focus') === 'search') searchInput.current?.focus();
  }, [params]);
  useEffect(() => {
    if (resource.data)
      window.scrollTo(
        0,
        positions.get(location.pathname + location.search) ?? 0,
      );
  }, [resource.data, location.pathname, location.search]);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    change('q', search.trim());
  }
  const filtered = ['q', 'sourceId', 'domain', 'language'].some((key) =>
    params.has(key),
  );
  return (
    <>
      <PageHeading
        title="资讯中心"
        description="浏览最新报道，按来源和领域筛选。"
        actions={
          <span className="date-badge">
            <CalendarDays size={16} />
            {formatDate(today())}
          </span>
        }
      />
      <div className="two-column">
        <section>
          <Tabs
            value={view}
            options={[
              { value: 'news', label: '最新资讯' },
              { value: 'daily', label: '全站日报' },
            ]}
            onChange={(value) => change('view', value)}
          />
          {view === 'news' ? (
            <>
              <form className="feed-filters" onSubmit={submit}>
                <div className="search-field">
                  <Search size={17} />
                  <input
                    ref={searchInput}
                    value={search}
                    placeholder="搜索标题、正文或摘要"
                    aria-label="资讯关键词"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <button className="icon-button" aria-label="搜索资讯">
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="filter-row">
                  <select
                    aria-label="筛选来源"
                    value={params.get('sourceId') ?? ''}
                    onChange={(event) => change('sourceId', event.target.value)}
                  >
                    <option value="">全部来源</option>
                    {source.data?.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="筛选领域"
                    value={params.get('domain') ?? ''}
                    onChange={(event) => change('domain', event.target.value)}
                  >
                    <option value="">全部领域</option>
                    {source.data?.domains.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="筛选原文语言"
                    value={params.get('language') ?? ''}
                    onChange={(event) => change('language', event.target.value)}
                  >
                    <option value="">全部语言</option>
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                    <option value="other">其他语言</option>
                  </select>
                </div>
              </form>
              {source.error && (
                <ErrorState error={source.error} retry={source.reload} />
              )}
              {filtered && (
                <div className="search-result-heading">
                  <span>
                    {params.get('q') ? `“${params.get('q')}”` : '筛选结果'}
                    {resource.data ? ` · ${resource.data.total} 篇报道` : ''}
                  </span>
                  <button
                    className="button quiet small"
                    onClick={() => setParams({})}
                  >
                    清除筛选
                    <X size={12} />
                  </button>
                </div>
              )}
              {resource.loading && !resource.data && (
                <Loading label="正在读取新闻" />
              )}
              {resource.error && (
                <ErrorState error={resource.error} retry={resource.reload} />
              )}
              {resource.data && (
                <>
                  <div className="news-list">
                    {resource.data.items.length ? (
                      resource.data.items.map((news) => (
                        <NewsRow key={news.id} news={news} />
                      ))
                    ) : (
                      <Empty
                        title={filtered ? '没有匹配的报道' : '暂时没有新闻'}
                      >
                        {filtered
                          ? '调整关键词或筛选条件后再试。'
                          : '信源采集完成后，报道会出现在这里。'}
                      </Empty>
                    )}
                  </div>
                  <Pagination
                    page={resource.data.page}
                    pageSize={resource.data.pageSize}
                    total={resource.data.total}
                    onChange={(page) => change('page', String(page))}
                  />
                </>
              )}
            </>
          ) : (
            <PublicDigest date={params.get('date') ?? undefined} />
          )}
        </section>
        <aside className="column-stack">
          <section className="aside-section">
            <SectionHeading title="全站日报" />
            <p className="muted">
              {daily.data?.latestDate
                ? `最近一期：${daily.data.latestDate}`
                : '按日期整理当天的报道与来源。'}
            </p>
            <button
              className="button secondary small"
              onClick={() => change('view', 'daily')}
            >
              阅读日报
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="aside-section">
            <SectionHeading title="站内热点">
              <Link to="/trends">
                查看全部
                <ArrowRight size={13} />
              </Link>
            </SectionHeading>
            {trends.error ? (
              <ErrorState error={trends.error} retry={trends.reload} />
            ) : trends.loading ? (
              <Loading />
            ) : trends.data?.items.length ? (
              trends.data.items.slice(0, 5).map((trend, index) => (
                <Link
                  className="rank-row"
                  to={`/events/${trend.id}`}
                  key={trend.id}
                >
                  <span className="rank-number">{index + 1}</span>
                  <div>
                    <h3>{trend.title}</h3>
                    <small>
                      {trend.sourceCount} 个来源 · {trend.reportCount} 篇报道
                    </small>
                  </div>
                </Link>
              ))
            ) : (
              <p className="muted">近期暂无热点统计。</p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
