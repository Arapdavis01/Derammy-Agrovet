import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Sale {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  payment_method: string;
  payment_status: string;
  sale_status: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
  sale_items?: { id: string; quantity: number; product: { name: string; unit: string } }[];
}

interface SaleDetail extends Sale {
  sale_items: {
    id: string;
    product_id: string;
    quantity: number;
    unit_price: number;
    discount: number;
    total: number;
    product: { id: string; name: string; unit: string };
  }[];
  payments: any[];
}

export default function AdminSales() {
  const { user } = useAuth();
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    start_date: '',
    end_date: '',
    payment_method: '',
  });
  const [dashboard, setDashboard] = useState<any>(null);
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [voiding, setVoiding] = useState(false);

  // Fetch dashboard summary and sales list
  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchDashboard();
    fetchSales(1);
  }, [user]);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/dashboard/admin');
      setDashboard(res.data);
    } catch (error) {
      toast.error('Failed to load dashboard summary');
    }
  };

  const fetchSales = async (pageNum: number) => {
    setLoading(true);
    try {
      const params: any = {
        page: pageNum,
        limit,
        search: filters.search || undefined,
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        payment_method: filters.payment_method || undefined,
      };
      const res = await api.get('/sales', { params });
      setSales(res.data.data || []);
      setTotalCount(res.data.total || 0);
      setPage(res.data.page || pageNum);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch sales');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    fetchSales(1);
  };

  const clearFilters = () => {
    setFilters({ search: '', start_date: '', end_date: '', payment_method: '' });
    fetchSales(1);
  };

  const fetchSaleDetail = async (id: string) => {
    try {
      const res = await api.get(`/sales/${id}`);
      setSelectedSale(res.data);
    } catch (error) {
      toast.error('Failed to fetch sale details');
    }
  };

  const handleVoid = async (id: string) => {
    if (!confirm('Void this sale? Items will be restocked.')) return;
    setVoiding(true);
    try {
      await api.put(`/sales/${id}/void`, { reason: 'Void from sales list' });
      toast.success('Sale voided');
      fetchSales(page);
      setSelectedSale(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to void sale');
    } finally {
      setVoiding(false);
    }
  };

  const exportCSV = () => {
    if (sales.length === 0) {
      toast.error('No data to export');
      return;
    }
    const headers = ['Receipt No', 'Date', 'Customer', 'Items', 'Total', 'Payment', 'Cashier'];
    const rows = sales.map((sale) => [
      sale.invoice_no,
      new Date(sale.sale_date).toLocaleDateString(),
      sale.customer?.name || 'Walk-in Customer',
      sale.sale_items
        ? sale.sale_items.map((item) => `${item.product.name} ×${item.quantity}`).join(' | ')
        : '',
      sale.total,
      sale.payment_method.toUpperCase(),
      sale.user?.full_name || 'Unknown',
    ]);
    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Computed totals
  const totalRevenue = dashboard?.total_sales || 0;
  const totalTransactions = dashboard?.cashier_performance?.reduce(
    (sum: number, c: any) => sum + c.total_count,
    0
  ) || 0;
  const todayRevenue = dashboard?.today_sales || 0;
  const todayTransactions = dashboard?.today_sales_count || 0;
  const avgTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

  // Today payment summary (approx: from dashboard? We'll compute from today sales if available, else leave as placeholder)
  const todayCashSales = dashboard?.today_sales || 0; // simplified

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Sales Overview</h1>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => fetchSales(page)}>
            <i className="fas fa-refresh" style={{ marginRight: '4px' }}></i> Refresh
          </button>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>
            <i className="fas fa-file-csv" style={{ marginRight: '4px' }}></i> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#1B5E20' }}></i>
          <h4>Total Revenue</h4>
          <p className="summary-value">KES {totalRevenue.toLocaleString()}</p>
          <span className="summary-subtitle">All time</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-receipt card-icon" style={{ color: '#0288D1' }}></i>
          <h4>Total Transactions</h4>
          <p className="summary-value">{totalTransactions}</p>
          <span className="summary-subtitle">{todayTransactions} today</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-calendar-day card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Today Revenue</h4>
          <p className="summary-value">KES {todayRevenue.toLocaleString()}</p>
          <span className="summary-subtitle">{todayTransactions} transactions</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-chart-line card-icon" style={{ color: '#4CAF50' }}></i>
          <h4>Avg. Transaction</h4>
          <p className="summary-value">KES {avgTransaction.toFixed(3)}</p>
          <span className="summary-subtitle">Per sale</span>
        </div>
      </div>

      {/* Today Payment Summary */}
      <div className="dashboard-section">
        <h2><i className="fas fa-credit-card" style={{ marginRight: '8px' }}></i>Today Payment Summary</h2>
        <div className="card">
          <div className="flex items-center gap-4">
            <i className="fas fa-money-bill-wave" style={{ fontSize: '2rem', color: '#F57C00' }}></i>
            <div>
              <strong>CASH</strong>
              <p className="text-muted">KES {todayCashSales.toLocaleString()} | {todayTransactions} sales</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sales History */}
      <div className="dashboard-section">
        <h2><i className="fas fa-history" style={{ marginRight: '8px' }}></i>Sales History</h2>

        <div className="filters">
          <input
            type="text"
            placeholder="Search receipt, customer, cashier..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="input"
          />
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
            className="input"
          />
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
            className="input"
          />
          <select
            value={filters.payment_method}
            onChange={(e) => setFilters({ ...filters, payment_method: e.target.value })}
            className="input"
          >
            <option value="">All Payments</option>
            <option value="cash">Cash</option>
            <option value="mpesa">M-Pesa</option>
            <option value="credit">Credit</option>
            <option value="mixed">Mixed</option>
          </select>
          <button className="btn btn-outline" onClick={applyFilters}>Apply</button>
          <button className="btn btn-outline" onClick={clearFilters}>Clear</button>
        </div>

        <table className="table mt-4">
          <thead>
            <tr>
              <th>Receipt No</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Cashier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.invoice_no}</td>
                <td>
                  {new Date(sale.sale_date).toLocaleDateString()}<br />
                  <span className="text-muted">{new Date(sale.sale_date).toLocaleTimeString()}</span>
                </td>
                <td>{sale.customer?.name || 'Walk-in Customer'}</td>
                <td>
                  {sale.sale_items && sale.sale_items.length > 0
                    ? sale.sale_items.map((item) => `${item.product.name} ×${item.quantity}`).join(' | ')
                    : '—'}
                </td>
                <td>KES {sale.total.toLocaleString()}</td>
                <td>{sale.payment_method.toUpperCase()}</td>
                <td>{sale.user?.full_name || 'Unknown'}</td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => fetchSaleDetail(sale.id)}>
                    <i className="fas fa-eye"></i>
                  </button>
                  {sale.sale_status === 'completed' && user?.role !== 'cashier' && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleVoid(sale.id)} disabled={voiding}>
                      <i className="fas fa-ban"></i>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr><td colSpan={8} className="text-center">No sales found</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between mt-4">
            <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => fetchSales(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => fetchSales(page + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            <h3>Sale Details</h3>
            <p><strong>Receipt:</strong> {selectedSale.invoice_no}</p>
            <p><strong>Date:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
            <p><strong>Customer:</strong> {selectedSale.customer?.name || 'Walk-in Customer'}</p>
            <p><strong>Cashier:</strong> {selectedSale.user?.full_name}</p>
            <p><strong>Total:</strong> KES {selectedSale.total}</p>
            <p><strong>Payment Method:</strong> {selectedSale.payment_method.toUpperCase()}</p>
            <p><strong>Status:</strong> {selectedSale.sale_status}</p>

            <h4>Items</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedSale.sale_items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product.name}</td>
                    <td>{item.quantity} {item.product.unit}</td>
                    <td>KES {item.unit_price}</td>
                    <td>KES {item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {selectedSale.sale_status === 'completed' && user?.role !== 'cashier' && (
              <button className="btn btn-danger" onClick={() => handleVoid(selectedSale.id)} disabled={voiding}>
                Void Sale
              </button>
            )}
            <button className="btn btn-outline" onClick={() => setSelectedSale(null)}>Close</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
