export interface Expense {
  id: string;
  item: string;
  amount: number;
  category: string;
  date: string;
  currency: string;
  userPhone?: string;
}

export type FilterCriteria = {
  period: 'today' | 'week' | 'month' | 'year' | 'all';
  month?: number; // 1-12
  year?: number;
};

export interface CategoryTotal {
  category: string;
  amount: number;
  percentage: number;
}