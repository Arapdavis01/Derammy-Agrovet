import Layout from '@/components/layout/Layout';
import { useAuth } from '@/context/AuthContext';

export default function AdminDashboard() {
  const { user } = useAuth();
  return (
    <Layout>
      <h1>Admin Dashboard</h1>
      <p>Welcome back, {user?.fullName}</p>
      {/* We'll add cards and tables later */}
    </Layout>
  );
}
