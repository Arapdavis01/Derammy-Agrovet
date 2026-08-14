import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import styles from '@/styles/Dashboard.module.css';

export default function AdminDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<any>(null);
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
    fetchDashboard();
  }, [user]);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/dashboard/admin');
      setDashboard(res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Layout><div>Loading...</div></Layout>;

  const stockValue = dashboard?.stock_value || 0;
  const todaySales = dashboard?.today_sales || 0;
  const todaySalesCount = dashboard?.today_sales_count || 0;
  const totalSales = dashboard?.total_sales || 0;
  const creditOutstanding = dashboard?.credit_outstanding || 0;
  const creditCustomersCount = dashboard?.credit_customers_count || 0;
  const returnsToday = dashboard?.returns_today || 0;
  const purchasesCount = dashboard?.purchases_count || 0;
  const productsCount = dashboard?.products_count || 0;
  const lowStockCount = dashboard?.low_stock_count || 0;
  const expiringSoonCount = dashboard?.expiring_soon_count || 0;
  const cashierPerformance = dashboard?.cashier_performance || [];
  const creditCustomers = dashboard?.credit_customers || [];
  const topProductsToday = dashboard?.top_products_today || [];

  return (
    <Layout>
      <div className={styles.welcome}>
        <h1>Welcome back, {user?.fullName}</h1>
        <p>Here's what's happening in your agrovet today.</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <Card 
          title="Inventory" 
          value={`KES ${stockValue.toLocaleString()}`} 
          subtitle={`${productsCount} items in stock | ${lowStockCount} low stock`}
          icon="📦" 
          color="#1B5E20"
          onClick={() => router.push('/admin/inventory')}
        />
        <Card 
          title="Sales" 
          value={`KES ${totalSales.toLocaleString()}`} 
          subtitle={`Today: KES ${todaySales.toLocaleString()} (${todaySalesCount} sales)`}
          icon="💰" 
          color="#F57C00"
          onClick={() => router.push('/admin/sales')}
        />
        <Card 
          title="Credit" 
          value={`KES ${creditOutstanding.toLocaleString()}`} 
          subtitle={`${creditCustomersCount} owing | Paid today: KES 0`}
          icon="📝" 
          color="#0288D1"
          onClick={() => router.push('/admin/credit')}
        />
        <Card 
          title="Returns/Exchanges" 
          value={returnsToday.toString()} 
          subtitle={`Today: ${returnsToday} returns | 0 exchanges`}
          icon="↩️" 
          color="#D32F2F"
          onClick={() => router.push('/admin/returns')}
        />
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <Card 
          title="Purchases" 
          value={`${purchasesCount} POs`} 
          subtitle={`Today: KES 0 | 0 active today`}
          icon="🛒" 
          color="#FFA000"
          onClick={() => router.push('/admin/purchases')}
        />
        <Card 
          title="Products" 
          value={productsCount.toString()} 
          subtitle={`${lowStockCount} low stock | ${expiringSoonCount} expiring soon`}
          icon="🏷️" 
          color="#4CAF50"
          onClick={() => router.push('/admin/products')}
        />
        <Card 
          title="Reports" 
          value="Analytics" 
          subtitle="View analytics & reports"
          icon="📈" 
          color="#9C27B0"
          onClick={() => router.push('/admin/reports')}
        />
        <Card 
          title="Top Products Today" 
          value={topProductsToday.length > 0 ? topProductsToday[0]?.name : 'No sales yet'} 
          subtitle={topProductsToday.length > 0 ? `Quantity: ${topProductsToday[0]?.quantity}` : ''}
          icon="⭐" 
          color="#607D8B"
          onClick={() => router.push('/admin/reports')}
        />
      </div>

      <div className={styles.section}>
        <h2>Cashier Performance</h2>
        {cashierPerformance.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Username</th>
                <th>Today Sales</th>
                <th>Today Count</th>
                <th>Total Sales</th>
                <th>Total Count</th>
              </tr>
            </thead>
            <tbody>
              {cashierPerformance.map((c: any) => (
                <tr key={c.user_id}>
                  <td>{c.full_name}</td>
                  <td>{c.username || '-'}</td>
                  <td>KES {c.today_sales.toLocaleString()}</td>
                  <td>{c.today_count} sales</td>
                  <td>KES {c.total_sales.toLocaleString()}</td>
                  <td>{c.total_count} sales</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-info mt-4">No cashier performance data available.</p>
        )}
      </div>

      <div className={styles.section}>
        <h2>Credit Customers</h2>
        {creditCustomers.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Name</th>
                <th>Credit Balance</th>
                <th>Credit Limit</th>
              </tr>
            </thead>
            <tbody>
              {creditCustomers.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>KES {c.credit_balance.toLocaleString()}</td>
                  <td>KES {c.credit_limit.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-success mt-4">No outstanding debts. Great job!</p>
        )}
      </div>
    </Layout>
  );
}
