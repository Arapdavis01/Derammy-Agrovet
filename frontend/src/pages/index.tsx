import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (user.role === 'cashier') {
          router.push('/cashier/dashboard');
        } else {
          router.push('/admin/dashboard');
        }
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return <div>Loading...</div>;
}
