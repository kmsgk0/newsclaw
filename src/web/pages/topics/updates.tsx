import { api,useOperation,useResource } from '../../api';
import type { NewsItem } from '../../types';
import { NewsRow } from '../../components/news';
import { Empty,ErrorState,Feedback,Loading,formatDate } from '../../components/ui';

interface TopicProgress {since:string|null;asOf:string;total:number;displayed:number;truncated:boolean;groups:{id:string;title:string;news:NewsItem[]}[]}
export function TopicUpdates({topicId,onRead}:{topicId:string;onRead:()=>void}) {
  const resource=useResource<TopicProgress>(`/topics/${topicId}/updates`);
  const operation=useOperation();
  if(resource.loading&&!resource.data)return <Loading label="正在整理新增进展"/>;
  if(resource.error)return <ErrorState error={resource.error} retry={resource.reload}/>;
  if(!resource.data)return null;
  const progress=resource.data;
  return <section className="panel">
    <h2>自上次阅读以来</h2>
    <p className="muted">{progress.since?`从 ${formatDate(progress.since,true)}`:'首次查看，包含当前已加入专题的报道'}，截至 {formatDate(progress.asOf,true)}。</p>
    <p>共 {progress.total} 篇新增报道，按事件与独立报道分组。摘要来自已有报道，可打开来源核对。</p>
    {progress.truncated&&<p className="inline-notice">当前展示最早加入的 {progress.displayed} 篇。下方按钮会将截至本次查看的全部 {progress.total} 篇标为已读。</p>}
    <div className="toolbar">
      <button className="button secondary small" onClick={resource.reload}>刷新进展</button>
      {progress.total>0&&<button className="button primary small" disabled={operation.busy} onClick={()=>operation.run(()=>api(`/topics/${topicId}/read`,'POST',{through:progress.asOf}),()=>{resource.reload();onRead();},'本批进展已标为已读')}>将本批全部新增报道标为已读</button>}
    </div>
    <Feedback operation={operation}/>
    {!progress.total&&<Empty title="没有新增进展">新的匹配报道加入后会出现在这里。</Empty>}
    {progress.groups.map(group=><section key={group.id}><h3>{group.title} <small className="muted">{group.news.length} 篇</small></h3><div className="news-list">{group.news.map(news=><NewsRow key={news.id} news={news}/>)}</div></section>)}
  </section>;
}
