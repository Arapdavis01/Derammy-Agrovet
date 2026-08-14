import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import styles from '@/styles/Dashboard.module.css';

export default function CashierDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    const date = new Date();
    setToday(date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    fetchDashboard();
  }, [user]);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/dashboard/cashier');
      setDashboard(res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Layout><div>Loading...</div></Layout>;

  const myTodaySales = dashboard?.my_today_sales || 0;
  const myTodayCount = dashboard?.my_today_count || 0;
  const myTotalSales = dashboard?.my_total_sales || 0;
  const myTotalCount = dashboard?.my_total_count || 0;
  const availableProducts = dashboard?.available_products || 0;
  const totalUnits = dashboard?.total_units || 0;
  const outstandingDebt = dashboard?.outstanding_debt || 0;
  const outstandingCustomersCount = dashboard?.outstanding_customers_count || 0;
  const creditCustomers = dashboard?.credit_customers || [];

  return (
    <Layout>
      <div className={styles.welcome}>
        <h1>Welcome, {user?.fullName}!</h1>
        <p>{today}</p>
      </div>

      <button 
        className="btn btn-primary" 
        style={{ padding: '1rem 2rem', fontSize: '1.25rem', marginBottom: '2rem' }}
        onClick={() => router.push('/cashier/pos')}
      >
        START NEW SALE (POS)
      </button>

      <div className="grid grid-cols-4 gap-4">
        <Card 
          title="My Today Sales" 
          value={`KES ${myTodaySales.toLocaleString()}`} 
          subtitle={`${myTodayCount} transactions`}
          icon="💰" 
          color="#F57C00"
          onClick={() => router.push('/cashier/sales')}
        />
        <Card 
          title="My Total Sales" 
          value={`KES ${myTotalSales.toLocaleString()}`} 
          subtitle={`${myTotalCount} transactions`}
          icon="📊" 
          color="#1B5E20"
          onClick={() => router.push('/cashier/sales')}
        />
        <Card 
          title="Available Products" 
          value={availableProducts.toString()} 
          subtitle={`${totalUnits} units in stock`}
          icon="📦" 
          color="#4CAF50"
        />
        <Card 
          title="Outstanding Debt" 
          value={`KES ${outstandingDebt.toLocaleString()}`} 
          subtitle={`${outstandingCustomersCount} customers with debt`}
          icon="📝" 
          color="#D32F2F"
          onClick={() => router.push('/cashier/credit')}
        />
      </div>

      <div className={styles.section}>
        <h2>Credit Customers with Debt</h2>
        {creditCustomers.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Name</th>
                <th>Credit Balance</th>
              </tr>
            </thead>
            <tbody>
              {creditCustomers.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>KES {c.credit_balance.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-success mt-4">No customers with outstanding debt. Great job!</p>
        )}
      </div>

      <div className={styles.quickLinks}>
        <h2>Quick Links</h2>
        <div className="flex gap-4 mt-4">
          <button className="btn btn-outline" onClick={() => router.push('/cashier/pos')}>New Sale</button>
          <button className="btn btn-outline" onClick={() => router.push('/cashier/sales')}>My Sales</button>
          <button className="btn btn-outline" onClick={() => router.push('/cashier/returns')}>Returns</button>
        </div>
      </div>
    </Layout>
  );
}
