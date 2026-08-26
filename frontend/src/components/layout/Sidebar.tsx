import Link from 'next/link';
import { useRouter } from 'next/router';

interface SidebarProps {
  role: 'admin' | 'manager' | 'cashier';
}

export default function Sidebar({ role }: SidebarProps) {
  const router = useRouter();

  const adminLinks = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: 'fa-gauge' },
    { path: '/admin/inventory', label: 'Inventory', icon: 'fa-boxes-stacked' },
    { path: '/admin/sales', label: 'Sales', icon: 'fa-money-bill-trend-up' },
    { path: '/admin/returns', label: 'Returns', icon: 'fa-rotate-left' },
    { path: '/admin/credit', label: 'Credit', icon: 'fa-file-invoice-dollar' },
    { path: '/admin/purchases', label: 'Purchases', icon: 'fa-cart-shopping' },
    { path: '/admin/products', label: 'Products', icon: 'fa-tags' },
    { path: '/admin/reports', label: 'Reports', icon: 'fa-chart-line' },
    { path: '/admin/settings/users', label: 'Users', icon: 'fa-users' },
    { path: '/admin/settings/integrations', label: 'Integrations', icon: 'fa-plug' },
  ];

  const cashierLinks = [
    { path: '/cashier/dashboard', label: 'Dashboard', icon: 'fa-gauge' },
    { path: '/cashier/pos', label: 'POS', icon: 'fa-cash-register' },
    { path: '/cashier/sales', label: 'Sales', icon: 'fa-receipt' },
    { path: '/cashier/returns', label: 'Returns', icon: 'fa-rotate-left' },
    { path: '/cashier/credit', label: 'Credit', icon: 'fa-file-invoice-dollar' },
    { path: '/admin/purchases', label: 'Purchases', icon: 'fa-cart-shopping' },
  ];

  const links = role === 'cashier' ? cashierLinks : adminLinks;

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>DERAMMY</h1>
        <p>Agrovet</p>
      </div>
      <nav className="sidebar-nav">
        {links.map((link) => (
          <Link key={link.path} href={link.path}>
            <a className={`sidebar-link ${router.pathname === link.path ? 'active' : ''}`}>
              <i className={`fas ${link.icon} sidebar-icon`}></i>
              <span className="sidebar-text">{link.label}</span>
            </a>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
