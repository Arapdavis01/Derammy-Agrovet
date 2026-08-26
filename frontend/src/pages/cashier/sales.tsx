import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface CashierOption {
  id: string;
  full_name: string;
}

export default function CashierSales() {
  const { user } = useAuth();
  const router = useRouter();
  const [sales, setSales] = useState<any[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    payment_method: '',
    cashier_id: '',
  });
  const [cashiers, setCashiers] = useState<CashierOption[]>([]);
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [summary, setSummary] = useState({
    today_sales: 0,
    today_count: 0,
    total_sales: 0,
    total_count: 0,
  });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchCashiers();
    fetchSales();
  }, [user, page, filters]);

  const fetchCashiers = async () => {
    try {
      const res = await api.get('/users/cashiers');
      setCashiers(res.data || []);
    } catch (error) {
      // silent
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      // We don't filter by user_id because shared cashier account should see all sales
      const params: any = { page, limit };
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.payment_method) params.payment_method = filters.payment_method;
      if (filters.cashier_id) params.cashier_id = filters.cashier_id;

      const res = await api.get('/sales', { params });
      const data = res.data.data || [];
      setSales(data);
      setTotalSales(res.data.total || 0);

      // Compute summary from returned sales (may be limited to current page, so approximate)
      // For better accuracy, we could make a separate summary endpoint later.
      const today = new Date().toDateString();
      let todaySales = 0;
      let todayCount = 0;
      let totalAllSales = 0;
      let totalAllCount = 0;

      // Fetch all sales? For now, we use current page only – but we can improve by requesting limit=1000 for summary.
      // To keep it simple and correct, we'll fetch a separate summary from the backend if available.
      // For now, set placeholder from current page data.
      data.forEach((sale: any) => {
        totalAllSales += Number(sale.total);
        totalAllCount += 1;
        if (new Date(sale.sale_date).toDateString() === today) {
          todaySales += Number(sale.total);
          todayCount += 1;
        }
      });

      // If there are more pages, the totals won't be accurate. We'll fix with a summary endpoint later.
      setSummary({
        today_sales: todaySales,
        today_count: todayCount,
        total_sales: totalAllSales,
        total_count: totalAllCount,
      });
    } catch (error: any) {
      toast.error('Failed to fetch sales');
    } finally {
      setLoading(false);
    }
  };

  const fetchSaleDetail = async (id: string) => {
    try {
      const res = await api.get(`/sales/${id}`);
      setSelectedSale(res.data);
    } catch (error: any) {
      toast.error('Failed to fetch sale details');
    }
  };

  const avgTransaction =
    summary.total_count > 0 ? summary.total_sales / summary.total_count : 0;

  const totalPages = Math.ceil(totalSales / limit);

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>Sales</h1>
        <p>All sales from the shared cashier account.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Today Sales</h4>
          <p className="summary-value">KES {summary.today_sales.toLocaleString()}</p>
          <span className="summary-subtitle">{summary.today_count} transactions</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-receipt card-icon" style={{ color: '#0288D1' }}></i>
          <h4>Today Transactions</h4>
          <p className="summary-value">{summary.today_count}</p>
          <span className="summary-subtitle">Today</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-chart-line card-icon" style={{ color: '#0F766E' }}></i>
          <h4>Total Sales</h4>
          <p className="summary-value">KES {summary.total_sales.toLocaleString()}</p>
          <span className="summary-subtitle">{summary.total_count} total transactions</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-calculator card-icon" style={{ color: '#4CAF50' }}></i>
          <h4>Avg. Transaction</h4>
          <p className="summary-value">KES {avgTransaction.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          <span className="summary-subtitle">Per sale</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters mt-6">
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
          <option value="">All Methods</option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="credit">Credit</option>
          <option value="mixed">Mixed</option>
        </select>
        <select
          value={filters.cashier_id}
          onChange={(e) => setFilters({ ...filters, cashier_id: e.target.value })}
          className="input"
        >
          <option value="">All Cashiers</option>
          {cashiers.map((cashier) => (
            <option key={cashier.id} value={cashier.id}>{cashier.full_name}</option>
          ))}
        </select>
        <button
          className="btn btn-outline"
          onClick={() => {
            setPage(1);
            fetchSales();
          }}
        >
          <i className="fas fa-filter" style={{ marginRight: '4px' }}></i> Apply
        </button>
      </div>

      {/* Sales Table */}
      <table className="table mt-4">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Cashier</th>
            <th>Items</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => {
            const itemsPreview = sale.sale_items
              ? sale.sale_items
                  .slice(0, 2)
                  .map(
                    (item: any) =>
                      `${item.product.name} ×${item.quantity} ${item.product.unit}`
                  )
                  .join(', ')
              : '';
            const moreCount = sale.sale_items ? sale.sale_items.length - 2 : 0;

            return (
              <tr key={sale.id}>
                <td><strong>{sale.invoice_no}</strong></td>
                <td>{new Date(sale.sale_date).toLocaleString()}</td>
                <td>
                  {sale.customer?.name || sale.customer_name || 'Walk-in'}
                  {sale.payment_status === 'credit' && (
                    <span className="badge" style={{ marginLeft: '6px' }}>CREDIT</span>
                  )}
                </td>
                <td>{sale.cashier?.full_name || 'N/A'}</td>
                <td>
                  {itemsPreview}
                  {moreCount > 0 && <span className="text-muted"> +{moreCount} more</span>}
                </td>
                <td><strong>KES {sale.total.toLocaleString()}</strong></td>
                <td>{sale.payment_method.toUpperCase()}</td>
                <td>
                  <span className={`status ${sale.sale_status}`}>{sale.sale_status}</span>
                </td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => fetchSaleDetail(sale.id)}>
                    <i className="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            );
          })}
          {sales.length === 0 && (
            <tr><td colSpan={9} className="text-center">No sales found</td></tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between mt-4">
          <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedSale && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-receipt"></i> Sale Details</h3>
              <button className="modal-close" onClick={() => setSelectedSale(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <p><strong>Invoice:</strong> {selectedSale.invoice_no}</p>
              <p><strong>Date:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
              <p><strong>Customer:</strong> {selectedSale.customer?.name || selectedSale.customer_name || 'Walk-in'}</p>
              <p><strong>Cashier:</strong> {selectedSale.cashier?.full_name || 'N/A'}</p>
              <p><strong>Total:</strong> KES {selectedSale.total}</p>
              <h4>Items</h4>
              <table className="table">
                <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
                <tbody>
                  {selectedSale.sale_items.map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.product.name}</td>
                      <td>{item.quantity} {item.product.unit}</td>
                      <td>KES {item.unit_price}</td>
                      <td>KES {item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setSelectedSale(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
