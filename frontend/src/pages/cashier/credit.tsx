import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

export default function CashierCredit() {
  const { user } = useAuth();
  const router = useRouter();
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'mpesa' | 'bank'>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'cashier') {
      router.push('/admin/dashboard');
      return;
    }
    fetchOutstanding();
  }, [user]);

  const fetchOutstanding = async () => {
    setLoading(true);
    try {
      const res = await api.get('/credit/outstanding');
      setCustomers(res.data);
    } catch (error: any) {
      toast.error('Failed to fetch outstanding credit');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = (customer: any) => {
    setSelectedCustomer(customer);
    setShowPaymentModal(true);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentReference('');
  };

  const submitPayment = async () => {
    if (!selectedCustomer) return;
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/credit/payments', {
        customer_id: selectedCustomer.id,
        amount: parseFloat(paymentAmount),
        payment_method: paymentMethod,
        reference: paymentReference || undefined,
      });
      toast.success('Payment recorded successfully');
      setShowPaymentModal(false);
      fetchOutstanding();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <h1>
        <i className="fas fa-file-invoice-dollar" style={{ marginRight: '8px' }}></i>
        Credit Customers with Debt
      </h1>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="table mt-4">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Credit Balance</th>
              <th>Credit Limit</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td>{customer.name}</td>
                <td>{customer.phone || '-'}</td>
                <td style={{ color: 'red', fontWeight: 'bold' }}>
                  KES {customer.credit_balance.toLocaleString()}
                </td>
                <td>KES {customer.credit_limit.toLocaleString()}</td>
                <td>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleRecordPayment(customer)}
                  >
                    <i className="fas fa-hand-holding-usd" style={{ marginRight: '4px' }}></i>
                    Record Payment
                  </button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center">
                  No outstanding debt. Great job!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>
              <i className="fas fa-money-bill-wave" style={{ marginRight: '8px' }}></i>
              Record Payment
            </h3>
            <p><strong>Customer:</strong> {selectedCustomer.name}</p>
            <p><strong>Current Balance:</strong> KES {selectedCustomer.credit_balance}</p>
            <div className="flex flex-col gap-2">
              <label>Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="input"
              />
              <label>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="input"
              >
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="bank">Bank</option>
              </select>
              <label>Reference (optional)</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                className="input"
                placeholder="e.g., M-Pesa code"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitPayment} disabled={submitting}>
                {submitting ? 'Processing...' : 'Submit Payment'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
