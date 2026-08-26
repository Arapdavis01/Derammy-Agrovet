import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface User {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    password: '',
    role: 'cashier',
  });
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/admin/dashboard');
      return;
    }
    fetchUsers();
  }, [user]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddForm = () => {
    setEditingUser(null);
    setFormData({ fullName: '', username: '', password: '', role: 'cashier' });
    setShowForm(true);
  };

  const handleOpenEditForm = (user: User) => {
    setEditingUser(user);
    setFormData({
      fullName: user.full_name,
      username: user.username,
      password: '',
      role: user.role,
    });
    setShowForm(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitForm = async () => {
    if (!formData.fullName || !formData.username || !formData.role) {
      toast.error('Full Name, Username, and Role are required');
      return;
    }
    if (!editingUser && !formData.password) {
      toast.error('Password is required for new user');
      return;
    }

    try {
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, {
          fullName: formData.fullName,
          username: formData.username,
          role: formData.role,
        });
        toast.success('User updated');
      } else {
        await api.post('/users', {
          fullName: formData.fullName,
          username: formData.username,
          password: formData.password,
          role: formData.role,
        });
        toast.success('User created');
      }
      setShowForm(false);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save user');
    }
  };

  const handleDeactivate = async (id: string, currentStatus: string) => {
    if (!confirm(`Are you sure you want to ${currentStatus === 'active' ? 'deactivate' : 'activate'} this user?`)) return;
    try {
      if (currentStatus === 'active') {
        await api.put(`/users/${id}/deactivate`);
      } else {
        await api.put(`/users/${id}`, { status: 'active' });
      }
      toast.success('User status updated');
      fetchUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update user status');
    }
  };

  const handleResetPassword = (id: string) => {
    setResetPasswordUserId(id);
    setNewPassword('');
  };

  const submitResetPassword = async () => {
    if (!resetPasswordUserId || !newPassword) {
      toast.error('New password is required');
      return;
    }
    try {
      await api.post(`/users/${resetPasswordUserId}/reset-password`, { newPassword });
      toast.success('Password reset successfully');
      setResetPasswordUserId(null);
      setNewPassword('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to reset password');
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Manage All Users</h1>
          <p className="text-muted">Create, edit, and manage system users.</p>
        </div>
        <button className="btn btn-primary" onClick={handleOpenAddForm}>
          <i className="fas fa-user-plus" style={{ marginRight: '6px' }}></i> Add User
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Password</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>••••••</td>
                <td>
                  <span className={`status ${u.status === 'active' ? 'active' : 'inactive'}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => handleOpenEditForm(u)}>
                    <i className="fas fa-edit"></i> Edit
                  </button>
                  <button className="btn btn-sm btn-outline" onClick={() => handleResetPassword(u.id)}>
                    <i className="fas fa-key"></i> Reset
                  </button>
                  {u.status === 'active' ? (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(u.id, u.status)}>
                      <i className="fas fa-ban"></i> Deactivate
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => handleDeactivate(u.id, u.status)}>
                      <i className="fas fa-check"></i> Activate
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="text-center">No users found</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* User Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-user-cog"></i> {editingUser ? 'Edit User' : 'Add User'}
              </h3>
              <button className="modal-close" onClick={() => setShowForm(false)} aria-label="Close">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Full Name *</label>
                <input type="text" value={formData.fullName} onChange={(e) => handleFormChange('fullName', e.target.value)} className="input" placeholder="e.g., John Doe" />
              </div>
              <div className="form-group">
                <label>Username *</label>
                <input type="text" value={formData.username} onChange={(e) => handleFormChange('username', e.target.value)} className="input" placeholder="e.g., john" />
              </div>
              {!editingUser && (
                <div className="form-group">
                  <label>Password *</label>
                  <input type="password" value={formData.password} onChange={(e) => handleFormChange('password', e.target.value)} className="input" placeholder="Enter password" />
                </div>
              )}
              <div className="form-group">
                <label>Role</label>
                <select value={formData.role} onChange={(e) => handleFormChange('role', e.target.value)} className="input">
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitForm}>
                <i className="fas fa-save" style={{ marginRight: '6px' }}></i> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUserId && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-key"></i> Reset Password
              </h3>
              <button className="modal-close" onClick={() => setResetPasswordUserId(null)} aria-label="Close">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" placeholder="Enter new password" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setResetPasswordUserId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitResetPassword}>
                <i className="fas fa-check" style={{ marginRight: '6px' }}></i> Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
