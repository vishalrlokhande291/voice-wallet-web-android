import React, { useState } from 'react';
import { Plus, X, Calendar, Tag, IndianRupee, Type } from 'lucide-react';

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Entertainment', 'Shopping', 'General'];

interface Props {
    onAdd: (item: string, amount: number, category: string, date: string) => Promise<any>;
}

export default function ManualAdd({ onAdd }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [form, setForm] = useState({
        item: '',
        amount: '',
        category: 'General',
        date: new Date().toISOString().split('T')[0]
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.item || !form.amount) return;

        await onAdd(form.item, parseFloat(form.amount), form.category, form.date);

        // Reset and close
        setForm({ item: '', amount: '', category: 'General', date: new Date().toISOString().split('T')[0] });
        setIsOpen(false);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="w-full py-4 rounded-[2rem] border border-dashed border-slate-700 text-slate-400 hover:text-white hover:bg-white/5 hover:border-indigo-500/50 transition-all flex items-center justify-center gap-2 font-bold uppercase tracking-widest text-sm"
            >
                <Plus className="w-5 h-5" />
                Add Expense Manually
            </button>
        );
    }

    return (
        <div className="bg-slate-800/80 backdrop-blur-md p-6 rounded-[2.5rem] border border-indigo-500/30 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                    <Plus className="w-5 h-5 text-indigo-400" />
                    New Expense
                </h3>
                <button onClick={() => setIsOpen(false)} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-full hover:bg-white/10">
                    <X size={16} />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Item Name */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-2">Item Name</label>
                    <div className="relative">
                        <Type className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="e.g., Pizza"
                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            value={form.item}
                            onChange={e => setForm(p => ({...p, item: e.target.value}))}
                        />
                    </div>
                </div>

                {/* Amount & Category Row */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-2">Amount</label>
                        <div className="relative">
                            <IndianRupee className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
                            <input
                                type="number"
                                placeholder="0.00"
                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                                value={form.amount}
                                onChange={e => setForm(p => ({...p, amount: e.target.value}))}
                            />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-2">Category</label>
                        <div className="relative">
                            <Tag className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
                            <select
                                className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer"
                                value={form.category}
                                onChange={e => setForm(p => ({...p, category: e.target.value}))}
                            >
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Date */}
                <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 pl-2">Date</label>
                    <div className="relative">
                        <Calendar className="absolute left-4 top-3.5 w-4 h-4 text-slate-500" />
                        <input
                            type="date"
                            className="w-full bg-slate-900/50 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            value={form.date}
                            onChange={e => setForm(p => ({...p, date: e.target.value}))}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-indigo-500/20 transition-all mt-2"
                >
                    Add Expense
                </button>
            </form>
        </div>
    );
}