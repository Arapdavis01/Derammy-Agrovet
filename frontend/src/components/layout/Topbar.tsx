import { useAuth } from '@/context/AuthContext';

interface TopbarProps {
  user: any;
}

export default function Topbar({ user }: TopbarProps) {
  const { logout } = useAuth();

  return (
    <header className="topbar">
      <div className="topbar-user">
        <span className="topbar-avatar">{user.fullName.charAt(0).toUpperCase()}</span>
        <span className="topbar-name">{user.fullName}</span>
        <span className="topbar-role">({user.role})</span>
      </div>
      <button onClick={logout} className="btn btn-outline btn-sm topbar-logout">
        <i className="fas fa-sign-out-alt" style={{ marginRight: '4px' }}></i>
        Logout
      </button>
    </header>
  );
}
