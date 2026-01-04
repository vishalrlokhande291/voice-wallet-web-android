
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleGenAI, Modality, Type, LiveServerMessage } from '@google/genai';
// Update the import line at the top
import {
  Mic, MicOff, Trash2, TrendingUp, Wallet, List,
  PieChart, Activity, AlertCircle, X, Edit3,
  RefreshCcw, ChevronRight, BarChart3, Database,
  WifiOff, CloudCheck, Calendar, LogOut, Phone, ArrowRight,
  Filter, CalendarDays, Check // <--- Add Check here
} from 'lucide-react';
import { Expense, CategoryTotal } from './types';
import { createBlob, decode, decodeAudioData } from './utils/audio';

// Change this to your Spring Boot Server URL
const API_BASE_URL = 'http://localhost:8081/api';

const CATEGORY_COLORS: Record<string, string> = {
  Food: 'bg-orange-100 text-orange-600',
  Groceries: 'bg-green-100 text-green-600',
  Transport: 'bg-blue-100 text-blue-600',
  Entertainment: 'bg-purple-100 text-purple-600',
  Shopping: 'bg-pink-100 text-pink-600',
  General: 'bg-slate-100 text-slate-600',
};

type FilterCriteria = {
  period: 'today' | 'week' | 'month' | 'year' | 'all';
  month?: number; // 1-12
  year?: number;
};

export default function App() {
  const [userPhone, setUserPhone] = useState<string | null>(localStorage.getItem('wallet_user_phone'));
  const [editForm, setEditForm] = useState<{ item: string; amount: string }>({ item: '', amount: '' });
  const [loginInput, setLoginInput] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filter, setFilter] = useState<FilterCriteria>({ period: 'all' });
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening'>('idle');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'local'>('local');
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const audioContextRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const systemInstruction = useMemo(() => `You are "Wallet Whisperer", a professional voice-first finance assistant.
- User Context: Currently assisting user with phone ending in ${userPhone?.slice(-4)}.
- Log expenses: Use 'log_expense(item, amount, category, date)'.
- Date Support: If the user mentions relative dates like "yesterday", "last Friday", or specific dates like "January 5th", calculate the EXACT YYYY-MM-DD date based on today.
- Edit expenses: Use 'edit_expense(search_term, new_amount, new_item, new_category)'.
- Summaries: Use 'get_summary(period, month, year)'.
    - If user asks for "today's summary", use period="today".
    - If user asks for "this week" or "weekly summary", use period="week".
    - If user asks for "monthly summary" or "January summary", use period="month". Provide month (1-12) and year if specified.
    - If user asks for "yearly summary" or "summary of 2024", use period="year" and provide the year.
- End Session: If the user says "Bye", "That's all", or "Stop", call 'close_session()'.
- Respond briefly and confirm the date or period you are summarizing.
- Current Date/Time: ${new Date().toLocaleString()} (${new Date().toDateString()})`, [userPhone]);

  const loadLocalData = useCallback(() => {
    if (!userPhone) return;
    const saved = localStorage.getItem(`expenses_v2_${userPhone}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.sort((a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(parsed);
    } else {
      setExpenses([]);
    }
  }, [userPhone]);

  const startEditing = (exp: Expense) => {
    setEditingId(exp.id);
    setEditForm({ item: exp.item, amount: exp.amount.toString() });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({ item: '', amount: '' });
  };

  const saveEditing = async (id: string) => {
    const newAmount = parseFloat(editForm.amount);
    if (!editForm.item || isNaN(newAmount)) return; // Basic validation

    await updateExpense(id, {
      item: editForm.item,
      amount: newAmount
    });
    setEditingId(null);
  };

  const fetchExpenses = useCallback(async () => {
    if (!userPhone) return;
    setIsLoading(true);
    setSyncStatus('syncing');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${API_BASE_URL}/expenses`, { 
        signal: controller.signal,
        headers: { 'X-User-Phone': userPhone }
      });
      
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Backend error');
      
      const data = await res.json();
      data.sort((a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(data);
      setSyncStatus('synced');
      setError(null);
    } catch (err) {
      setSyncStatus('local');
      loadLocalData();
    } finally {
      setIsLoading(false);
    }
  }, [userPhone, loadLocalData]);

  useEffect(() => {
    if (userPhone) {
      fetchExpenses();
    }
  }, [userPhone, fetchExpenses]);

  useEffect(() => {
    if (userPhone && (expenses.length > 0 || syncStatus === 'local')) {
      localStorage.setItem(`expenses_v2_${userPhone}`, JSON.stringify(expenses));
    }
  }, [expenses, syncStatus, userPhone]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginInput.length >= 10) {
      localStorage.setItem('wallet_user_phone', loginInput);
      setUserPhone(loginInput);
    }
  };

  const handleLogout = () => {
    stopSession();
    localStorage.removeItem('wallet_user_phone');
    setUserPhone(null);
    setExpenses([]);
    setLoginInput('');
    setFilter({ period: 'all' });
  };

  const addExpense = useCallback(async (item: string, amount: number, category: string, date?: string) => {
    if (!userPhone) return { error: "User not logged in" };
    let expenseDate: Date;
    if (date) {
      expenseDate = new Date(date + 'T12:00:00');
      if (isNaN(expenseDate.getTime())) expenseDate = new Date();
    } else {
      expenseDate = new Date();
    }

    const newExp = { 
      id: crypto.randomUUID(), 
      item, 
      amount, 
      category: category || 'General', 
      date: expenseDate.toISOString(), 
      currency: 'INR' 
    };
    
    setExpenses(prev => {
      const updated = [newExp, ...prev];
      return updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    if (syncStatus !== 'local') {
      try {
        const res = await fetch(`${API_BASE_URL}/expenses`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-User-Phone': userPhone
          },
          body: JSON.stringify(newExp)
        });
        if (res.ok) setSyncStatus('synced');
        else throw new Error();
      } catch (err) {
        setSyncStatus('local');
      }
    }
    
    const friendlyDate = expenseDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    return { success: true, message: `Logged ${item} for ₹${amount} on ${friendlyDate}.` };
  }, [syncStatus, userPhone]);

  const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    if (!userPhone) return { error: "User not logged in" };
    setExpenses(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, ...updates } : e);
      return updated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    });

    if (syncStatus !== 'local') {
      try {
        const res = await fetch(`${API_BASE_URL}/expenses/${id}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'X-User-Phone': userPhone
          },
          body: JSON.stringify(updates)
        });
        if (res.ok) setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('local');
      }
    }
    return { success: true };
  }, [syncStatus, userPhone]);

  const voiceEditExpense = useCallback(async (searchTerm: string, amount?: number, item?: string, category?: string) => {
    const expense = expenses.find(e => e.item.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!expense) return { error: `I couldn't find an entry for "${searchTerm}" to edit.` };
    
    const updates: any = {};
    if (amount) updates.amount = amount;
    if (item) updates.item = item;
    if (category) updates.category = category;
    
    return await updateExpense(expense.id, updates);
  }, [expenses, updateExpense]);

  const deleteExpense = async (id: string) => {
    if (!userPhone) return;
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (syncStatus !== 'local') {
      try {
        await fetch(`${API_BASE_URL}/expenses/${id}`, { 
          method: 'DELETE',
          headers: { 'X-User-Phone': userPhone }
        });
        setSyncStatus('synced');
      } catch (err) {
        setSyncStatus('local');
      }
    }
  };

  const getFilteredExpenses = useCallback((criteria: FilterCriteria) => {
    const now = new Date();
    return expenses.filter(e => {
      const eDate = new Date(e.date);
      if (criteria.period === 'today') {
        return eDate.toDateString() === now.toDateString();
      }
      if (criteria.period === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // Monday
        startOfWeek.setHours(0,0,0,0);
        return eDate >= startOfWeek;
      }
      if (criteria.period === 'month') {
        const targetMonth = criteria.month !== undefined ? criteria.month - 1 : now.getMonth();
        const targetYear = criteria.year || now.getFullYear();
        return eDate.getMonth() === targetMonth && eDate.getFullYear() === targetYear;
      }
      if (criteria.period === 'year') {
        const targetYear = criteria.year || now.getFullYear();
        return eDate.getFullYear() === targetYear;
      }
      return true;
    });
  }, [expenses]);

  const getCategoryBreakdown = useCallback((criteria: FilterCriteria) => {
    const filtered = getFilteredExpenses(criteria);
    const total = filtered.reduce((sum, e) => sum + e.amount, 0);
    const mapping: Record<string, number> = {};
    filtered.forEach(e => {
      mapping[e.category] = (mapping[e.category] || 0) + e.amount;
    });

    const breakdown: CategoryTotal[] = Object.entries(mapping).map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      percentage: total > 0 ? (amt / total) * 100 : 0
    })).sort((a, b) => b.amount - a.amount);

    return { total, breakdown, count: filtered.length, period: criteria.period };
  }, [getFilteredExpenses]);

  const handleVoiceSummary = useCallback((period: string, month?: number, year?: number) => {
    const criteria: FilterCriteria = { period: period as any, month, year };
    setFilter(criteria);
    return getCategoryBreakdown(criteria);
  }, [getCategoryBreakdown]);

  // Replace your existing stopSession function with this:
  // In App.tsx, replace the existing stopSession with this:

  const stopSession = useCallback(() => {
    // 1. STOP THE AUDIO PROCESSOR FIRST
    // This prevents the "onaudioprocess" event from firing again
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // 2. Stop the mic
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }

    // 3. Close the socket
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(s => {
        // safe close
        try { s.close(); } catch(e) {}
      });
      sessionPromiseRef.current = null;
    }

    // 4. Cleanup playback
    activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setStatus('idle');
  }, []);

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
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setStatus('listening');
            const source = audioContextRef.current!.input.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.input.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            // Inside startSession...
            scriptProcessor.onaudioprocess = (event) => {
              // GUARD CLAUSE: If processor is null (stopped), do not proceed
              if (!processorRef.current) return;

              const inputData = event.inputBuffer.getChannelData(0);

              sessionPromise.then(s => {
                // DOUBLE CHECK: If we stopped while the promise was resolving
                if (!processorRef.current) return;

                // Catch errors so they don't spam the console
                s.sendRealtimeInput({ media: createBlob(inputData) });
              }).catch(e => {
                // Ignore socket closed errors
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.input.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              const ctx = audioContextRef.current!.output;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => activeSourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.toolCall) {
              for (const fc of message.toolCall.functionCalls) {
                let result: any = { status: 'ok' };
                if (fc.name === 'log_expense') result = await addExpense(fc.args.item as string, fc.args.amount as number, fc.args.category as string, fc.args.date as string);
                else if (fc.name === 'edit_expense') result = await voiceEditExpense(fc.args.search_term as string, fc.args.new_amount as number, fc.args.new_item as string, fc.args.new_category as string);
                else if (fc.name === 'get_summary') result = handleVoiceSummary(fc.args.period as string, fc.args.month as number, fc.args.year as number);
                else if (fc.name === 'close_session') { stopSession(); continue; }
                
                sessionPromise.then(s => s.sendToolResponse({
                  functionResponses: { id: fc.id, name: fc.name, response: result }
                }));
              }
            }
          },
          onerror: (e) => { setError("Connection lost."); stopSession(); },
          onclose: () => { setStatus('idle'); }
        },
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
                    date: { type: Type.STRING, description: 'ISO 8601 date string (e.g., 2025-05-20)' }
                  }, 
                  required: ['item', 'amount'] 
                } 
              },
              { name: 'edit_expense', parameters: { type: Type.OBJECT, properties: { search_term: { type: Type.STRING }, new_item: { type: Type.STRING }, new_amount: { type: Type.NUMBER }, new_category: { type: Type.STRING } }, required: ['search_term'] } },
              { 
                name: 'get_summary', 
                parameters: { 
                  type: Type.OBJECT, 
                  properties: { 
                    period: { type: Type.STRING, enum: ['today', 'week', 'month', 'year', 'all'] },
                    month: { type: Type.NUMBER, description: '1-12' },
                    year: { type: Type.NUMBER }
                  }, 
                  required: ['period'] 
                } 
              },
              { name: 'close_session', description: 'Ends the current voice session.' }
            ]
          }]
        }
      });
      sessionPromiseRef.current = sessionPromise;
    } catch (err: any) { setError(err.message || 'Mic access denied'); setStatus('idle'); }
  };

  const currentDisplayExpenses = useMemo(() => getFilteredExpenses(filter), [getFilteredExpenses, filter]);
  const totalSpent = useMemo(() => currentDisplayExpenses.reduce((s, e) => s + e.amount, 0), [currentDisplayExpenses]);
  const breakdown = useMemo(() => getCategoryBreakdown(filter).breakdown, [filter, getCategoryBreakdown]);

  const filterLabel = useMemo(() => {
    if (filter.period === 'all') return 'All Time';
    if (filter.period === 'today') return 'Today';
    if (filter.period === 'week') return 'This Week';
    if (filter.period === 'month') {
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return `${monthNames[(filter.month || new Date().getMonth() + 1) - 1]} ${filter.year || new Date().getFullYear()}`;
    }
    if (filter.period === 'year') return `Year ${filter.year || new Date().getFullYear()}`;
    return 'Filtered';
  }, [filter]);

  // --- Login UI ---
  if (!userPhone) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="text-center space-y-4">
            <div className="inline-flex p-4 bg-indigo-600 rounded-3xl shadow-2xl shadow-indigo-900/40 border border-white/10">
              <Wallet className="w-12 h-12 text-white" />
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-black text-white tracking-tight">VoiceWallet AI</h1>
              <p className="text-slate-400 font-medium">Enter your mobile to continue</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Mobile Number</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                  <Phone size={18} />
                </div>
                <input 
                  type="tel" 
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white font-bold text-lg placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                  autoFocus
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loginInput.length < 10}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 transition-all active:scale-95 group"
            >
              Start Tracking
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <p className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">
            Secured by AI • Scoped Data Access
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-[#f8fafc] p-4 md:p-10 font-sans selection:bg-indigo-500/30">
      <div className="max-w-5xl mx-auto space-y-8">
        
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
                  syncStatus === 'syncing' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse' : 
                  'bg-slate-700/50 border-slate-600 text-slate-400'
                }`}>
                  {syncStatus === 'synced' ? <CloudCheck className="w-3 h-3" /> : syncStatus === 'syncing' ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <WifiOff className="w-3 h-3" />}
                  <span>{syncStatus === 'synced' ? 'Spring Boot Connected' : syncStatus === 'syncing' ? 'Syncing...' : 'Local Mode'}</span>
                </div>
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest opacity-50">+91 {userPhone}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={handleLogout} className="p-2.5 text-slate-500 hover:text-rose-400 transition-all bg-slate-800/50 hover:bg-rose-400/10 rounded-xl border border-white/5" title="Logout">
              <LogOut className="w-5 h-5" />
            </button>
            <button onClick={fetchExpenses} disabled={syncStatus === 'syncing'} className="p-2.5 text-slate-400 hover:text-white transition-all bg-slate-800/50 hover:bg-slate-800 rounded-xl disabled:opacity-50 ring-1 ring-white/5">
              <RefreshCcw className={`w-5 h-5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
            <div className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border ring-1 ring-white/5 ${
              status === 'listening' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-800/50 border-slate-700 text-slate-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${status === 'listening' ? 'bg-rose-500 animate-pulse' : 'bg-slate-500'}`} />
              {status}
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[2.5rem] shadow-sm border border-white/5 flex flex-col items-center text-center space-y-6">
              <div className="relative">
                <div className={`absolute -inset-4 rounded-full blur-2xl transition-all duration-500 ${status === 'listening' ? 'bg-indigo-500/20' : 'bg-transparent'}`} />
                <button
                  onClick={status === 'listening' ? stopSession : startSession}
                  className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-2xl active:scale-95 group ${
                    status === 'listening' ? 'bg-rose-600 text-white shadow-rose-900/40' : 'bg-indigo-600 text-white shadow-indigo-900/40 hover:bg-indigo-500'
                  }`}
                >
                  {status === 'listening' ? <MicOff size={32} /> : <Mic size={32} />}
                </button>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold tracking-tight">{status === 'listening' ? "I'm listening..." : "Voice Actions"}</h3>
                <p className="text-slate-400 text-sm leading-relaxed px-2 font-medium">
                  "Show today's summary"<br/>
                  "Summary for January 2024"<br/>
                  "What did I spend this week?"
                </p>
              </div>
            </div>

            <div className="bg-slate-900/40 backdrop-blur-xl p-6 rounded-[2.5rem] border border-white/5 space-y-6">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-slate-200">Insights</h3>
                </div>
                <div className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded text-[9px] font-black uppercase text-indigo-400 tracking-wider">
                  {filterLabel}
                </div>
              </div>
              <div className="space-y-5">
                {breakdown.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-4 italic">No matching records</p>
                ) : breakdown.map(cat => (
                  <div key={cat.category} className="space-y-2">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <span>{cat.category}</span>
                      <span className="text-slate-200">₹{cat.amount.toLocaleString()}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden ring-1 ring-white/5">
                      <div className="h-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.4)] transition-all duration-1000" style={{ width: `${cat.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="bg-indigo-600/90 backdrop-blur-md p-10 rounded-[3rem] shadow-2xl shadow-indigo-900/20 text-white flex flex-col justify-center overflow-hidden relative ring-1 ring-white/10">
              <div className="absolute top-0 right-0 p-6 opacity-20 rotate-12">
                <TrendingUp className="w-32 h-32" />
              </div>
              <div className="relative z-10 space-y-1">
                <p className="text-indigo-100/70 text-xs font-bold uppercase tracking-[0.2em] mb-1">
                   {filterLabel} Expenditure
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold opacity-70">₹</span>
                  <h2 className="text-6xl font-black tracking-tighter tabular-nums">{totalSpent.toLocaleString()}</h2>
                </div>
              </div>
              
              {filter.period !== 'all' && (
                <button 
                  onClick={() => setFilter({ period: 'all' })}
                  className="mt-4 self-start flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-black uppercase tracking-wider transition-all backdrop-blur-sm border border-white/5"
                >
                  <X size={12} />
                  Clear Filter
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-slate-500" />
                  <h3 className="text-lg font-bold text-slate-200">
                    {filter.period === 'all' ? 'Recent Activity' : `${filterLabel} Transactions`}
                  </h3>
                </div>
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{currentDisplayExpenses.length} Records</span>
              </div>

              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 rounded-[2.5rem] border border-white/5">
                  <RefreshCcw className="w-10 h-10 text-slate-700 animate-spin mb-4" />
                  <p className="text-slate-500 font-bold text-sm tracking-widest uppercase">Syncing Data...</p>
                </div>
              ) : currentDisplayExpenses.length === 0 ? (
                <div className="bg-slate-900/20 p-20 rounded-[2.5rem] text-center border border-dashed border-slate-700/50">
                  <Filter className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-500 font-bold tracking-wide uppercase text-sm">No transactions found for this period.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentDisplayExpenses.map(exp => (
                      <div key={exp.id} className={`group bg-slate-900/40 backdrop-blur-sm p-5 rounded-[2.25rem] border transition-all duration-300 ${editingId === exp.id ? 'border-indigo-500 bg-slate-800/80' : 'border-white/5 hover:bg-slate-800/60 hover:border-indigo-500/30'} flex items-center justify-between`}>

                        {/* LEFT SIDE: Icon and Name/Date */}
                        <div className="flex items-center gap-5 flex-1">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg ${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.General}`}>
                            {exp.item[0].toUpperCase()}
                          </div>

                          <div className="space-y-0.5 w-full">
                            {editingId === exp.id ? (
                                /* EDIT MODE: Item Name Input */
                                <div className="flex flex-col gap-1">
                                  <input
                                      autoFocus
                                      className="font-bold text-white bg-white/5 border-b-2 border-indigo-500 outline-none w-full max-w-[200px] text-lg px-2 py-1 rounded-t"
                                      value={editForm.item}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, item: e.target.value }))}
                                      placeholder="Item name"
                                  />
                                </div>
                            ) : (
                                /* VIEW MODE: Item Name */
                                <h4 className="font-bold text-slate-100 text-lg group-hover:text-white transition-colors">{exp.item}</h4>
                            )}

                            <div className="flex items-center gap-3 text-[11px] font-bold tracking-wide">
                              <span className={`px-2.5 py-0.5 rounded-full border border-black/5 ${CATEGORY_COLORS[exp.category] || CATEGORY_COLORS.General}`}>{exp.category}</span>
                              <div className="flex items-center gap-1.5 text-slate-500">
                                <Calendar className="w-3 h-3" />
                                <span>{new Date(exp.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT SIDE: Amount and Buttons */}
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            {editingId === exp.id ? (
                                /* EDIT MODE: Amount Input */
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-xl font-bold text-slate-400">₹</span>
                                  <input
                                      type="number"
                                      className="font-black text-white bg-white/5 border-b-2 border-indigo-500 outline-none w-24 text-2xl text-right px-2 py-1 rounded-t"
                                      value={editForm.amount}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                                      onKeyDown={(e) => e.key === 'Enter' && saveEditing(exp.id)}
                                  />
                                </div>
                            ) : (
                                /* VIEW MODE: Amount */
                                <span className="text-2xl font-black text-white tracking-tighter tabular-nums">₹{exp.amount.toLocaleString()}</span>
                            )}
                          </div>

                          <div className="flex gap-1">
                            {editingId === exp.id ? (
                                /* EDIT MODE BUTTONS: Save and Cancel */
                                <>
                                  <button
                                      onClick={() => saveEditing(exp.id)}
                                      className="p-2.5 text-emerald-400 hover:text-white hover:bg-emerald-500 bg-emerald-500/10 rounded-xl transition-all"
                                      title="Save Changes"
                                  >
                                    <Check size={18} />
                                  </button>
                                  <button
                                      onClick={cancelEditing}
                                      className="p-2.5 text-rose-400 hover:text-white hover:bg-rose-500 bg-rose-500/10 rounded-xl transition-all"
                                      title="Cancel"
                                  >
                                    <X size={18} />
                                  </button>
                                </>
                            ) : (
                                /* VIEW MODE BUTTONS: Edit and Delete */
                                <>
                                  <button
                                      onClick={() => startEditing(exp)}
                                      className="p-2.5 text-slate-600 hover:text-indigo-400 transition-colors bg-white/5 rounded-xl hover:bg-indigo-400/10"
                                  >
                                    <Edit3 size={18} />
                                  </button>
                                  <button
                                      onClick={() => deleteExpense(exp.id)}
                                      className="p-2.5 text-slate-600 hover:text-rose-400 transition-colors bg-white/5 rounded-xl hover:bg-rose-400/10"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </>
                            )}
                          </div>
                        </div>
                      </div>
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
