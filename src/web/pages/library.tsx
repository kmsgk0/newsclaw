import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { api, query, useOperation, useResource } from "../api";
import { NewsRow, positions } from "../components/news";
import {
  Empty,
  ErrorState,
  Feedback,
  Loading,
  PageHeading,
  Pagination,
  Tabs,
} from "../components/ui";
import type { NewsItem, Page } from "../types";

export function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? 'favorites';
  const location = useLocation();
  const resource = useResource<Page<NewsItem>>(
    `/library?${query({ kind, page: params.get('page') ?? 1 })}`,
  );
  const operation = useOperation();
  useEffect(() => {
    if (resource.data)
      window.scrollTo(
        0,
        positions.get(location.pathname + location.search) ?? 0,
      );
  }, [resource.data, location.pathname, location.search]);
  return (
    <>
      <PageHeading
        title="收藏与阅读记录"
        actions={
          <Link className="button secondary" to="/editor?contextKind=favorites">
            <Sparkles size={15} />
            整理我的收藏
          </Link>
        }
      />
      <Tabs
        value={kind}
        options={[
          { value: 'favorites', label: '我的收藏' },
          { value: 'history', label: '最近阅读' },
        ]}
        onChange={(value) => setParams({ kind: value })}
      />
      <Feedback operation={operation} />
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      {resource.data && (
        <>
          <div className="news-list">
            {resource.data.items.length ? (
              resource.data.items.map((news) => (
                <NewsRow
                  key={news.id}
                  news={news}
                  actions={
                    kind === 'favorites' ? (
                      <button
                        className="text-link"
                        disabled={operation.busy}
                        onClick={() =>
                          operation.run(
                            () => api(`/news/${news.id}/favorite`, 'DELETE'),
                            resource.reload,
                          )
                        }
                      >
                        取消收藏
                      </button>
                    ) : undefined
                  }
                />
              ))
            ) : (
              <Empty
                title={kind === 'favorites' ? '还没有收藏' : '还没有阅读记录'}
                action={
                  <Link className="button secondary" to="/">
                    浏览资讯
                    <ArrowRight size={14} />
                  </Link>
                }
              >
                打开一篇报道后，可以收藏并稍后回看。
              </Empty>
            )}
          </div>
          <Pagination
            page={resource.data.page}
            pageSize={resource.data.pageSize}
            total={resource.data.total}
            onChange={(page) => setParams({ kind, page: String(page) })}
          />
        </>
      )}
    </>
  );
}
