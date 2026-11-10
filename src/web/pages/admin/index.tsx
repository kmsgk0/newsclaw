import { useSearchParams } from "react-router";
import { PageHeading, Tabs } from "../../components/ui";
import { NewsManagement } from "./news";
import { SkillManagement } from "./skills";
import { SourceManagement } from "./sources";
import { TaskManagement } from "./tasks";

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') ?? 'sources';
  return (
    <>
      <PageHeading
        title="管理工作台"
        description="维护公共信源、新闻、技能与处理任务。"
      />
      <Tabs
        value={view}
        options={[
          { value: 'sources', label: '信源' },
          { value: 'news', label: '新闻与事件' },
          { value: 'skills', label: '公开技能' },
          { value: 'tasks', label: '后台任务' },
        ]}
        onChange={(value) => setParams({ view: value })}
      />
      {view === 'sources' ? (
        <SourceManagement />
      ) : view === 'news' ? (
        <NewsManagement />
      ) : view === 'skills' ? (
        <SkillManagement />
      ) : (
        <TaskManagement />
      )}
    </>
  );
}
