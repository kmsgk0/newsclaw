import { invalid } from '../../errors.js';
import type { NewsItem } from '../news/types.js';
import { validateMindmap, type MindmapNode } from './validation.js';

export interface ExportArtifact {
  title:string;kind:'brief'|'comparison'|'mindmap';content:string;structure:MindmapNode|null;
  sources:(NewsItem&{label?:string})[];savedAt:Date;
}
const inline=(value:string)=>value.replace(/\s+/g,' ').replace(/[\\[\]()]/g,'\\$&');
const link=(value:string)=>`<${value.replace(/[<>\s]/g,character=>encodeURIComponent(character))}>`;
export function artifactMarkdown(artifact:ExportArtifact) {
  const lines=[`# ${artifact.title.replace(/\s+/g,' ').trim()}`,'',`保存时间：${new Date(artifact.savedAt).toISOString()}`,'','## 内容',''];
  if(artifact.kind==='mindmap') {
    const tree=validateMindmap(artifact.structure,artifact.sources.map(source=>source.id));
    const render=(node:MindmapNode,depth:number)=>{
      const citations=node.sourceIds.map(id=>`[${artifact.sources.find(source=>source.id===id)!.label??`N${artifact.sources.findIndex(source=>source.id===id)+1}`}]`).join(' ');
      lines.push(`${'  '.repeat(depth)}- ${inline(node.label)} ${citations}`);
      node.children?.forEach(child=>render(child,depth+1));
    };
    render(tree,0);
  } else lines.push(artifact.content);
  lines.push('','## 来源','');
  artifact.sources.forEach((source,index)=>{
    const label=source.label??`N${index+1}`;
    lines.push(`- [${label}] [${inline(source.title)}](${link(source.url)}) — ${inline(source.sourceName)}`);
  });
  lines.push('');
  artifact.sources.forEach((source,index)=>lines.push(`[${source.label??`N${index+1}`}]: ${link(source.url)}`));
  const content=lines.join('\n')+'\n';
  if(artifact.sources.length>100 || Buffer.byteLength(content,'utf8')>1024*1024) throw invalid('成果超过 Markdown 导出限制（1 MiB，最多 100 篇来源）');
  const filename=([...artifact.title.replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^[._-]+/,'')].slice(0,80).join('')||'newsclaw-artifact')+'.md';
  return {content,filename};
}
