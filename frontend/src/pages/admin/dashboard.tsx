import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Card from '@/components/ui/Card';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';

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
      <div className="welcome-heading">
        <h1>Welcome back, {user?.fullName}</h1>
        <p>Here's what's happening in your agrovet today.</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <Card 
          title="Inventory" 
          value={`KES ${stockValue.toLocaleString()}`} 
          subtitle={`${productsCount} items in stock | ${lowStockCount} low stock`}
          icon="fa-boxes-stacked" 
          color="#0F766E"
          onClick={() => router.push('/admin/inventory')}
        />
        <Card 
          title="Sales" 
          value={`KES ${totalSales.toLocaleString()}`} 
          subtitle={`Today: KES ${todaySales.toLocaleString()} (${todaySalesCount} sales)`}
          icon="fa-money-bill-trend-up" 
          color="#D97757"
          onClick={() => router.push('/admin/sales')}
        />
        <Card 
          title="Credit" 
          value={`KES ${creditOutstanding.toLocaleString()}`} 
          subtitle={`${creditCustomersCount} owing | Paid today: KES 0`}
          icon="fa-file-invoice-dollar" 
          color="#0EA5E9"
          onClick={() => router.push('/admin/credit')}
        />
        <Card 
          title="Returns/Exchanges" 
          value={returnsToday.toString()} 
          subtitle={`Today: ${returnsToday} returns | 0 exchanges`}
          icon="fa-rotate-left" 
          color="#F43F5E"
          onClick={() => router.push('/admin/returns')}
        />
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4">
        <Card 
          title="Purchases" 
          value={`${purchasesCount} POs`} 
          subtitle={`Today: KES 0 | 0 active today`}
          icon="fa-cart-shopping" 
          color="#F59E0B"
          onClick={() => router.push('/admin/purchases')}
        />
        <Card 
          title="Products" 
          value={productsCount.toString()} 
          subtitle={`${lowStockCount} low stock | ${expiringSoonCount} expiring soon`}
          icon="fa-tags" 
          color="#10B981"
          onClick={() => router.push('/admin/products')}
        />
        <Card 
          title="Reports" 
          value="Analytics" 
          subtitle="View analytics & reports"
          icon="fa-chart-line" 
          color="#8B5CF6"
          onClick={() => router.push('/admin/reports')}
        />
        <Card 
          title="Top Products Today" 
          value={topProductsToday.length > 0 ? topProductsToday[0]?.name : 'No sales yet'} 
          subtitle={topProductsToday.length > 0 ? `Quantity: ${topProductsToday[0]?.quantity}` : ''}
          icon="fa-star" 
          color="#EC4899"
          onClick={() => router.push('/admin/reports')}
        />
      </div>

      <div className="dashboard-section">
        <h2><i className="fas fa-users" style={{ marginRight: '8px' }}></i>Cashier Performance</h2>
        {cashierPerformance.length > 0 ? (
          <table className="table mt-4">
            <thead>
              <tr>
                <th>Cashier</th>
                <th>Today Sales</th>
                <th>Today Count</th>
                <th>Total Sales</th>
                <th>Total Count</th>
              </tr>
            </thead>
            <tbody>
              {cashierPerformance.map((c: any, index: number) => (
                <tr key={c.cashier_id || c.user_id || index}>
                  <td>{c.full_name || 'Unknown'}</td>
                  <td>KES {(c.today_sales || 0).toLocaleString()}</td>
                  <td>{c.today_count || 0} sales</td>
                  <td>KES {(c.total_sales || 0).toLocaleString()}</td>
                  <td>{c.total_count || 0} sales</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="alert alert-info mt-4">No cashier performance data available.</p>
        )}
      </div>

      <div className="dashboard-section">
        <h2><i className="fas fa-file-invoice-dollar" style={{ marginRight: '8px' }}></i>Credit Customers</h2>
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
