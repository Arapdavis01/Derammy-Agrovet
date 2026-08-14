import { useAuth } from '@/context/AuthContext';
import styles from './Topbar.module.css';

interface TopbarProps {
  user: any;
}

export default function Topbar({ user }: TopbarProps) {
  const { logout } = useAuth();

  return (
    <header className={styles.topbar}>
      <div className={styles.userInfo}>
        <span className={styles.avatar}>{user.fullName.charAt(0).toUpperCase()}</span>
        <span className={styles.name}>{user.fullName}</span>
        <span className={styles.role}>({user.role})</span>
      </div>
      <button onClick={logout} className={`btn btn-outline btn-sm ${styles.logoutBtn}`}>
        Logout
      </button>
    </header>
  );
}
