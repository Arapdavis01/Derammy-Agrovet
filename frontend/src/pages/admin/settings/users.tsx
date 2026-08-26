import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface StaffUser {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
}

interface Cashier {
  id: string;
  full_name: string;
  status: string;
  created_at: string;
}

export default function AdminUsers() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'staff' | 'cashiers'>('staff');

  // Staff states
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [staffForm, setStaffForm] = useState({
    fullName: '',
    username: '',
    password: '',
    role: 'manager',
  });
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Cashier states
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loadingCashiers, setLoadingCashiers] = useState(false);
  const [showCashierForm, setShowCashierForm] = useState(false);
  const [editingCashier, setEditingCashier] = useState<Cashier | null>(null);
  const [cashierForm, setCashierForm] = useState({ fullName: '' });

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.push('/admin/dashboard');
      return;
    }
    if (activeTab === 'staff') {
      fetchStaffUsers();
    } else {
      fetchCashiers();
    }
  }, [user, activeTab]);

  // ========== STAFF FUNCTIONS ==========
  const fetchStaffUsers = async () => {
    setLoadingStaff(true);
    try {
      const res = await api.get('/users');
      setStaffUsers(res.data || []);
    } catch (error: any) {
      toast.error('Failed to fetch staff users');
    } finally {
      setLoadingStaff(false);
    }
  };

  const handleOpenStaffForm = (staff?: StaffUser) => {
    if (staff) {
      setEditingStaff(staff);
      setStaffForm({
        fullName: staff.full_name,
        username: staff.username,
        password: '',
        role: staff.role,
      });
    } else {
      setEditingStaff(null);
      setStaffForm({ fullName: '', username: '', password: '', role: 'manager' });
    }
    setShowStaffForm(true);
  };

  const handleStaffFormChange = (field: string, value: string) => {
    setStaffForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitStaffForm = async () => {
    if (!staffForm.fullName.trim() || !staffForm.username.trim()) {
      toast.error('Full name and username are required');
      return;
    }
    if (!editingStaff && !staffForm.password) {
      toast.error('Password is required for new staff');
      return;
    }
    try {
      if (editingStaff) {
        await api.put(`/users/${editingStaff.id}`, {
          fullName: staffForm.fullName,
          username: staffForm.username,
          role: staffForm.role,
        });
        toast.success('Staff updated');
      } else {
        await api.post('/users', {
          fullName: staffForm.fullName,
          username: staffForm.username,
          password: staffForm.password,
          role: staffForm.role,
        });
        toast.success('Staff created');
      }
      setShowStaffForm(false);
      fetchStaffUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save staff');
    }
  };

  const handleDeactivateStaff = async (id: string, currentStatus: string) => {
    if (!confirm(`Are you sure you want to ${currentStatus === 'active' ? 'deactivate' : 'activate'} this staff?`)) return;
    try {
      if (currentStatus === 'active') {
        await api.put(`/users/${id}/deactivate`);
      } else {
        await api.put(`/users/${id}`, { status: 'active' });
      }
      toast.success('Staff status updated');
      fetchStaffUsers();
    } catch (error: any) {
      toast.error('Failed to update staff status');
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
      toast.error('Failed to reset password');
    }
  };

  // ========== CASHIER FUNCTIONS ==========
  const fetchCashiers = async () => {
    setLoadingCashiers(true);
    try {
      const res = await api.get('/cashiers');
      setCashiers(res.data || []);
    } catch (error: any) {
      toast.error('Failed to fetch cashiers');
    } finally {
      setLoadingCashiers(false);
    }
  };

  const handleOpenCashierForm = (cashier?: Cashier) => {
    if (cashier) {
      setEditingCashier(cashier);
      setCashierForm({ fullName: cashier.full_name });
    } else {
      setEditingCashier(null);
      setCashierForm({ fullName: '' });
    }
    setShowCashierForm(true);
  };

  const submitCashierForm = async () => {
    if (!cashierForm.fullName.trim()) {
      toast.error('Cashier name is required');
      return;
    }
    try {
      if (editingCashier) {
        await api.put(`/cashiers/${editingCashier.id}`, { fullName: cashierForm.fullName });
        toast.success('Cashier updated');
      } else {
        await api.post('/cashiers', { fullName: cashierForm.fullName });
        toast.success('Cashier added');
      }
      setShowCashierForm(false);
      fetchCashiers();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save cashier');
    }
  };

  const handleDeactivateCashier = async (id: string, currentStatus: string) => {
    if (!confirm(`Are you sure you want to ${currentStatus === 'active' ? 'deactivate' : 'activate'} this cashier?`)) return;
    try {
      if (currentStatus === 'active') {
        await api.put(`/cashiers/${id}/deactivate`);
      } else {
        await api.put(`/cashiers/${id}/activate`);
      }
      toast.success('Cashier status updated');
      fetchCashiers();
    } catch (error: any) {
      toast.error('Failed to update cashier status');
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Manage Users</h1>
        <button
          className="btn btn-primary"
          onClick={() => (activeTab === 'staff' ? handleOpenStaffForm() : handleOpenCashierForm())}
        >
          <i className="fas fa-plus"></i>
          {activeTab === 'staff' ? ' Add Staff' : ' Add Cashier'}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${activeTab === 'staff' ? 'active' : ''}`} onClick={() => setActiveTab('staff')}>
          <i className="fas fa-user-shield"></i> Staff Accounts
        </button>
        <button className={`tab ${activeTab === 'cashiers' ? 'active' : ''}`} onClick={() => setActiveTab('cashiers')}>
          <i className="fas fa-user"></i> Cashiers
        </button>
      </div>

      {/* Staff Table */}
      {activeTab === 'staff' && (
        loadingStaff ? <p>Loading...</p> : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {staffUsers.map((staff) => (
                <tr key={staff.id}>
                  <td>{staff.full_name}</td>
                  <td>{staff.username}</td>
                  <td>{staff.role}</td>
                  <td><span className={`status ${staff.status}`}>{staff.status}</span></td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => handleOpenStaffForm(staff)}>Edit</button>
                    <button className="btn btn-sm btn-outline" onClick={() => handleResetPassword(staff.id)}>Reset Password</button>
                    {staff.status === 'active' ? (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeactivateStaff(staff.id, staff.status)}>Deactivate</button>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => handleDeactivateStaff(staff.id, staff.status)}>Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Cashiers Table */}
      {activeTab === 'cashiers' && (
        loadingCashiers ? <p>Loading...</p> : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cashiers.map((cashier) => (
                <tr key={cashier.id}>
                  <td>{cashier.full_name}</td>
                  <td><span className={`status ${cashier.status}`}>{cashier.status}</span></td>
                  <td>
                    <button className="btn btn-sm btn-outline" onClick={() => handleOpenCashierForm(cashier)}>Edit</button>
                    {cashier.status === 'active' ? (
                      <button className="btn btn-sm btn-danger" onClick={() => handleDeactivateCashier(cashier.id, cashier.status)}>Deactivate</button>
                    ) : (
                      <button className="btn btn-sm btn-primary" onClick={() => handleDeactivateCashier(cashier.id, cashier.status)}>Activate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* Staff Form Modal */}
      {showStaffForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-user-shield"></i> {editingStaff ? 'Edit Staff' : 'Add Staff'}</h3>
              <button className="modal-close" onClick={() => setShowStaffForm(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Full Name *</label>
                <input type="text" value={staffForm.fullName} onChange={(e) => handleStaffFormChange('fullName', e.target.value)} className="input" />
              </div>
              <div className="form-group">
                <label>Username *</label>
                <input type="text" value={staffForm.username} onChange={(e) => handleStaffFormChange('username', e.target.value)} className="input" />
              </div>
              {!editingStaff && (
                <div className="form-group">
                  <label>Password *</label>
                  <input type="password" value={staffForm.password} onChange={(e) => handleStaffFormChange('password', e.target.value)} className="input" />
                </div>
              )}
              <div className="form-group">
                <label>Role</label>
                <select value={staffForm.role} onChange={(e) => handleStaffFormChange('role', e.target.value)} className="input">
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowStaffForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitStaffForm}><i className="fas fa-save"></i> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Cashier Form Modal */}
      {showCashierForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-user"></i> {editingCashier ? 'Edit Cashier' : 'Add Cashier'}</h3>
              <button className="modal-close" onClick={() => setShowCashierForm(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Cashier Name *</label>
                <input type="text" value={cashierForm.fullName} onChange={(e) => setCashierForm({ fullName: e.target.value })} className="input" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowCashierForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitCashierForm}><i className="fas fa-save"></i> Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPasswordUserId && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title"><i className="fas fa-key"></i> Reset Password</h3>
              <button className="modal-close" onClick={() => setResetPasswordUserId(null)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <label>New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input" />
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
