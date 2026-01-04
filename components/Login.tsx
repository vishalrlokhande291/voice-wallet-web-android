import React, { useState } from 'react';
import { Wallet, Phone, ArrowRight } from 'lucide-react';

interface Props {
    onLogin: (phone: string) => void;
}

export default function Login({ onLogin }: Props) {
    const [input, setInput] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.length >= 10) onLogin(input);
    };

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

                <form onSubmit={handleSubmit} className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Mobile Number</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                                <Phone size={18} />
                            </div>
                            <input
                                type="tel"
                                value={input}
                                onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                placeholder="9876543210"
                                className="w-full bg-slate-800/50 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white font-bold text-lg placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                autoFocus
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={input.length < 10}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 transition-all active:scale-95 group"
                    >
                        Start Tracking
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                </form>
                <p className="text-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">Secured by AI • Scoped Data Access</p>
            </div>
        </div>
    );
}