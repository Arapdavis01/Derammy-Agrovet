import Layout from '@/components/layout/Layout';
import { useAuth } from '@/context/AuthContext';

export default function CashierDashboard() {
  const { user } = useAuth();
  return (
    <Layout>
      <h1>Cashier Dashboard</h1>
      <p>Welcome, {user?.fullName}!</p>
      <button className="btn btn-primary">START NEW SALE (POS)</button>
    </Layout>
  );
}
