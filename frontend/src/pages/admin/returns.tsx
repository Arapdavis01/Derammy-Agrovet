import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface ReturnItem {
  id: string;
  product_id: string;
  batch_id: string | null;
  quantity: number;
  condition: string;
  refund_amount: number;
  product: { id: string; name: string; unit: string };
}

interface ReturnRecord {
  id: string;
  sale_id: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
  return_date: string;
  reason: string;
  total_refund: number;
  refund_method: string;
  status: string;
  return_items: ReturnItem[];
  sale?: { id: string; invoice_no: string };
}

export default function AdminReturns() {
  const { user } = useAuth();
  const router = useRouter();
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchReturns();
  }, [user]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      // Fetch returns with items
      const res = await api.get('/returns', { params: { limit: 200 } });
      // The list endpoint may not include return_items by default,
      // but we can use the response as is. If items are not included,
      // we'll display what we have.
      setReturns(res.data.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch returns');
    } finally {
      setLoading(false);
    }
  };

  // Compute summary
  const summary = useMemo(() => {
    const returnsCount = returns.filter((r) => r.return_items?.some((item) => item.condition !== 'exchange')).length;
    const exchangesCount = returns.filter((r) => r.return_items?.some((item) => item.condition === 'exchange')).length;
    const totalRefunded = returns.reduce((sum, r) => sum + Number(r.total_refund || 0), 0);
    return {
      returnsCount,
      exchangesCount,
      totalRefunded,
      total: returns.length,
    };
  }, [returns]);

  // Filter returns based on search and status
  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        r.sale?.invoice_no?.toLowerCase().includes(searchLower) ||
        r.customer?.name?.toLowerCase().includes(searchLower) ||
        r.return_items?.some((item) =>
          item.product?.name?.toLowerCase().includes(searchLower)
        );
      const matchesStatus =
        filterStatus === 'all' || r.refund_method === filterStatus || r.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [returns, search, filterStatus]);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Returns & Exchanges</h1>
          <p className="text-muted">
            <i className="fas fa-arrow-left" style={{ marginRight: '6px' }}></i>Back
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={fetchReturns}>
          <i className="fas fa-refresh" style={{ marginRight: '4px' }}></i> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card summary-card">
          <i className="fas fa-rotate-left card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Returns</h4>
          <p className="summary-value">{summary.returnsCount}</p>
          <span className="summary-subtitle">Total returns</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-exchange-alt card-icon" style={{ color: '#0288D1' }}></i>
          <h4>Exchanges</h4>
          <p className="summary-value">{summary.exchangesCount}</p>
          <span className="summary-subtitle">Total exchanges</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#D32F2F' }}></i>
          <h4>KES {summary.totalRefunded.toLocaleString()}</h4>
          <p className="summary-value">Refunded</p>
          <span className="summary-subtitle">Total amount refunded</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-file-invoice card-icon" style={{ color: '#1B5E20' }}></i>
          <h4>{summary.total}</h4>
          <p className="summary-value">Total</p>
          <span className="summary-subtitle">All records</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters mt-4">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="input"
        >
          <option value="all">All</option>
          <option value="cash">Cash Refund</option>
          <option value="mpesa">M-Pesa Refund</option>
          <option value="credit_note">Credit Note</option>
        </select>
      </div>

      {/* Returns Table */}
      <table className="table mt-4">
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Product</th>
            <th>Qty</th>
            <th>Exchange</th>
            <th>Refund</th>
            <th>Cashier</th>
          </tr>
        </thead>
        <tbody>
          {filteredReturns.map((ret) => {
            const firstItem = ret.return_items?.[0];
            const type = ret.refund_method === 'exchange' ? 'Exchange' : 'Return';
            return (
              <tr key={ret.id}>
                <td>{new Date(ret.return_date).toLocaleDateString()}</td>
                <td>{ret.sale?.invoice_no || ret.sale_id || '-'}</td>
                <td>{ret.customer?.name || 'Walk-in Customer'}</td>
                <td>{type}</td>
                <td>{firstItem ? `${firstItem.product.name} - ${firstItem.product.unit}` : '-'}</td>
                <td>{firstItem ? firstItem.quantity : '-'}</td>
                <td>-</td>
                <td>KES {ret.total_refund}</td>
                <td>{ret.user?.full_name || '-'}</td>
              </tr>
            );
          })}
          {filteredReturns.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center">No returns found</td>
            </tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
