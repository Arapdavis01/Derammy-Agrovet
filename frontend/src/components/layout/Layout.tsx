import React from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useAuth } from '@/context/AuthContext';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="flex" style={{ minHeight: '100vh' }}>
      <Sidebar role={user.role} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar user={user} />
        <main style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
