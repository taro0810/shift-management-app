import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [requests, setRequests] = useState([])
  const [tasks, setTasks] = useState([]) 
  const [view, setView] = useState('monthly') 
  const [mode, setMode] = useState('admin')
  const [currentStaffId, setCurrentStaffId] = useState(null) 
  const [selectedDay, setSelectedDay] = useState(new Date().toISOString().split('T')[0])

  const nameRef = useRef(null)
  const roleRef = useRef(null)
  const taskRef = useRef(null)
  const newTaskRef = useRef(null) 

  const timeOptions = [];
  for (let h = 8; h <= 20; h++) {
    for (let m of ['00', '30']) {
      timeOptions.push(`${h.toString().padStart(2, '0')}:${m}`);
      if (h === 20 && m === '00') break;
    }
  }

  const now = new Date()
  const [targetYear, setTargetYear] = useState(now.getFullYear())
  const [targetMonth, setTargetMonth] = useState(now.getDate() >= 21 ? now.getMonth() + 2 : now.getMonth() + 1)

  const isDeadlinePassed = () => {
    const deadlineYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const deadlineMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const deadlineDate = new Date(deadlineYear, deadlineMonth - 1, 18, 23, 59, 59);
    return new Date() > deadlineDate;
  };

  const generateDateRange = (year, month) => {
    const dates = [];
    const startDate = new Date(year, month - 2, 21);
    const endDate = new Date(year, month - 1, 20);
    let current = new Date(startDate);
    while (current <= endDate) {
      const d = new Date(current);
      d.setHours(12, 0, 0, 0);
      dates.push(d.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };
  const dateRange = generateDateRange(targetYear, targetMonth);

  const fetchData = async () => {
    const { data: emp } = await supabase.from('employees').select('*').order('created_at')
    setEmployees(emp || [])
    const { data: shi } = await supabase.from('schedules').select('*')
      .gte('date', dateRange[0]).lte('date', dateRange[dateRange.length - 1])
    setShifts(shi || [])
    const { data: req } = await supabase.from('shift_requests').select('*')
      .gte('date', dateRange[0]).lte('date', dateRange[dateRange.length - 1])
    setRequests(req || [])
    const { data: tsk } = await supabase.from('tasks').select('*').order('created_at')
    setTasks(tsk || [])
  }

  useEffect(() => { fetchData() }, [targetYear, targetMonth, selectedDay])

  // ③のための修正：既存データがなくても「新規作成」として確実に保存する
  const handleSaveShift = async (empId, date, start, end, task) => {
    const existing = shifts.find(x => x.employee_id === empId && x.date === date);
    
    const start_val = start || existing?.start_time || '09:00';
    const end_val = end || existing?.end_time || '17:00';
    // taskが渡されたらそれを使う。渡されない（時間変更時など）は既存のtaskを維持。
    const task_val = task !== undefined ? task : (existing?.assigned_task || '');

    const { error } = await supabase.from('schedules').upsert({ 
      employee_id: empId, 
      date: date, 
      start_time: start_val, 
      end_time: end_val,
      assigned_task: task_val,
      status: 'published' 
    }, { onConflict: 'employee_id, date' });

    if (!error) await fetchData();
  }

  const handleRequestOff = async (empId, date) => {
    if (mode === 'staff' && isDeadlinePassed()) return;
    const existing = requests.find(r => r.employee_id === empId && r.date === date);
    if (existing) {
      await supabase.from('shift_requests').delete().eq('id', existing.id);
    } else {
      await supabase.from('shift_requests').insert([{ employee_id: empId, date, request_type: 'off' }]);
    }
    fetchData();
  };

  const MonthlyView = () => (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <select value={targetYear} onChange={(e) => setTargetYear(Number(e.target.value))}>
          {[2025, 2026, 2027].map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select value={targetMonth} onChange={(e) => setTargetMonth(Number(e.target.value))}>
          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}月度</option>)}
        </select>
      </div>
      <table border="1" style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%', minWidth: '1200px' }}>
        <thead>
          <tr style={{ background: '#f8f8f8' }}>
            <th style={{ position: 'sticky', left: 0, background: '#f8f8f8', padding: '10px', zIndex: 2 }}>氏名</th>
            {dateRange.map(d => {
              const dateObj = new Date(d);
              const dayStr = dateObj.toLocaleDateString('ja-JP', { weekday: 'short' });
              return (
                <th key={d} style={{ padding: '5px', minWidth: '85px', color: dayStr === '日' ? 'red' : dayStr === '土' ? 'blue' : '#333' }}>
                  {dateObj.getMonth() + 1}/{dateObj.getDate()}<br/>({dayStr})
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id}>
              <td style={{ position: 'sticky', left: 0, background: '#fff', fontWeight: 'bold', padding: '10px', zIndex: 1 }}>{emp.name}</td>
              {dateRange.map(d => {
                const s = shifts.find(x => x.employee_id === emp.id && x.date === d);
                const r = requests.find(x => x.employee_id === emp.id && x.date === d);
                return (
                  <td key={d} style={{ backgroundColor: r ? '#ffebee' : 'transparent', textAlign: 'center', padding: '2px' }}>
                    <select 
                      style={{ fontSize: '10px', width: '100%', marginBottom: '2px' }} 
                      value={s?.start_time?.substring(0,5) || 'off'} 
                      onChange={(e) => e.target.value === 'off' ? supabase.from('schedules').delete().match({ employee_id: emp.id, date: d }).then(()=>fetchData()) : handleSaveShift(emp.id, d, e.target.value, s?.end_time || '17:00')}
                    >
                      <option value="off">{r ? '休み希望' : '---'}</option>
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <select 
                      style={{ fontSize: '10px', width: '100%' }} 
                      value={s?.end_time?.substring(0,5) || '17:00'} 
                      disabled={!s}
                      onChange={(e) => handleSaveShift(emp.id, d, s?.start_time, e.target.value)}
                    >
                      {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const TaskView = () => (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ marginBottom: '15px' }}>
        <h3 style={{ margin: 0 }}>③ 勤務一覧表 (役割分担)</h3>
        <p style={{ fontSize: '12px', color: '#666' }}>役割を選択すると即座に保存されます。</p>
      </div>
      <table border="1" style={{ borderCollapse: 'collapse', fontSize: '12px', width: '100%', minWidth: '1200px' }}>
        <thead>
          <tr style={{ background: '#f8f8f8' }}>
            <th style={{ position: 'sticky', left: 0, background: '#f8f8f8', padding: '10px', zIndex: 2 }}>氏名</th>
            {dateRange.map(d => {
              const dateObj = new Date(d);
              const dayStr = dateObj.toLocaleDateString('ja-JP', { weekday: 'short' });
              return (
                <th key={d} style={{ padding: '5px', minWidth: '85px', color: dayStr === '日' ? 'red' : dayStr === '土' ? 'blue' : '#333' }}>
                  {dateObj.getMonth() + 1}/{dateObj.getDate()}({dayStr})
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id}>
              <td style={{ position: 'sticky', left: 0, background: '#fff', fontWeight: 'bold', padding: '10px', zIndex: 1 }}>{emp.name}</td>
              {dateRange.map(d => {
                const s = shifts.find(x => x.employee_id === emp.id && x.date === d);
                const r = requests.find(x => x.employee_id === emp.id && x.date === d);
                return (
                  <td key={d} style={{ backgroundColor: r ? '#ffebee' : (s ? '#fff9c4' : '#f5f5f5'), padding: '2px', textAlign:'center' }}>
                    <select 
                      style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'center', fontSize: '11px', height: '30px', cursor: 'pointer' }}
                      // 重要：DBの値をそのまま参照し、不一致を防ぐ
                      value={s?.assigned_task || ''}
                      onChange={(e) => {
                        const newTask = e.target.value;
                        // 現在のシフト時間を保持したまま役割だけを更新。シフトがなければ標準時間で作成。
                        handleSaveShift(emp.id, d, s?.start_time, s?.end_time, newTask);
                      }}
                    >
                      <option value="">-</option>
                      {tasks.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const DailyView = () => (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ padding: '8px' }} />
        <span style={{ marginLeft: '10px', fontWeight: 'bold' }}>{new Date(selectedDay).toLocaleDateString('ja-JP', { weekday: 'long' })}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table border="1" style={{ borderCollapse: 'collapse', width: '100%', minWidth: '1100px', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={{ width: '120px', padding: '10px' }}>氏名</th>
              <th style={{ width: '100px' }}>標準業務</th>
              {timeOptions.map(t => (
                <th key={t} style={{ fontSize: '9px', width: '35px' }}>{t.endsWith(':00') ? t.split(':')[0] : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => {
              const s = shifts.find(x => x.employee_id === emp.id && x.date === selectedDay);
              return (
                <tr key={emp.id}>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{emp.name}</td>
                  <td style={{ fontSize: '11px' }}>{emp.base_task}</td>
                  {timeOptions.map(t => {
                    const isWorking = s && t >= s.start_time.substring(0,5) && t < s.end_time.substring(0,5);
                    const isBreak = s?.break_times?.includes(t);
                    return (
                      <td key={t} 
                        onClick={async () => {
                          if(!isWorking) return;
                          const newBreaks = isBreak ? s.break_times.filter(x => x !== t) : [...(s.break_times||[]), t];
                          await supabase.from('schedules').update({ break_times: newBreaks }).eq('id', s.id);
                          fetchData();
                        }}
                        style={{ 
                          backgroundColor: isWorking ? (isBreak ? '#fff' : '#fff176') : '#f5f5f5',
                          height: '40px', textAlign: 'center', cursor: isWorking ? 'pointer' : 'default', fontSize: '12px', fontWeight: 'bold'
                        }}
                      >
                        {isWorking && !isBreak ? '1' : ''}
                      </td>
                    );
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const StaffView = () => {
    const me = employees.find(e => String(e.id) === String(currentStaffId));
    const closed = isDeadlinePassed();
    if (!me) return <div style={{padding: '40px', textAlign: 'center'}}>読み込み中...</div>;

    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ background: '#333', color: 'white', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: '0' }}>{me.name} 様</h2>
            {closed && <span style={{fontSize:'12px', background:'#ff4444', padding:'4px 8px', borderRadius:'4px'}}>締切済</span>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {dateRange.map(d => {
            const s = shifts.find(x => x.employee_id === me.id && x.date === d);
            const r = requests.find(x => x.employee_id === me.id && x.date === d);
            const dateObj = new Date(d);
            return (
              <div key={d} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', border: '1px solid #ddd', borderRadius: '10px', background: r ? '#fff5f5' : '#fff' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{dateObj.getMonth()+1}/{dateObj.getDate()} ({dateObj.toLocaleDateString('ja-JP', { weekday: 'short' })})</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: s ? '#007AFF' : '#555' }}>
                    {s ? `${s.start_time.substring(0,5)} 〜 ${s.end_time.substring(0,5)}` : (r ? '休み希望中' : '休み')}
                  </div>
                  {s?.assigned_task && <div style={{marginTop: '5px', color: '#d32f2f', fontWeight: 'bold', fontSize: '14px'}}>担当：{s.assigned_task}</div>}
                </div>
                {!closed && (
                  <button onClick={() => handleRequestOff(me.id, d)} style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', background: r ? '#ff4444' : '#eee', color: r ? '#fff' : '#333', fontWeight: 'bold', cursor: 'pointer' }}>
                    {r ? '取消' : '休み希望'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => { setMode('admin'); setView('monthly'); }} style={{ background: mode === 'admin' ? '#333' : '#eee', color: mode === 'admin' ? '#fff' : '#333', padding: '10px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>管理者画面</button>
          <select value={currentStaffId || ''} onChange={(e) => { setCurrentStaffId(e.target.value); setMode('staff'); }} style={{ padding: '10px', borderRadius: '8px' }}>
            <option value="">従業員ログイン</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        {mode === 'admin' && (
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={() => setView('monthly')} style={{ padding: '10px 15px', border: 'none', background: view === 'monthly' ? '#007AFF' : '#eee', color: view === 'monthly' ? '#fff' : '#333', borderRadius: '6px', cursor: 'pointer' }}>①月間(時間)</button>
            <button onClick={() => setView('task')} style={{ padding: '10px 15px', border: 'none', background: view === 'task' ? '#007AFF' : '#eee', color: view === 'task' ? '#fff' : '#333', borderRadius: '6px', cursor: 'pointer' }}>③勤務一覧(役割)</button>
            <button onClick={() => setView('daily')} style={{ padding: '10px 15px', border: 'none', background: view === 'daily' ? '#007AFF' : '#eee', color: view === 'daily' ? '#fff' : '#333', borderRadius: '6px', cursor: 'pointer' }}>②日別割当</button>
            <button onClick={() => setView('employee')} style={{ padding: '10px 15px', border: 'none', background: view === 'employee' ? '#007AFF' : '#eee', color: view === 'employee' ? '#fff' : '#333', borderRadius: '6px', cursor: 'pointer' }}>従業員管理</button>
          </div>
        )}
      </div>

      <div style={{ background: '#fff', padding: '20px', borderRadius: '15px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
        {mode === 'staff' ? <StaffView /> : (
          <>
            {view === 'monthly' && <MonthlyView />}
            {view === 'task' && <TaskView />}
            {view === 'daily' && <DailyView />}
            {view === 'employee' && (
              <div>
                <h3 style={{marginTop:0}}>従業員管理</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', background:'#f9f9f9', padding:'15px', borderRadius:'8px' }}>
                  <input ref={nameRef} placeholder="名前" style={{ padding: '10px' }} />
                  <input ref={roleRef} placeholder="役職" style={{ padding: '10px' }} />
                  <input ref={taskRef} placeholder="標準業務" style={{ padding: '10px' }} />
                  <button onClick={async () => {
                    if(!nameRef.current.value) return;
                    await supabase.from('employees').insert([{ name: nameRef.current.value, role: roleRef.current.value, base_task: taskRef.current.value }]);
                    fetchData();
                    nameRef.current.value=""; roleRef.current.value=""; taskRef.current.value="";
                  }} style={{ padding: '10px 20px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>追加</button>
                </div>

                <h3>役割（タスク）マスター管理</h3>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', background:'#f9f9f9', padding:'15px', borderRadius:'8px' }}>
                  <input ref={newTaskRef} placeholder="新しい役割名 (例: レジ)" style={{ padding: '10px' }} />
                  <button onClick={async () => {
                    if(!newTaskRef.current.value) return;
                    await supabase.from('tasks').insert([{ name: newTaskRef.current.value }]);
                    fetchData();
                    newTaskRef.current.value="";
                  }} style={{ padding: '10px 20px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>役割を追加</button>
                </div>
                <div style={{display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'30px'}}>
                  {tasks.map(t => (
                    <div key={t.id} style={{background:'#eee', padding:'5px 10px', borderRadius:'20px', display:'flex', alignItems:'center', gap:'8px'}}>
                      {t.name}
                      <span onClick={async () => { if(confirm("削除しますか？")) { await supabase.from('tasks').delete().eq('id', t.id); fetchData(); } }} style={{color:'red', cursor:'pointer', fontWeight:'bold'}}>×</span>
                    </div>
                  ))}
                </div>

                <h3>登録済み従業員一覧</h3>
                <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr style={{background:'#eee'}}><th style={{padding:'10px'}}>名前</th><th>役職</th><th>標準業務</th><th>操作</th></tr></thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id} style={{textAlign:'center'}}><td style={{padding:'10px'}}>{emp.name}</td><td>{emp.role}</td><td>{emp.base_task}</td><td><button onClick={async() => {if(confirm("削除しますか？")){await supabase.from('employees').delete().eq('id', emp.id); fetchData();}}} style={{color:'red', cursor:'pointer', border:'none', background:'none'}}>削除</button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default App