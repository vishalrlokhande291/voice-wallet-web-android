import React, { useState } from 'react';
import { Calendar, Trash2, Edit3, Check, X, Tag } from 'lucide-react';
import { Expense } from '../types';

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Entertainment', 'Shopping', 'General'];

const CATEGORY_COLORS: Record<string, string> = {
    Food: 'bg-orange-100 text-orange-600',
    Groceries: 'bg-green-100 text-green-600',
    Transport: 'bg-blue-100 text-blue-600',
    Entertainment: 'bg-purple-100 text-purple-600',
    Shopping: 'bg-pink-100 text-pink-600',
    General: 'bg-slate-100 text-slate-600',
};

interface Props {
    expense: Expense;
    onUpdate: (id: string, updates: Partial<Expense>) => void;
    onDelete: (id: string) => void;
}

export default function ExpenseItem({ expense, onUpdate, onDelete }: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        item: expense.item,
        amount: expense.amount.toString(),
        category: expense.category,
        date: expense.date.split('T')[0] // Format ISO to YYYY-MM-DD for input
    });

    const handleSave = () => {
        const amt = parseFloat(editForm.amount);
        if (!editForm.item || isNaN(amt)) return;

        // Construct new ISO date preserving time if possible, or defaulting to noon
        const newDate = new Date(editForm.date + 'T12:00:00').toISOString();

        onUpdate(expense.id, {
            item: editForm.item,
            amount: amt,
            category: editForm.category,
            date: newDate
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditForm({
            item: expense.item,
            amount: expense.amount.toString(),
            category: expense.category,
            date: expense.date.split('T')[0]
        });
        setIsEditing(false);
    };

    return (
        <div className={`group bg-slate-900/40 backdrop-blur-sm p-5 rounded-[2.25rem] border transition-all duration-300 ${isEditing ? 'border-indigo-500 bg-slate-800/80' : 'border-white/5 hover:bg-slate-800/60 hover:border-indigo-500/30'} flex flex-col gap-4`}>

            {/* TOP ROW: Content */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-5 flex-1">
                    {/* Category Icon */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black shadow-lg ${CATEGORY_COLORS[editForm.category] || CATEGORY_COLORS.General}`}>
                        {editForm.item[0]?.toUpperCase() || '?'}
                    </div>

                    <div className="space-y-1 w-full">
                        {isEditing ? (
                            /* EDIT MODE: Inputs */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                                <input
                                    autoFocus
                                    className="font-bold text-white bg-white/5 border-b-2 border-indigo-500 outline-none text-lg px-2 py-1 rounded-t w-full"
                                    value={editForm.item}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, item: e.target.value }))}
                                    placeholder="Item name"
                                />
                                <select
                                    className="font-medium text-slate-300 bg-slate-800 border-b-2 border-indigo-500 outline-none text-sm px-2 py-1 rounded-t cursor-pointer"
                                    value={editForm.category}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                >
                                    {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                                <input
                                    type="date"
                                    className="font-medium text-slate-300 bg-white/5 border-b-2 border-indigo-500 outline-none text-sm px-2 py-1 rounded-t"
                                    value={editForm.date}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                                />
                            </div>
                        ) : (
                            /* VIEW MODE: Text */
                            <>
                                <h4 className="font-bold text-slate-100 text-lg group-hover:text-white transition-colors">{expense.item}</h4>
                                <div className="flex items-center gap-3 text-[11px] font-bold tracking-wide">
                                    <span className={`px-2.5 py-0.5 rounded-full border border-black/5 ${CATEGORY_COLORS[expense.category] || CATEGORY_COLORS.General}`}>{expense.category}</span>
                                    <div className="flex items-center gap-1.5 text-slate-500">
                                        <Calendar className="w-3 h-3" />
                                        <span>{new Date(expense.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* RIGHT SIDE: Amount and Buttons */}
                <div className="flex flex-col items-end gap-2">
                    <div className="text-right">
                        {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                                <span className="text-xl font-bold text-slate-400">₹</span>
                                <input
                                    type="number"
                                    className="font-black text-white bg-white/5 border-b-2 border-indigo-500 outline-none w-24 text-2xl text-right px-2 py-1 rounded-t"
                                    value={editForm.amount}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                />
                            </div>
                        ) : (
                            <span className="text-2xl font-black text-white tracking-tighter tabular-nums">₹{expense.amount.toLocaleString()}</span>
                        )}
                    </div>

                    <div className="flex gap-1">
                        {isEditing ? (
                            <>
                                <button onClick={handleSave} className="p-2.5 text-emerald-400 hover:text-white hover:bg-emerald-500 bg-emerald-500/10 rounded-xl transition-all"><Check size={18} /></button>
                                <button onClick={handleCancel} className="p-2.5 text-rose-400 hover:text-white hover:bg-rose-500 bg-rose-500/10 rounded-xl transition-all"><X size={18} /></button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsEditing(true)} className="p-2.5 text-slate-600 hover:text-indigo-400 transition-colors bg-white/5 rounded-xl hover:bg-indigo-400/10"><Edit3 size={18} /></button>
                                <button onClick={() => onDelete(expense.id)} className="p-2.5 text-slate-600 hover:text-rose-400 transition-colors bg-white/5 rounded-xl hover:bg-rose-400/10"><Trash2 size={18} /></button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}