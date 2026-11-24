import { useResource, useOperation, api } from '../../api';
import { ErrorState, Feedback, Field, Loading, formatDate } from '../../components/ui';

interface GenerationState {
  settings: {mode:'manual'|'daily'|'updates';startHour:number;dailyLimit:number;pausedUntil:string|null};
  usage: {date:string;automaticCalls:number;manualCalls:number;knownTotalTokens:number;unknownCalls:number};
}
export function GenerationPanel() {
  const resource = useResource<GenerationState>('/editor/generation');
  const operation = useOperation();
  if (resource.loading && !resource.data) return <Loading label="正在读取自动生成设置" />;
  if (resource.error) return <ErrorState error={resource.error} retry={resource.reload} />;
  if (!resource.data) return null;
  const { settings,usage } = resource.data;
  const paused = settings.pausedUntil && Date.parse(settings.pausedUntil) > Date.now();
  return <section className="panel narrow-panel" style={{marginTop:24}}>
    <h2>自动生成与用量</h2>
    <p className="muted">控制个人日报和编辑手记。调用次数包含失败重试；手动生成独立可用。</p>
    <p>{usage.date}：自动调用 {usage.automaticCalls} / {settings.dailyLimit} 次，手动调用 {usage.manualCalls} 次；已知用量 {usage.knownTotalTokens} token。{usage.unknownCalls>0 && `另有 ${usage.unknownCalls} 次尚无总 token 用量。`}</p>
    {paused && <p className="inline-notice">上游额度不可用，自动生成暂停至 {formatDate(settings.pausedUntil!,true)}。<button className="text-link" disabled={operation.busy} onClick={()=>operation.run(()=>api('/editor/generation','PATCH',{resume:true}),resource.reload,'已恢复自动生成')}>恢复自动生成</button></p>}
    <form key={JSON.stringify(settings)} onSubmit={event=>{
      event.preventDefault();
      const fields = new FormData(event.currentTarget);
      void operation.run(()=>api('/editor/generation','PATCH',{mode:fields.get('mode'),startHour:Number(fields.get('startHour')),dailyLimit:Number(fields.get('dailyLimit'))}),resource.reload,'自动生成设置已保存');
    }}>
      <Field label="生成频率"><select name="mode" defaultValue={settings.mode}>
        <option value="manual">仅手动生成</option><option value="daily">每天定时生成</option><option value="updates">内容更新后生成</option>
      </select></Field>
      <div className="form-row">
        <Field label="每日开始小时" hint="北京时间，0–23 时。"><input type="number" name="startHour" required min={0} max={23} defaultValue={settings.startHour}/></Field>
        <Field label="每日自动调用上限" hint="日报和手记共用，1–20 次。"><input type="number" name="dailyLimit" required min={1} max={20} defaultValue={settings.dailyLimit}/></Field>
      </div>
      <Feedback operation={operation}/>
      <button className="button primary" disabled={operation.busy}>保存自动生成设置</button>
    </form>
  </section>;
}
