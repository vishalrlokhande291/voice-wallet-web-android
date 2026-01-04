import React, { useState, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
import {
  Mic, MicOff, TrendingUp, Wallet, BarChart3,
  WifiOff, CloudCheck, RefreshCcw, LogOut, X, CalendarDays, Filter
} from 'lucide-react';

import { useExpenses } from './hooks/useExpenses';
import ManualAdd from './components/ManualAdd';
import ExpenseItem from './components/ExpenseItem';
import Login from './components/Login';
import { FilterCriteria } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audio';

export default function App() {
  const [userPhone, setUserPhone] = useState<string | null>(localStorage.getItem('wallet_user_phone'));
  const [filter, setFilter] = useState<FilterCriteria>({ period: 'all' });
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Use the Custom Hook
  const { expenses, syncStatus, isLoading, fetchExpenses, addExpense, updateExpense, deleteExpense } = useExpenses(userPhone);

  // --- Audio / Gemini Refs ---
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // --- Filtering Logic ---
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    return expenses.filter(e => {
      const eDate = new Date(e.date);
      if (filter.period === 'today') return eDate.toDateString() === now.toDateString();
      if (filter.period === 'week') {
        const start = new Date(now); start.setDate(now.getDate() - now.getDay() + 1); start.setHours(0,0,0,0);
        return eDate >= start;
      }
      if (filter.period === 'month') return eDate.getMonth() === (filter.month ? filter.month - 1 : now.getMonth());
      if (filter.period === 'year') return eDate.getFullYear() === (filter.year || now.getFullYear());
      return true;
    });
  }, [expenses, filter]);

  const totalSpent = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);

  const breakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => map[e.category] = (map[e.category] || 0) + e.amount);
    return Object.entries(map).map(([c, a]) => ({ category: c, amount: a, percentage: (a/totalSpent)*100 })).sort((a,b) => b.amount - a.amount);
  }, [filteredExpenses, totalSpent]);

  const filterLabel = useMemo(() => {
    if (filter.period === 'all') return 'All Time';
    if (filter.period === 'today') return 'Today';
    if (filter.period === 'week') return 'This Week';
    if (filter.period === 'month') return `Month ${filter.month || ''}`;
    return 'Filtered';
  }, [filter]);

  // --- Gemini Voice Logic (Start/Stop) ---
  const systemInstruction = useMemo(() => `You are "Wallet Whisperer"... (User: ${userPhone?.slice(-4)})`, [userPhone]);

  const stopSession = useCallback(() => {
    // 1. IMMEDIATE KILL SWITCH
    // Setting this to null stops the 'onaudioprocess' loop instantly
    const processor = processorRef.current;
    if (processor) {
      processor.onaudioprocess = null; // Crucial to stop the loop
      processor.disconnect();
      processorRef.current = null;
    }

    // 2. Stop Mic
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    // 3. Close Socket
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => {
        try { s.close(); } catch(e) {}
      });
      sessionPromiseRef.current = null;
    }

    // 4. Cleanup Audio
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setStatus('idle');
  }, []);

  const handleVoiceSummary = useCallback((period: string, month?: number, year?: number) => {
    const criteria: FilterCriteria = { period: period as any, month, year };
    setFilter(criteria);
    return { status: 'ok', message: `Filtered by ${period}` };
  }, []);

  const voiceEditExpense = useCallback(async (term: string, amt?: number, item?: string, cat?: string) => {
    const exp = expenses.find(e => e.item.toLowerCase().includes(term.toLowerCase()));
    if (!exp) return { error: "Expense not found" };
    const updates: any = {};
    if (amt) updates.amount = amt;
    if (item) updates.item = item;
    if (cat) updates.category = cat;
    return await updateExpense(exp.id, updates);
  }, [expenses, updateExpense]);

  const startSession = async () => {
    try {
      setError(null);
      setStatus('connecting');
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

      if (!audioContextRef.current) {
        audioContextRef.current = {
          input: new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 }),
          output: new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 })
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.0-flash-exp', // Ensure you use this specific model for Live API
        config: {
          systemInstruction: systemInstruction,
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
          tools: [{
            functionDeclarations: [
              {
                name: 'log_expense',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    amount: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                    date: { type: Type.STRING }
                  },
                  required: ['item', 'amount']
                }
              },
              { name: 'edit_expense', parameters: { type: Type.OBJECT, properties: { search_term: { type: Type.STRING }, new_item: { type: Type.STRING }, new_amount: { type: Type.NUMBER }, new_category: { type: Type.STRING } }, required: ['search_term'] } },
              { name: 'get_summary', parameters: { type: Type.OBJECT, properties: { period: { type: Type.STRING, enum: ['today', 'week', 'month', 'year', 'all'] }, month: { type: Type.NUMBER }, year: { type: Type.NUMBER } }, required: ['period'] } },
              { name: 'close_session', description: 'Ends session' }
            ]
          }]
        },
        callbacks: {
          onopen: () => {
            setStatus('listening');
            const source = audioContextRef.current!.input.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.input.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (event) => {
              if (!processorRef.current) return;
              const inputData = event.inputBuffer.getChannelData(0);

              sessionPromise.then(s => {
                if (!processorRef.current) return;

                // --- FIX: Wrapped in try/catch to silence "Closed" errors ---
                try {
                  s.sendRealtimeInput({ media: createBlob(inputData) });
                } catch (e) {
                  // Silently ignore socket closed errors to prevent console spam
                }
              }).catch(() => {
                // Ignore promise rejection if session was closed
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.input.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              const ctx = audioContextRef.current!.output;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => activeSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              activeSourcesRef.current.add(source);
            }

            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                let result: any = { status: 'ok' };
                if (fc.name === 'log_expense') result = await addExpense(fc.args.item as string, fc.args.amount as number, fc.args.category as string, fc.args.date as string);
                else if (fc.name === 'edit_expense') result = await voiceEditExpense(fc.args.search_term as string, fc.args.new_amount as number, fc.args.new_item as string, fc.args.new_category as string);
                else if (fc.name === 'get_summary') result = handleVoiceSummary(fc.args.period as string, fc.args.month as number, fc.args.year as number);
                else if (fc.name === 'close_session') { stopSession(); continue; }

                sessionPromise.then(s => {
                  try {
                    s.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: result } });
                  } catch(e) { /* ignore closed socket */ }
                });
              }
            }
          },
          onerror: (e) => {
            console.log("Session Error:", e);
            setStatus('idle');
            stopSession();
          },
          onclose: () => {
            setStatus('idle');
            stopSession();
          }
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) {
      setError(err.message);
      setStatus('idle');
    }
  };

  const handleLogout = () => { stopSession(); localStorage.removeItem('wallet_user_phone'); setUserPhone(null); };
  const handleLogin = (phone: string) => { localStorage.setItem('wallet_user_phone', phone); setUserPhone(phone); };

  if (!userPhone) return <Login onLogin={handleLogin} />;

  return (
      <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] p-4 md:p-10 font-sans">
        <div className="max-w-5xl mx-auto space-y-8">

          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-indigo-600 rounded-[1.25rem] shadow-2xl shadow-indigo-500/20 ring-1 ring-white/10">
                <Wallet className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-white leading-tight">VoiceWallet AI</h1>
                <div className="flex items-center gap-3 mt-1">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      syncStatus === 'synced' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                          syncStatus === 'syncing' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse' : 'bg-slate-700/50 border-slate-600 text-slate-400'}`}>
                    {syncStatus === 'synced' ? <CloudCheck className="w-3 h-3" /> : syncStatus === 'syncing' ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
                    <span>{syncStatus === 'synced' ? 'Connected' : syncStatus === 'syncing' ? 'Syncing' : 'Local'}</span>
                  </div>
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest opacity-50">+91 {userPhone}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleLogout} className="p-2.5 text-slate-500 hover:text-rose-400 bg-slate-800/50 hover:bg-rose-400/10 rounded-xl border border-white/5"><LogOut className="w-5 h-5" /></button>
              <button onClick={fetchExpenses} className="p-2.5 text-slate-400 hover:text-white bg-slate-800/50 rounded-xl"><RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} /></button>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
              {/* Mic Control */}
              <div className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 flex flex-col items-center text-center space-y-6">
                <div className="relative">
                  <div className={`absolute -inset-4 rounded-full blur-2xl transition-all ${status === 'listening' ? 'bg-indigo-500/20' : 'bg-transparent'}`} />
                  <button onClick={status === 'listening' ? stopSession : startSession} className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-95 ${status === 'listening' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
                    {status === 'listening' ? <MicOff size={32} /> : <Mic size={32} />}
                  </button>
                </div>
                <div><h3 className="text-xl font-bold">{status === 'listening' ? "I'm listening..." : "Voice Actions"}</h3></div>
              </div>

              {/* Insights */}
              <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/5 space-y-6">
                <div className="flex justify-between border-b border-white/5 pb-4"><div className="flex gap-2"><BarChart3 className="w-5 h-5 text-indigo-400" /><h3 className="font-bold text-slate-200">Insights</h3></div></div>
                <div className="space-y-5">
                  {breakdown.length === 0 ? <p className="text-center text-slate-500 text-sm">No data</p> : breakdown.map(cat => (
                      <div key={cat.category} className="space-y-2">
                        <div className="flex justify-between text-[11px] font-bold uppercase text-slate-400"><span>{cat.category}</span><span className="text-slate-200">₹{cat.amount.toLocaleString()}</span></div>
                        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${cat.percentage}%` }} /></div>
                      </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 space-y-6">
              <div className="bg-indigo-600/90 backdrop-blur-md p-10 rounded-[3rem] shadow-2xl text-white relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-20 rotate-12"><TrendingUp className="w-32 h-32" /></div>
                <p className="text-indigo-100/70 text-xs font-bold uppercase tracking-[0.2em] mb-1">{filterLabel} Expenditure</p>
                <h2 className="text-6xl font-black tracking-tighter">₹{totalSpent.toLocaleString()}</h2>
                {filter.period !== 'all' && <button onClick={() => setFilter({ period: 'all' })} className="mt-4 flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full text-[10px] font-black uppercase"><X size={12} /> Clear Filter</button>}
              </div>

              <div className="space-y-4">
                <div className="flex justify-between px-2"><div className="flex gap-2"><CalendarDays className="w-5 h-5 text-slate-500" /><h3 className="text-lg font-bold text-slate-200">Activity</h3></div></div>
                <ManualAdd onAdd={addExpense} />

                {filteredExpenses.length === 0 ? (
                    <div className="bg-slate-900/20 p-20 rounded-[2.5rem] text-center border border-dashed border-slate-700/50"><Filter className="w-12 h-12 text-slate-700 mx-auto mb-4" /><p className="text-slate-500 font-bold uppercase text-sm">No transactions</p></div>
                ) : (
                    <div className="space-y-3">
                      {filteredExpenses.map(exp => (
                          <ExpenseItem key={exp.id} expense={exp} onUpdate={updateExpense} onDelete={deleteExpense} />
                      ))}
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

  );
}