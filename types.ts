
export interface Expense {
  id: string;
  item: string;
  amount: number;
  category: string;
  date: string;
  currency: string;
}

export interface CategoryTotal {
  category: string;
  amount: number;
  percentage: number;
}

export interface SummaryResult {
  total: number;
  count: number;
  byCategory: CategoryTotal[];
  period: string;
}
