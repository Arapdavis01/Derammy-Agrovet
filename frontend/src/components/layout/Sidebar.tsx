import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from './Sidebar.module.css';

interface SidebarProps {
  role: 'admin' | 'manager' | 'cashier';
}

export default function Sidebar({ role }: SidebarProps) {
  const router = useRouter();

  const adminLinks = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/admin/inventory', label: 'Inventory', icon: '📦' },
    { path: '/admin/sales', label: 'Sales', icon: '💰' },
    { path: '/admin/returns', label: 'Returns', icon: '↩️' },
    { path: '/admin/credit', label: 'Credit', icon: '📝' },
    { path: '/admin/purchases', label: 'Purchases', icon: '🛒' },
    { path: '/admin/products', label: 'Products', icon: '🏷️' },
    { path: '/admin/reports', label: 'Reports', icon: '📈' },
    { path: '/admin/settings/users', label: 'Users', icon: '👥' },
    { path: '/admin/settings/integrations', label: 'Integrations', icon: '🔌' },
  ];

  const cashierLinks = [
    { path: '/cashier/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/cashier/pos', label: 'POS', icon: '🧾' },
    { path: '/cashier/sales', label: 'My Sales', icon: '💰' },
    { path: '/cashier/returns', label: 'Returns', icon: '↩️' },
    { path: '/cashier/credit', label: 'Credit', icon: '📝' },
  ];

  const links = role === 'cashier' ? cashierLinks : adminLinks;

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <h1>DERAMMY</h1>
        <p>Agrovet</p>
      </div>
      <nav className={styles.nav}>
        {links.map((link) => (
          <Link key={link.path} href={link.path}>
            <a className={`${styles.link} ${router.pathname === link.path ? styles.active : ''}`}>
              <span className={styles.icon}>{link.icon}</span>
              <span>{link.label}</span>
            </a>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
