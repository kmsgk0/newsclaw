import { api, useOperation, useResource } from "../../api";
import { Empty, ErrorState, Feedback, Loading } from "../../components/ui";
import type { Skill } from "../../types";


export function SkillManagement() {
  const resource = useResource<{ items: Skill[] }>('/admin/skills');
  const operation = useOperation();
  return (
    <>
      {resource.loading && !resource.data && <Loading />}
      {resource.error && (
        <ErrorState error={resource.error} retry={resource.reload} />
      )}
      <Feedback operation={operation} />
      {resource.data && (
        <section className="panel table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>公开技能</th>
                <th>发布状态</th>
                <th>管理</th>
              </tr>
            </thead>
            <tbody>
              {resource.data.items.map((skill) => (
                <tr key={skill.id}>
                  <td>
                    <strong>{skill.name}</strong>
                    <small>{skill.description}</small>
                  </td>
                  <td>
                    <span className="tag">
                      {
                        {
                          published: '已发布',
                          draft: '草稿',
                          unlisted: '已下架',
                        }[skill.status]
                      }
                    </span>
                  </td>
                  <td>
                    <button
                      className="button secondary small"
                      disabled={operation.busy}
                      onClick={() =>
                        operation.run(
                          () =>
                            api(`/skills/${skill.id}`, 'PATCH', {
                              status:
                                skill.status === 'published'
                                  ? 'unlisted'
                                  : 'published',
                            }),
                          resource.reload,
                        )
                      }
                    >
                      {skill.status === 'published' ? '下架' : '上架'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!resource.data.items.length && <Empty title="还没有公开技能" />}
        </section>
      )}
    </>
  );
}
