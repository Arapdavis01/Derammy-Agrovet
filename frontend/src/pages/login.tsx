import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedInUser = await login(username, password);
      if (loggedInUser.role === 'cashier') {
        router.push('/cashier/dashboard');
      } else {
        router.push('/admin/dashboard');
      }
      toast.success('Login successful');
    } catch (error: any) {
      const message = error.response?.data?.error || 'Invalid username or password';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-brand">
          <i className="fas fa-leaf" style={{ marginRight: '8px' }}></i>
          DERAMMY AGROVET
        </h1>
        <p className="login-subtitle">Quality Farm Inputs & Veterinary Supplies</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div>
            <label htmlFor="username">
              <i className="fas fa-user" style={{ marginRight: '6px' }}></i>
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input"
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="password">
              <i className="fas fa-lock" style={{ marginRight: '6px' }}></i>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                required
                autoComplete="current-password"
                style={{ paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#757575',
                  fontSize: '1.1rem',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: '6px' }}></i>
                Logging in...
              </>
            ) : (
              <>
                <i className="fas fa-sign-in-alt" style={{ marginRight: '6px' }}></i>
                Login
              </>
            )}
          </button>
        </form>

        <p className="login-footer">
          © {new Date().getFullYear()} Derammy Agrovet. All rights reserved.
        </p>
      </div>
    </div>
  );
}
