import { Link } from 'react-router';
import { useResource } from '../../api';
import type { AnswerFeedback } from '../../types';
import { Empty, ErrorState, Loading } from '../../components/ui';

export function FeedbackManagement() {
  const resource=useResource<{categories:{category:AnswerFeedback['category'];count:number}[];sources:{newsId:string;title:string;count:number}[]}>('/admin/feedback');
  return <section className="panel">
    <div className="toolbar"><h2>回答反馈</h2><span className="spacer"/><button className="button secondary small" onClick={resource.reload}>刷新</button></div>
    <p className="muted">按回答计数，每条回答只保留最新反馈。此处仅汇总类别与公开报道，引用问题最多展示前 50 篇。</p>
    {resource.loading&&!resource.data&&<Loading/>}
    {resource.error&&<ErrorState error={resource.error} retry={resource.reload}/>}
    {resource.data&&<>
      <div className="task-metrics">{(['helpful','inaccurate','unsupported_citation'] as const).map(category=><div key={category}><span>{{helpful:'有用',inaccurate:'事实不准确',unsupported_citation:'引用不支持'}[category]}</span><strong>{resource.data!.categories.find(item=>item.category===category)?.count??0}</strong></div>)}</div>
      <h3>被反馈引用问题的报道</h3>
      {resource.data.sources.map(source=><p key={source.newsId}><Link to={`/news/${source.newsId}`}>{source.title}</Link> · {source.count} 条</p>)}
      {!resource.data.sources.length&&<Empty title="暂无引用问题反馈"/>}
    </>}
  </section>;
}
