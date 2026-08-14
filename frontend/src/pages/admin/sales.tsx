import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Sales.module.css';

interface Sale {
  id: string;
  invoice_no: string;
  sale_date: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amount_paid: number;
  payment_status: string;
  sale_status: string;
  payment_method: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
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
    batch: { batch_number: string; expiry_date: string } | null;
  }[];
  payments: {
    id: string;
    amount: number;
    payment_method: string;
    reference: string;
    payment_date: string;
  }[];
}

export default function AdminSales() {
  const { user } = useAuth();
  const router = useRouter();
  const [sales, setSales] = useState<Sale[]>([]);
  const [totalSales, setTotalSales] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    user_id: '',
    payment_method: '',
    sale_status: '',
  });
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchSales();
  }, [user, page, filters]);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.user_id) params.user_id = filters.user_id;
      if (filters.payment_method) params.payment_method = filters.payment_method;
      if (filters.sale_status) params.sale_status = filters.sale_status;

      const res = await api.get('/sales', { params });
      setSales(res.data.data);
      setTotalSales(res.data.total);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch sales');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const fetchSaleDetail = async (id: string) => {
    try {
      const res = await api.get(`/sales/${id}`);
      setSelectedSale(res.data);
    } catch (error: any) {
      toast.error('Failed to fetch sale details');
    }
  };

  const handleVoid = async (id: string) => {
    if (!confirm('Are you sure you want to void this sale? This will restock items.')) return;
    setVoiding(true);
    try {
      await api.put(`/sales/${id}/void`, { reason: 'Void from sales list' });
      toast.success('Sale voided successfully');
      fetchSales();
      setSelectedSale(null);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to void sale');
    } finally {
      setVoiding(false);
    }
  };

  const totalPages = Math.ceil(totalSales / limit);

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Sales History</h1>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          type="date"
          value={filters.start_date}
          onChange={(e) => handleFilterChange('start_date', e.target.value)}
          className="input"
          placeholder="Start Date"
        />
        <input
          type="date"
          value={filters.end_date}
          onChange={(e) => handleFilterChange('end_date', e.target.value)}
          className="input"
          placeholder="End Date"
        />
        <input
          type="text"
          value={filters.user_id}
          onChange={(e) => handleFilterChange('user_id', e.target.value)}
          className="input"
          placeholder="User ID"
        />
        <select
          value={filters.payment_method}
          onChange={(e) => handleFilterChange('payment_method', e.target.value)}
          className="input"
        >
          <option value="">All Methods</option>
          <option value="cash">Cash</option>
          <option value="mpesa">M-Pesa</option>
          <option value="credit">Credit</option>
          <option value="mixed">Mixed</option>
        </select>
        <select
          value={filters.sale_status}
          onChange={(e) => handleFilterChange('sale_status', e.target.value)}
          className="input"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="held">Held</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>
        <button className="btn btn-outline" onClick={() => fetchSales()}>Apply</button>
      </div>

      {/* Sales Table */}
      <table className="table mt-4">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Cashier</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td>{sale.invoice_no}</td>
              <td>{new Date(sale.sale_date).toLocaleString()}</td>
              <td>{sale.customer?.name || 'Walk-in'}</td>
              <td>{sale.user?.full_name || '-'}</td>
              <td>KES {sale.total.toLocaleString()}</td>
              <td>{sale.payment_method}</td>
              <td>
                <span className={`${styles.status} ${styles[sale.sale_status]}`}>
                  {sale.sale_status}
                </span>
              </td>
              <td>
                <button className="btn btn-sm btn-outline" onClick={() => fetchSaleDetail(sale.id)}>View</button>
                {sale.sale_status === 'completed' && user?.role !== 'cashier' && (
                  <button className="btn btn-sm btn-danger" onClick={() => handleVoid(sale.id)} disabled={voiding}>Void</button>
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

      {/* Sale Detail Modal */}
      {selectedSale && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Sale Details</h3>
            <p><strong>Invoice:</strong> {selectedSale.invoice_no}</p>
            <p><strong>Date:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
            <p><strong>Customer:</strong> {selectedSale.customer?.name || 'Walk-in'}</p>
            <p><strong>Cashier:</strong> {selectedSale.user?.full_name}</p>
            <p><strong>Subtotal:</strong> KES {selectedSale.subtotal}</p>
            <p><strong>Discount:</strong> KES {selectedSale.discount}</p>
            <p><strong>Tax:</strong> KES {selectedSale.tax}</p>
            <p><strong>Total:</strong> KES {selectedSale.total}</p>
            <p><strong>Payment Status:</strong> {selectedSale.payment_status}</p>
            <p><strong>Payment Method:</strong> {selectedSale.payment_method}</p>

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

            {selectedSale.payments.length > 0 && (
              <>
                <h4>Payments</h4>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSale.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{payment.payment_method}</td>
                        <td>KES {payment.amount}</td>
                        <td>{payment.reference || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

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
