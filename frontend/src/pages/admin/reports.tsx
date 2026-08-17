import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface DailySummary {
  date: string;
  salesTotal: number;
  transactions: number;
  itemsSold: number;
  stockAdded: number;
  closingStock: number;
}

export default function AdminReports() {
  const { user } = useAuth();
  const router = useRouter();

  const [todaySummary, setTodaySummary] = useState({
    salesTotal: 0,
    transactions: 0,
    itemsSold: 0,
    stockAdded: 0,
    closingStock: 0,
  });
  const [history, setHistory] = useState<DailySummary[]>([]);
  const [searchDate, setSearchDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchTodaySummary(), fetchHistory()]);
    setLoading(false);
  };

  const refreshData = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const fetchTodaySummary = async () => {
    try {
      const salesRes = await api.get('/reports/daily-sales', {
        params: { start_date: today, end_date: today },
      });
      const summary = salesRes.data.summary;

      const inventoryRes = await api.get('/inventory');
      const totalStock = inventoryRes.data.reduce(
        (sum: number, item: any) => sum + Number(item.total_stock || 0),
        0
      );

      setTodaySummary({
        salesTotal: summary.total_sales || 0,
        transactions: summary.total_transactions || 0,
        itemsSold: summary.total_items || 0,
        stockAdded: 0,
        closingStock: totalStock,
      });
    } catch (error) {
      toast.error('Failed to load today summary');
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await api.get('/sales', { params: { limit: 500 } });
      const sales = res.data.data || [];

      const grouped = sales.reduce((acc: any, sale: any) => {
        const date = sale.sale_date.split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            date,
            salesTotal: 0,
            transactions: 0,
            itemsSold: 0,
            stockAdded: 0,
            closingStock: 0,
          };
        }
        acc[date].salesTotal += Number(sale.total);
        acc[date].transactions += 1;
        return acc;
      }, {});

      // Explicitly type as DailySummary[]
      const historyArray: DailySummary[] = Object.values(grouped).sort((a: any, b: any) =>
        b.date.localeCompare(a.date)
      );

      historyArray.forEach((h: DailySummary) => {
        h.closingStock = 0; // placeholder
      });

      setHistory(historyArray);
    } catch (error) {
      toast.error('Failed to load history');
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchDate) return history;
    return history.filter((h) => h.date === searchDate);
  }, [history, searchDate]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Today Summary</h1>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={refreshData} disabled={refreshing}>
            <i className={`fas fa-sync-alt ${refreshing ? 'fa-spin' : ''}`} style={{ marginRight: '4px' }}></i>
            Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={handlePrint}>
            <i className="fas fa-print" style={{ marginRight: '4px' }}></i>
            Print
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mt-4">
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Today Sales</h4>
          <p className="summary-value">KES {todaySummary.salesTotal.toLocaleString()}</p>
          <span className="summary-subtitle">{todaySummary.transactions} transactions</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-boxes card-icon" style={{ color: '#1B5E20' }}></i>
          <h4>Items Sold</h4>
          <p className="summary-value">{todaySummary.itemsSold}</p>
          <span className="summary-subtitle">Units sold today</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-truck-loading card-icon" style={{ color: '#0288D1' }}></i>
          <h4>Stock Added</h4>
          <p className="summary-value">{todaySummary.stockAdded}</p>
          <span className="summary-subtitle">From POs received</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-warehouse card-icon" style={{ color: '#FFA000' }}></i>
          <h4>Current Stock</h4>
          <p className="summary-value">{todaySummary.closingStock}</p>
          <span className="summary-subtitle">total products</span>
        </div>
      </div>

      {/* Daily Reports History */}
      <div className="dashboard-section">
        <h2><i className="fas fa-calendar-alt" style={{ marginRight: '8px' }}></i>Daily Reports History</h2>

        <div className="filters">
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="input"
            style={{ maxWidth: '200px' }}
          />
          <button className="btn btn-outline" onClick={() => setSearchDate('')}>
            Clear
          </button>
          <span className="text-muted">Search by date...</span>
        </div>

        <div className="flex gap-2 mb-4">
          <button className="btn btn-outline btn-sm">
            <i className="fas fa-file-export" style={{ marginRight: '4px' }}></i> Regenerate Selected
          </button>
          <button className="btn btn-outline btn-sm" onClick={handlePrint}>
            <i className="fas fa-print" style={{ marginRight: '4px' }}></i> Print All
          </button>
        </div>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sales</th>
                <th>Transactions</th>
                <th>Items Sold</th>
                <th>Stock Added</th>
                <th>Closing Stock</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((entry, index) => (
                <tr key={index}>
                  <td>{new Date(entry.date).toLocaleDateString()}</td>
                  <td>KES {entry.salesTotal.toLocaleString()}</td>
                  <td>{entry.transactions}</td>
                  <td>{entry.itemsSold}</td>
                  <td>{entry.stockAdded}</td>
                  <td>{entry.closingStock}</td>
                </tr>
              ))}
              {filteredHistory.length === 0 && (
                <tr><td colSpan={6} className="text-center">No records found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
