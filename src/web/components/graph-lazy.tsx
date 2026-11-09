import { lazy, Suspense } from "react";
import type { GraphData } from "../types";
import { Loading } from "./ui";

const Graph = lazy(() =>
  import("./graph").then((module) => ({ default: module.GraphView })),
);

export function GraphView({ graph }: { graph: GraphData }) {
  return (
    <Suspense fallback={<Loading label="正在准备关系图" />}>
      <Graph graph={graph} />
    </Suspense>
  );
}
