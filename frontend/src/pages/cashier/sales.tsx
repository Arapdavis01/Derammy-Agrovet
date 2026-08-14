import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Sales.module.css';

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

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchSales();
  }, [user, page, filters]);

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

  const totalPages = Math.ceil(totalSales / limit);

  return (
    <Layout>
      <h1>My Sales</h1>
      {/* Filters simplified */}
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
        <button className="btn btn-outline" onClick={() => { setPage(1); fetchSales(); }}>Apply</button>
      </div>

      <table className="table mt-4">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Date</th>
            <th>Customer</th>
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
              <td>KES {sale.total.toLocaleString()}</td>
              <td>{sale.payment_method}</td>
              <td>
                <span className={`${styles.status} ${styles[sale.sale_status]}`}>{sale.sale_status}</span>
              </td>
              <td>
                <button className="btn btn-sm btn-outline" onClick={() => fetchSaleDetail(sale.id)}>View</button>
              </td>
            </tr>
          ))}
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
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Sale Details</h3>
            <p><strong>Invoice:</strong> {selectedSale.invoice_no}</p>
            <p><strong>Date:</strong> {new Date(selectedSale.sale_date).toLocaleString()}</p>
            <p><strong>Customer:</strong> {selectedSale.customer?.name || 'Walk-in'}</p>
            <p><strong>Total:</strong> KES {selectedSale.total}</p>
            <h4>Items</h4>
            <table className="table">
              <thead>
                <tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
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
            <button className="btn btn-outline" onClick={() => setSelectedSale(null)}>Close</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
