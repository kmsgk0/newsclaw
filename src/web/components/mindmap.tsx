import { Link } from "react-router";
import type { MindNode } from "../types";


export function Mindmap({ node }: { node: MindNode }) {
  return (
    <ul className="mindmap">
      <li>
        <details open>
          <summary>{node.label}</summary>
          {node.sourceIds.length > 0 && (
            <div className="inline-links">
              {node.sourceIds.map((id, index) => (
                <Link to={`/news/${id}`} key={id}>
                  依据 {index + 1}
                </Link>
              ))}
            </div>
          )}
          {node.children?.map((child, index) => (
            <Mindmap key={`${child.label}-${index}`} node={child} />
          ))}
        </details>
      </li>
    </ul>
  );
}
