import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Customer {
  id: string;
  name: string;
  phone: string;
  credit_limit: number;
  credit_balance: number;
}

interface CreditSale {
  id: string;
  invoice_no: string;
  sale_date: string;
  total: number;
  payment_method: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
}

interface Payment {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference: string;
  customer: { id: string; name: string } | null;
  user: { id: string; full_name: string } | null;
}

export default function AdminCredit() {
  const { user } = useAuth();
  const router = useRouter();

  const [totalCustomers, setTotalCustomers] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [customersWithDebt, setCustomersWithDebt] = useState(0);
  const [todayCreditSales, setTodayCreditSales] = useState(0);
  const [todayPayments, setTodayPayments] = useState(0);

  const [recentCreditSales, setRecentCreditSales] = useState<CreditSale[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchAllData();
  }, [user]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch customers list
      const customersRes = await api.get('/customers', { params: { limit: 200 } });
      const customers = customersRes.data.data || [];
      setTotalCustomers(customers.length);

      // Fetch outstanding credit
      const outstandingRes = await api.get('/credit/outstanding');
      const outstandingList = outstandingRes.data || [];
      setOutstanding(outstandingList.reduce((sum: number, c: any) => sum + Number(c.credit_balance || 0), 0));
      setCustomersWithDebt(outstandingList.length);

      // Fetch today's credit sales
      const creditSalesRes = await api.get('/sales', {
        params: {
          payment_method: 'credit',
          start_date: today,
          end_date: today,
          limit: 200,
        },
      });
      const creditSales = creditSalesRes.data.data || [];
      setTodayCreditSales(creditSales.reduce((sum: number, s: any) => sum + Number(s.total), 0));

      // Fetch today's payments (need endpoint; assume /credit/payments?limit=200)
      try {
        const paymentsRes = await api.get('/credit/payments', { params: { limit: 200 } });
        const allPayments = paymentsRes.data.data || paymentsRes.data || [];
        const todayPaymentsList = allPayments.filter((p: any) => p.payment_date.startsWith(today));
        setTodayPayments(todayPaymentsList.reduce((sum: number, p: any) => sum + Number(p.amount), 0));

        // Recent payments (last 10)
        const recent = allPayments
          .sort((a: any, b: any) => b.payment_date.localeCompare(a.payment_date))
          .slice(0, 10);
        setRecentPayments(recent);
      } catch (payError) {
        // If endpoint missing, set zero and empty list
        setTodayPayments(0);
        setRecentPayments([]);
      }

      // Fetch recent credit sales (active debtors only, i.e., payment_status = 'credit' or credit balance > 0)
      const recentCreditSalesRes = await api.get('/sales', {
        params: {
          payment_method: 'credit',
          limit: 5,
        },
      });
      setRecentCreditSales(recentCreditSalesRes.data.data || []);
    } catch (error) {
      toast.error('Failed to load credit data');
    } finally {
      setLoading(false);
    }
  };

  // Filter payments based on search
  const filteredPayments = useMemo(() => {
    if (!searchTerm) return recentPayments;
    const term = searchTerm.toLowerCase();
    return recentPayments.filter(
      (p) =>
        p.customer?.name.toLowerCase().includes(term) ||
        p.reference?.toLowerCase().includes(term) ||
        p.payment_method.toLowerCase().includes(term)
    );
  }, [recentPayments, searchTerm]);

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>Credit Management</h1>
        <p>Manage customer credit accounts, debt limits, and payments</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mt-4">
        <div className="card summary-card">
          <i className="fas fa-users card-icon" style={{ color: '#1B5E20' }}></i>
          <h4>Total Customers</h4>
          <p className="summary-value">{totalCustomers}</p>
          <span className="summary-subtitle">Click to view</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Total Outstanding</h4>
          <p className="summary-value">KES {outstanding.toLocaleString()}</p>
          <span className="summary-subtitle">All customers</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-exclamation-triangle card-icon" style={{ color: '#D32F2F' }}></i>
          <h4>Customers with Debt</h4>
          <p className="summary-value">{customersWithDebt}</p>
          <span className="summary-subtitle">Click to view</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-calendar-day card-icon" style={{ color: '#0288D1' }}></i>
          <h4>Today Credit Sales</h4>
          <p className="summary-value">KES {todayCreditSales.toLocaleString()}</p>
          <span className="summary-subtitle">Today</span>
        </div>
        <div className="card summary-card">
          <i className="fas fa-hand-holding-usd card-icon" style={{ color: '#4CAF50' }}></i>
          <h4>Today Payments</h4>
          <p className="summary-value">KES {todayPayments.toLocaleString()}</p>
          <span className="summary-subtitle">Received today</span>
        </div>
      </div>

      {/* Recent Credit Sales */}
      <div className="dashboard-section">
        <h2><i className="fas fa-file-invoice-dollar" style={{ marginRight: '8px' }}></i>Recent Credit Sales</h2>
        <p className="text-muted">(Active Debtors Only)</p>
        {recentCreditSales.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentCreditSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.invoice_no}</td>
                  <td>{new Date(sale.sale_date).toLocaleString()}</td>
                  <td>{sale.customer?.name || 'Walk-in'}</td>
                  <td>KES {sale.total.toLocaleString()}</td>
                  <td>
                    <span className="status held">Credit</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-success mt-4">All debts are cleared!</p>
        )}
      </div>

      {/* Recent Debt Payments */}
      <div className="dashboard-section">
        <h2><i className="fas fa-receipt" style={{ marginRight: '8px' }}></i>Recent Debt Payments</h2>
        <p className="text-muted">Last 10</p>

        <div className="filters">
          <input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{ maxWidth: '300px' }}
          />
        </div>

        <p className="mt-2">Total: KES {filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0).toLocaleString()}</p>

        <table className="table mt-4">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Received By</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.map((payment) => (
              <tr key={payment.id}>
                <td>{new Date(payment.payment_date).toLocaleString()}</td>
                <td>{payment.customer?.name || '-'}</td>
                <td>KES {payment.amount.toLocaleString()}</td>
                <td>{payment.payment_method}</td>
                <td>{payment.user?.full_name || '-'}</td>
                <td>
                  <button className="btn btn-sm btn-outline">
                    <i className="fas fa-eye"></i> View
                  </button>
                </td>
              </tr>
            ))}
            {filteredPayments.length === 0 && (
              <tr><td colSpan={6} className="text-center">No payments found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
