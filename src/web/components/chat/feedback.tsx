import { useState } from 'react';
import { api, useOperation } from '../../api';
import type { AnswerFeedback, Message } from '../../types';
import { Feedback, Field, Modal } from '../ui';

export function AnswerFeedbackControl({message,onChange}:{message:Message;onChange:(feedback:AnswerFeedback|null)=>void}) {
  const operation=useOperation();
  const [open,setOpen]=useState(false);
  const [category,setCategory]=useState<'inaccurate'|'unsupported_citation'>('inaccurate');
  const [sourceLabel,setSourceLabel]=useState('');
  const [note,setNote]=useState('');
  const path=`/messages/${message.id}/feedback`;
  function edit() {
    setCategory(message.feedback?.category==='unsupported_citation'?'unsupported_citation':'inaccurate');
    setSourceLabel(message.feedback?.sourceLabel??message.sources[0]?.label??'');
    setNote(message.feedback?.note??'');
    setOpen(true);
  }
  return <>
    <button className="button quiet small" disabled={operation.busy} aria-pressed={message.feedback?.category==='helpful'} onClick={()=>operation.run(()=>api<AnswerFeedback>(path,'POST',{category:'helpful'}),onChange)}>有用</button>
    <button className="button quiet small" onClick={edit}>{message.feedback&&message.feedback.category!=='helpful'?'修改反馈':'反馈问题'}</button>
    {message.feedback?.category==='inaccurate'&&<span className="tag">已反馈：事实不准确</span>}
    {message.feedback?.category==='unsupported_citation'&&<span className="tag">已反馈：引用不支持 {message.feedback.sourceLabel}</span>}
    {message.feedback&&<button className="button quiet small" disabled={operation.busy} onClick={()=>operation.run(()=>api(path,'DELETE'),()=>onChange(null))}>撤回反馈</button>}
    {!open&&<Feedback operation={operation}/>}
    <Modal open={open} title="回答反馈" onClose={()=>setOpen(false)}>
      <form onSubmit={event=>{event.preventDefault();void operation.run(()=>api<AnswerFeedback>(path,'POST',{category,...(category==='unsupported_citation'?{sourceLabel}:{}),note}),value=>{onChange(value);setOpen(false);});}}>
        <p className="muted">备注仅由你查看。管理工作台只展示类别和公开报道的汇总。</p>
        <Field label="反馈类型"><select value={category} onChange={event=>setCategory(event.target.value as typeof category)}><option value="inaccurate">事实不准确</option><option value="unsupported_citation" disabled={!message.sources.length}>引用不支持</option></select></Field>
        {category==='unsupported_citation'&&<Field label="问题引用"><select required value={sourceLabel} onChange={event=>setSourceLabel(event.target.value)}>{message.sources.map(source=><option key={source.label} value={source.label}>{source.label} · {source.title}</option>)}</select></Field>}
        <Field label="反馈备注" hint="最多 1000 字，可留空"><textarea maxLength={1000} value={note} onChange={event=>setNote(event.target.value)}/></Field>
        <Feedback operation={operation}/>
        <button className="button primary" disabled={operation.busy}>保存反馈</button>
      </form>
    </Modal>
  </>;
}
