import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Returns.module.css';

interface Return {
  id: string;
  sale_id: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
  return_date: string;
  reason: string;
  total_refund: number;
  refund_method: string;
  status: string;
}

interface ReturnDetail extends Return {
  return_items: {
    id: string;
    product_id: string;
    batch_id: string | null;
    quantity: number;
    condition: string;
    refund_amount: number;
    product: { id: string; name: string; unit: string };
  }[];
  sale: { id: string; invoice_no: string };
}

export default function AdminReturns() {
  const { user } = useAuth();
  const router = useRouter();
  const [returns, setReturns] = useState<Return[]>([]);
  const [totalReturns, setTotalReturns] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    customer_id: '',
  });
  const [selectedReturn, setSelectedReturn] = useState<ReturnDetail | null>(null);

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
  }, [user, page, filters]);

  const fetchReturns = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.customer_id) params.customer_id = filters.customer_id;

      const res = await api.get('/returns', { params });
      setReturns(res.data.data);
      setTotalReturns(res.data.total);
    } catch (error: any) {
      toast.error('Failed to fetch returns');
    } finally {
      setLoading(false);
    }
  };

  const fetchReturnDetail = async (id: string) => {
    try {
      const res = await api.get(`/returns/${id}`);
      setSelectedReturn(res.data);
    } catch (error: any) {
      toast.error('Failed to fetch return details');
    }
  };

  const totalPages = Math.ceil(totalReturns / limit);

  return (
    <Layout>
      <h1>Returns</h1>

      {/* Filters */}
      <div className={styles.filters}>
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
        <input
          type="text"
          value={filters.customer_id}
          onChange={(e) => setFilters({ ...filters, customer_id: e.target.value })}
          className="input"
          placeholder="Customer ID"
        />
        <button className="btn btn-outline" onClick={() => { setPage(1); fetchReturns(); }}>Apply</button>
      </div>

      <table className="table mt-4">
        <thead>
          <tr>
            <th>Return Date</th>
            <th>Invoice</th>
            <th>Customer</th>
            <th>Reason</th>
            <th>Total Refund</th>
            <th>Method</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {returns.map((ret) => (
            <tr key={ret.id}>
              <td>{new Date(ret.return_date).toLocaleString()}</td>
              <td>{ret.sale_id ? 'View' : '-'}</td>
              <td>{ret.customer?.name || 'Walk-in'}</td>
              <td>{ret.reason || '-'}</td>
              <td>KES {ret.total_refund.toLocaleString()}</td>
              <td>{ret.refund_method}</td>
              <td>
                <button className="btn btn-sm btn-outline" onClick={() => fetchReturnDetail(ret.id)}>View</button>
              </td>
            </tr>
          ))}
          {returns.length === 0 && (
            <tr><td colSpan={7} className="text-center">No returns found</td></tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex justify-between mt-4">
          <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedReturn && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Return Details</h3>
            <p><strong>Date:</strong> {new Date(selectedReturn.return_date).toLocaleString()}</p>
            <p><strong>Invoice:</strong> {selectedReturn.sale?.invoice_no || 'N/A'}</p>
            <p><strong>Customer:</strong> {selectedReturn.customer?.name || 'Walk-in'}</p>
            <p><strong>Reason:</strong> {selectedReturn.reason || '-'}</p>
            <p><strong>Total Refund:</strong> KES {selectedReturn.total_refund}</p>
            <p><strong>Method:</strong> {selectedReturn.refund_method}</p>

            <h4>Items Returned</h4>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Condition</th>
                  <th>Refund Amount</th>
                </tr>
              </thead>
              <tbody>
                {selectedReturn.return_items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product.name}</td>
                    <td>{item.quantity} {item.product.unit}</td>
                    <td>{item.condition}</td>
                    <td>KES {item.refund_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button className="btn btn-outline" onClick={() => setSelectedReturn(null)}>Close</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
