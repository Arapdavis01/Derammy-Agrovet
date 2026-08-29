import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface Cashier {
  id: string;
  full_name: string;
}

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
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedCashierId, setSelectedCashierId] = useState('');
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);

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
    fetchCashiers();
  }, [user]);

  const fetchOutstanding = async () => {
    setLoading(true);
    try {
      const res = await api.get('/credit/outstanding');
      console.log('Outstanding credit response:', res.data);
      setCustomers(Array.isArray(res.data) ? res.data : (res.data.data || []));
    } catch (error: any) {
      console.error('Failed to fetch outstanding credit:', error);
      if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        router.push('/login');
      } else {
        toast.error('Failed to fetch outstanding credit. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCashiers = async () => {
    try {
      const res = await api.get('/cashiers/active');
      console.log('Cashiers response:', res.data);
      setCashiers(Array.isArray(res.data) ? res.data : (res.data.data || []));
    } catch (error) {
      console.error('Failed to fetch cashiers:', error);
      // Silently fail for cashiers - not critical
    }
  };

  const handleRecordPayment = (customer: any) => {
    setSelectedCustomer(customer);
    setShowPaymentModal(true);
    setPaymentAmount('');
    setPaymentMethod('cash');
    setPaymentReference('');
    setSelectedCashierId('');
  };

  const handleSubmitPayment = () => {
    if (!selectedCustomer) return;
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (parseFloat(paymentAmount) > Number(selectedCustomer.credit_balance)) {
      toast.error('Payment amount cannot exceed credit balance');
      return;
    }

    // Store payment data and show cashier selection modal
    setPendingPaymentData({
      customer_id: selectedCustomer.id,
      amount: parseFloat(paymentAmount),
      payment_method: paymentMethod,
      reference: paymentReference || undefined,
    });
    setShowPaymentModal(false);
    setShowCashierModal(true);
  };

  const confirmCashierAndSubmit = async () => {
    if (!selectedCashierId) {
      toast.error('Select your name to confirm payment');
      return;
    }

    setSubmitting(true);
    try {
      // Try different payload structures to match backend expectations
      const payload = {
        customer_id: pendingPaymentData.customer_id,
        amount: pendingPaymentData.amount,
        payment_method: pendingPaymentData.payment_method,
        reference: pendingPaymentData.reference,
        cashier_id: selectedCashierId,
        received_by: selectedCashierId, // Alternative field name
        payment_date: new Date().toISOString(),
        notes: `Payment recorded by cashier`,
      };

      console.log('Sending payment payload:', payload);

      const res = await api.post('/credit/payments', payload);
      
      console.log('Payment response:', res.data);
      
      toast.success('Payment recorded successfully');
      setShowCashierModal(false);
      setPendingPaymentData(null);
      fetchOutstanding();
    } catch (error: any) {
      console.error('Failed to record payment:', error);
      console.error('Error response:', error.response?.data);
      
      if (error.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        router.push('/login');
      } else if (error.response?.status === 400) {
        toast.error(error.response?.data?.error || 'Invalid payment data');
      } else if (error.response?.status === 404) {
        toast.error('Payment endpoint not found. Please contact support.');
      } else {
        toast.error(error.response?.data?.error || error.response?.data?.message || 'Failed to record payment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>
            <i className="fas fa-file-invoice-dollar" style={{ marginRight: '8px' }}></i>
            Credit Customers with Debt
          </h1>
          <p className="text-muted">Manage and record payments for customers with outstanding balances.</p>
        </div>
        <button className="btn btn-outline" onClick={fetchOutstanding} title="Refresh">
          <i className="fas fa-refresh" style={{ marginRight: '6px' }}></i> Refresh
        </button>
      </div>

      {loading ? (
        <div className="pos-loading-state">
          <div className="spinner"></div>
          <p>Loading credit customers...</p>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="flex justify-between items-center mb-2">
              <h3 className="card-title" style={{ marginBottom: '0' }}>
                <i className="fas fa-users" style={{ marginRight: '8px' }}></i>
                Outstanding Debtors ({customers.length})
              </h3>
              <div className="text-muted">
                Total Outstanding: <strong style={{ color: 'red' }}>
                  {formatCurrency(customers.reduce((sum, c) => sum + Number(c.credit_balance || 0), 0))}
                </strong>
              </div>
            </div>
          </div>

          {customers.length === 0 ? (
            <div className="alert alert-success mt-4">
              <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
              No outstanding debt. Great job!
            </div>
          ) : (
            <div className="table-responsive mt-4">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Credit Balance</th>
                    <th>Credit Limit</th>
                    <th>Available Credit</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => {
                    const creditBalance = Number(customer.credit_balance || 0);
                    const creditLimit = Number(customer.credit_limit || 0);
                    const availableCredit = Math.max(0, creditLimit - creditBalance);
                    
                    return (
                      <tr key={customer.id}>
                        <td>
                          <strong>{customer.name}</strong>
                        </td>
                        <td>{customer.phone || '-'}</td>
                        <td style={{ color: 'red', fontWeight: 'bold' }}>
                          {formatCurrency(creditBalance)}
                        </td>
                        <td>{formatCurrency(creditLimit)}</td>
                        <td style={{ color: availableCredit > 0 ? 'green' : 'orange' }}>
                          {formatCurrency(availableCredit)}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleRecordPayment(customer)}
                            disabled={creditBalance <= 0}
                          >
                            <i className="fas fa-hand-holding-usd" style={{ marginRight: '4px' }}></i>
                            Record Payment
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-money-bill-wave" style={{ marginRight: '8px' }}></i>
                Record Payment
              </h3>
              <button className="modal-close" onClick={() => setShowPaymentModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="card mb-3" style={{ background: '#f8f9fa', border: '1px solid #dee2e6' }}>
                <p><strong>Customer:</strong> {selectedCustomer.name}</p>
                <p><strong>Phone:</strong> {selectedCustomer.phone || '-'}</p>
                <p>
                  <strong>Current Balance:</strong>{' '}
                  <span style={{ color: 'red', fontWeight: 'bold' }}>
                    {formatCurrency(Number(selectedCustomer.credit_balance || 0))}
                  </span>
                </p>
              </div>

              <div className="form-group">
                <label htmlFor="paymentAmount">
                  <i className="fas fa-coins" style={{ marginRight: '4px' }}></i>
                  Amount to Pay *
                </label>
                <input
                  id="paymentAmount"
                  type="number"
                  min="0"
                  max={selectedCustomer.credit_balance}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="input"
                  placeholder="Enter amount"
                  onFocus={(e) => e.target.select()}
                />
                {paymentAmount && parseFloat(paymentAmount) > 0 && (
                  <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '4px' }}>
                    Remaining balance after payment:{' '}
                    <strong>
                      {formatCurrency(Math.max(0, Number(selectedCustomer.credit_balance) - parseFloat(paymentAmount)))}
                    </strong>
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="paymentMethod">
                  <i className="fas fa-credit-card" style={{ marginRight: '4px' }}></i>
                  Payment Method
                </label>
                <select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="input"
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="bank">Bank</option>
                </select>
              </div>

              {(paymentMethod === 'mpesa' || paymentMethod === 'bank') && (
                <div className="form-group">
                  <label htmlFor="paymentReference">
                    <i className="fas fa-receipt" style={{ marginRight: '4px' }}></i>
                    Reference Number {paymentMethod === 'mpesa' ? '(M-Pesa Code)' : '(Transaction ID)'}
                  </label>
                  <input
                    id="paymentReference"
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    className="input"
                    placeholder={paymentMethod === 'mpesa' ? 'e.g., SFH1234567' : 'e.g., TRX987654'}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSubmitPayment} disabled={submitting}>
                <i className="fas fa-check" style={{ marginRight: '4px' }}></i>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cashier Selection Modal */}
      {showCashierModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-user-check" style={{ marginRight: '8px' }}></i>
                Confirm Cashier
              </h3>
              <button className="modal-close" onClick={() => setShowCashierModal(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <p>Who is recording this payment?</p>
              {pendingPaymentData && (
                <div className="card mb-3" style={{ background: '#f8f9fa', border: '1px solid #dee2e6' }}>
                  <p><strong>Customer:</strong> {selectedCustomer?.name}</p>
                  <p><strong>Amount:</strong> {formatCurrency(pendingPaymentData.amount)}</p>
                  <p><strong>Method:</strong> {pendingPaymentData.payment_method.toUpperCase()}</p>
                  {pendingPaymentData.reference && (
                    <p><strong>Reference:</strong> {pendingPaymentData.reference}</p>
                  )}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="cashierSelect">Select Your Name *</label>
                <select
                  id="cashierSelect"
                  value={selectedCashierId}
                  onChange={(e) => setSelectedCashierId(e.target.value)}
                  className="input"
                >
                  <option value="">Select cashier...</option>
                  {cashiers.map((cashier) => (
                    <option key={cashier.id} value={cashier.id}>
                      {cashier.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => {
                setShowCashierModal(false);
                setShowPaymentModal(true);
              }}>
                Back
              </button>
              <button className="btn btn-primary" onClick={confirmCashierAndSubmit} disabled={submitting}>
                {submitting ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
