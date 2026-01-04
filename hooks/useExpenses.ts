import { useState, useCallback, useEffect } from 'react';
import { Expense } from '../types';

// Change this to your Spring Boot Server URL
const API_BASE_URL = 'http://localhost:8081/api';

export function useExpenses(userPhone: string | null) {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'local'>('local');
    const [isLoading, setIsLoading] = useState(false);

    // Load from Local Storage
    const loadLocalData = useCallback(() => {
        if (!userPhone) return;
        const saved = localStorage.getItem(`expenses_v2_${userPhone}`);
        if (saved) {
            const parsed = JSON.parse(saved);
            parsed.sort((a: Expense, b: Expense) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setExpenses(parsed);
        }
    }, [userPhone]);

    // Fetch from Spring Boot
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
        } catch (err) {
            setSyncStatus('local');
            loadLocalData();
        } finally {
            setIsLoading(false);
        }
    }, [userPhone, loadLocalData]);

    // --- FIX: AUTO-FETCH & CLEAR DATA ---
    useEffect(() => {
        // 1. If no user (logged out), clear everything immediately
        if (!userPhone) {
            setExpenses([]);
            setSyncStatus('local');
            return;
        }

        // 2. If user changed, CLEAR OLD DATA first to avoid showing previous user's info
        setExpenses([]);

        // 3. Trigger the fetch automatically
        fetchExpenses();
    }, [userPhone, fetchExpenses]);
    // ------------------------------------

    // Sync to local storage on change
    useEffect(() => {
        if (userPhone && expenses.length > 0) {
            localStorage.setItem(`expenses_v2_${userPhone}`, JSON.stringify(expenses));
        }
    }, [expenses, userPhone]);

    // Add Expense
    const addExpense = useCallback(async (item: string, amount: number, category: string, date?: string) => {
        if (!userPhone) return { error: "User not logged in" };

        let expenseDate = date ? new Date(date + 'T12:00:00') : new Date();
        if (isNaN(expenseDate.getTime())) expenseDate = new Date();

        const newExp = {
            id: crypto.randomUUID(),
            item, amount, category: category || 'General',
            date: expenseDate.toISOString(), currency: 'INR', userPhone
        };

        setExpenses(prev => [newExp, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        try {
            await fetch(`${API_BASE_URL}/expenses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-User-Phone': userPhone },
                body: JSON.stringify(newExp)
            });
            setSyncStatus('synced');
        } catch (err) { setSyncStatus('local'); }

        return { success: true, message: `Logged ${item}.` };
    }, [userPhone]);

    // Update Expense
    const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
        if (!userPhone) return;
        setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));

        try {
            await fetch(`${API_BASE_URL}/expenses/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-User-Phone': userPhone },
                body: JSON.stringify(updates)
            });
            setSyncStatus('synced');
        } catch (err) { setSyncStatus('local'); }
        return { success: true };
    }, [userPhone]);

    // Delete Expense
    const deleteExpense = useCallback(async (id: string) => {
        if (!userPhone) return;
        setExpenses(prev => prev.filter(e => e.id !== id));
        try {
            await fetch(`${API_BASE_URL}/expenses/${id}`, {
                method: 'DELETE',
                headers: { 'X-User-Phone': userPhone }
            });
            setSyncStatus('synced');
        } catch (err) { setSyncStatus('local'); }
    }, [userPhone]);

    return { expenses, syncStatus, isLoading, fetchExpenses, addExpense, updateExpense, deleteExpense };
}