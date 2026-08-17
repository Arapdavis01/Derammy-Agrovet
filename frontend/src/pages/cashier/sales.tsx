import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Summary {
  my_today_sales: number;
  my_today_count: number;
  my_total_sales: number;
  my_total_count: number;
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
  });
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [summary, setSummary] = useState<Summary>({
    my_today_sales: 0,
    my_today_count: 0,
    my_total_sales: 0,
    my_total_count: 0,
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
    fetchSummary();
    fetchSales();
  }, [user, page, filters]);

  const fetchSummary = async () => {
    try {
      const res = await api.get('/dashboard/cashier');
      setSummary(res.data);
    } catch (error) {
      // Silent fail; summary cards show zeros
    }
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit, user_id: user?.id };
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.payment_method) params.payment_method = filters.payment_method;

      const res = await api.get('/sales', { params });
      setSales(res.data.data);
      setTotalSales(res.data.total);
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
    summary.my_total_count > 0 ? summary.my_total_sales / summary.my_total_count : 0;

  const totalPages = Math.ceil(totalSales / limit);

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>My Sales</h1>
        <p>Your personal sales performance.</p>
      </div>

      {/* Personal Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Today Sales</h4>
          <p className="summary-value">KES {summary.my_today_sales.toLocaleString()}</p>
          <span className="summary-subtitle">{summary.my_today_count} transactions</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-receipt card-icon" style={{ color: '#0288D1' }}></i>
          <h4>Today Transactions</h4>
          <p className="summary-value">{summary.my_today_count}</p>
          <span className="summary-subtitle">Today</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-chart-line card-icon" style={{ color: '#1B5E20' }}></i>
          <h4>Total Sales</h4>
          <p className="summary-value">KES {summary.my_total_sales.toLocaleString()}</p>
          <span className="summary-subtitle">{summary.my_total_count} total transactions</span>
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
            <th>Items</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => {
            // Build items preview (first 2 items)
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
                  {sale.customer?.name || 'Walk-in'}
                  {sale.payment_status === 'credit' && (
                    <span className="badge" style={{ marginLeft: '6px' }}>CREDIT</span>
                  )}
                </td>
                <td>
                  {itemsPreview}
                  {moreCount > 0 && <span className="text-muted"> +{moreCount} more</span>}
                </td>
                <td><strong>KES {sale.total.toLocaleString()}</strong></td>
                <td>{sale.payment_method.toUpperCase()}</td>
                <td>
                  <span className={`status ${sale.sale_status}`}>
                    {sale.sale_status}
                  </span>
                </td>
                <td>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => fetchSaleDetail(sale.id)}
                  >
                    <i className="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            );
          })}
          {sales.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center">
                No sales found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between mt-4">
          <button
            className="btn btn-outline btn-sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button
            className="btn btn-outline btn-sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedSale && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Sale Details</h3>
            <p><strong>Invoice:</strong> {selectedSale.invoice_no}</p>
            <p><strong>Date:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
            <p><strong>Customer:</strong> {selectedSale.customer?.name || 'Walk-in'}</p>
            <p><strong>Total:</strong> KES {selectedSale.total}</p>
            <h4>Items</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Unit Price</th>
                  <th>Total</th>
                </tr>
              </thead>
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
            <button className="btn btn-outline" onClick={() => setSelectedSale(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
