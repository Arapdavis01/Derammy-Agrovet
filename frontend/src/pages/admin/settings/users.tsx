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
    setFormData({ fullName: '', role: 'cashier' });
    setShowForm(true);
  };

  const handleOpenEditForm = (user: User) => {
    setEditingUser(user);
    setFormData({
      fullName: user.full_name,
      role: user.role,
    });
    setShowForm(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitForm = async () => {
    if (!formData.fullName.trim()) {
      toast.error('Cashier name is required');
      return;
    }

    try {
      if (editingUser) {
        // For editing, update name and role
        await api.put(`/users/${editingUser.id}`, {
          fullName: formData.fullName,
          role: formData.role,
        });
        toast.success('User updated');
      } else {
        // For adding cashier, no username/password needed
        await api.post('/users', {
          fullName: formData.fullName,
          username: `cashier_${Date.now()}`, // unique temporary username
          password: 'cashier123', // default password (unused for shared cashier)
          role: 'cashier',
        });
        toast.success('Cashier added');
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
        <h1>Manage Users</h1>
        <button className="btn btn-primary" onClick={handleOpenAddForm}>
          <i className="fas fa-user-plus" style={{ marginRight: '6px' }}></i> Add Cashier
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.role}</td>
                <td>
                  <span className={`status ${u.status === 'active' ? 'active' : 'inactive'}`}>
                    {u.status}
                  </span>
                </td>
                <td>
                  <button className="btn btn-sm btn-outline" onClick={() => handleOpenEditForm(u)}>
                    <i className="fas fa-edit"></i> Edit
                  </button>
                  {u.status === 'active' ? (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDeactivate(u.id, u.status)}>Deactivate</button>
                  ) : (
                    <button className="btn btn-sm btn-primary" onClick={() => handleDeactivate(u.id, u.status)}>Activate</button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={4} className="text-center">No users found</td></tr>
            )}
          </tbody>
        </table>
      )}

      {/* Add/Edit User Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-user-plus"></i> {editingUser ? 'Edit User' : 'Add Cashier'}
              </h3>
              <button className="modal-close" onClick={() => setShowForm(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label><i className="fas fa-user"></i> Full Name *</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => handleFormChange('fullName', e.target.value)}
                  className="input"
                  placeholder="e.g., Antony Kimutai"
                  autoFocus
                />
              </div>
              {editingUser && (
                <div className="form-group">
                  <label><i className="fas fa-user-tag"></i> Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => handleFormChange('role', e.target.value)}
                    className="input"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitForm}>
                <i className="fas fa-save"></i> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal – only for admin/manager accounts if needed */}
      {resetPasswordUserId && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-key"></i> Reset Password</h3>
              <button className="modal-close" onClick={() => setResetPasswordUserId(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setResetPasswordUserId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitResetPassword}>Reset</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
