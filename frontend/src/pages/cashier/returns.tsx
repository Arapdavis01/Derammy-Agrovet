import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Returns.module.css';

interface SaleItem {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
  product: { id: string; name: string; unit: string };
}

interface Sale {
  id: string;
  invoice_no: string;
  sale_date: string;
  customer: { id: string; name: string } | null;
  sale_items: SaleItem[];
}

interface ReturnItemInput {
  sale_item_id: string;
  quantity: number;
  reason: string;
  condition: string;
}

export default function CashierReturns() {
  const { user } = useAuth();
  const router = useRouter();
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [returnItems, setReturnItems] = useState<ReturnItemInput[]>([]);
  const [refundMethod, setRefundMethod] = useState<'cash' | 'mpesa' | 'credit_note'>('cash');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Past returns
  const [myReturns, setMyReturns] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalReturns, setTotalReturns] = useState(0);
  const limit = 10;

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchMyReturns();
  }, [user, page]);

  const fetchMyReturns = async () => {
    try {
      const res = await api.get('/returns', { params: { page, limit, user_id: user?.id } });
      setMyReturns(res.data.data);
      setTotalReturns(res.data.total);
    } catch (error: any) {
      toast.error('Failed to fetch returns');
    }
  };

  const handleInvoiceSearch = async () => {
    if (!invoiceSearch.trim()) {
      toast.error('Enter invoice number');
      return;
    }
    setLoading(true);
    try {
      // Find sale by invoice_no. We'll use sales list with search? Better to have endpoint? For simplicity, use /sales?invoice_no=... (not implemented). 
      // We'll fetch all sales and filter client-side? Not efficient. We'll assume we have a sale ID input? 
      // Alternative: use /sales?limit=100 and find by invoice. For now, we'll prompt to enter sale ID, but we can add an endpoint later.
      // Let's use the sale id directly for now. We'll modify POS to store sale id? Not necessary.
      // I'll implement search by invoice using a simple client-side find from /sales?limit=100&search=... maybe not.
      // For simplicity, I'll ask user to enter sale ID (UUID) instead of invoice.
      // But the UI should be user-friendly. We'll assume the backend has a GET /sales?invoice_no= endpoint.
      // We'll add it later. For now, use a prompt.
      // I'll adjust to use invoice_no directly if we add support.
      // For now, we'll fetch sale by ID or invoice using a generic fetch.
      const res = await api.get('/sales', { params: { limit: 100 } });
      const found = res.data.data.find((s: any) => s.invoice_no === invoiceSearch.trim());
      if (!found) {
        toast.error('Invoice not found');
        return;
      }
      // Fetch sale detail with items
      const detailRes = await api.get(`/sales/${found.id}`);
      setSale(detailRes.data);
      setReturnItems([]);
    } catch (error: any) {
      toast.error('Failed to find sale');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnItemChange = (saleItemId: string, field: string, value: any) => {
    setReturnItems((prev) => {
      const existing = prev.find((item) => item.sale_item_id === saleItemId);
      if (existing) {
        return prev.map((item) =>
          item.sale_item_id === saleItemId ? { ...item, [field]: value } : item
        );
      } else {
        return [...prev, { sale_item_id: saleItemId, quantity: 0, reason: '', condition: 'resellable', [field]: value }];
      }
    });
  };

  const submitReturn = async () => {
    if (!sale) return;
    const validItems = returnItems.filter((item) => item.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Select at least one item with quantity');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/returns', {
        sale_id: sale.id,
        items: validItems,
        refund_method: refundMethod,
        reason: 'Return from cashier',
      });
      toast.success('Return processed successfully');
      setSale(null);
      setInvoiceSearch('');
      setReturnItems([]);
      fetchMyReturns();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to process return');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <h1>Process Return</h1>

      {/* Return form */}
      <div className={styles.returnForm}>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="Enter sale invoice number"
            value={invoiceSearch}
            onChange={(e) => setInvoiceSearch(e.target.value)}
            className="input"
          />
          <button className="btn btn-outline" onClick={handleInvoiceSearch} disabled={loading}>
            {loading ? 'Searching...' : 'Find Sale'}
          </button>
        </div>

        {sale && (
          <>
            <p><strong>Invoice:</strong> {sale.invoice_no}</p>
            <p><strong>Customer:</strong> {sale.customer?.name || 'Walk-in'}</p>
            <table className="table mt-4">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Original Qty</th>
                  <th>Return Qty</th>
                  <th>Reason</th>
                  <th>Condition</th>
                </tr>
              </thead>
              <tbody>
                {sale.sale_items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.product.name}</td>
                    <td>{item.quantity} {item.product.unit}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        step="0.1"
                        className="input"
                        style={{ width: '80px' }}
                        onChange={(e) => handleReturnItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="input"
                        placeholder="Reason"
                        onChange={(e) => handleReturnItemChange(item.id, 'reason', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        onChange={(e) => handleReturnItemChange(item.id, 'condition', e.target.value)}
                        defaultValue="resellable"
                      >
                        <option value="resellable">Resellable</option>
                        <option value="damaged">Damaged</option>
                        <option value="expired">Expired</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4">
              <label>Refund Method</label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as any)}
                className="input"
                style={{ maxWidth: '200px' }}
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </div>

            <button className="btn btn-primary mt-4" onClick={submitReturn} disabled={submitting}>
              {submitting ? 'Processing...' : 'Submit Return'}
            </button>
          </>
        )}
      </div>

      {/* Past returns */}
      <h2 className="mt-6">My Returns</h2>
      <table className="table mt-4">
        <thead>
          <tr>
            <th>Date</th>
            <th>Invoice</th>
            <th>Total Refund</th>
            <th>Method</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {myReturns.map((ret) => (
            <tr key={ret.id}>
              <td>{new Date(ret.return_date).toLocaleString()}</td>
              <td>{ret.sale?.invoice_no || ret.sale_id}</td>
              <td>KES {ret.total_refund}</td>
              <td>{ret.refund_method}</td>
              <td>
                <button className="btn btn-sm btn-outline" onClick={() => {/* fetch detail */}}>View</button>
              </td>
            </tr>
          ))}
          {myReturns.length === 0 && (
            <tr><td colSpan={5} className="text-center">No returns yet</td></tr>
          )}
        </tbody>
      </table>
    </Layout>
  );
}
