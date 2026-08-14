import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Credit.module.css';

interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  credit_limit: number;
  credit_balance: number;
  status: string;
}

interface LedgerEntry {
  type: string; // 'sale' | 'payment' | 'return'
  date: string;
  description: string;
  amount: number;
  balance: number;
}

interface AgingEntry {
  customer_id: string;
  name: string;
  balance: number;
  oldest_credit_date: string;
  age_days: number;
  bucket: string;
}

export default function AdminCredit() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'outstanding' | 'all' | 'aging'>('outstanding');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [agingData, setAgingData] = useState<AgingEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledger, setLedger] = useState<any>(null);
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
    if (user.role === 'cashier') {
      router.push('/cashier/dashboard');
      return;
    }
    fetchData();
  }, [user, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'outstanding') {
        const res = await api.get('/credit/outstanding');
        setCustomers(res.data);
      } else if (activeTab === 'all') {
        const res = await api.get('/customers');
        setAllCustomers(res.data.data);
      } else if (activeTab === 'aging') {
        const res = await api.get('/credit/aging');
        setAgingData(res.data);
      }
    } catch (error: any) {
      toast.error('Failed to fetch credit data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewLedger = async (customerId: string) => {
    try {
      const res = await api.get(`/credit/customers/${customerId}/ledger`);
      setLedger(res.data);
      setSelectedCustomer(res.data.customer);
    } catch (error: any) {
      toast.error('Failed to fetch ledger');
    }
  };

  const handleRecordPayment = (customer: Customer) => {
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
      fetchData();
      if (ledger) handleViewLedger(selectedCustomer.id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const renderOutstanding = () => (
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Credit Balance</th>
          <th>Credit Limit</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {customers.map((customer) => (
          <tr key={customer.id}>
            <td>{customer.name}</td>
            <td>{customer.phone || '-'}</td>
            <td style={{ color: 'red', fontWeight: 'bold' }}>KES {customer.credit_balance.toLocaleString()}</td>
            <td>KES {customer.credit_limit.toLocaleString()}</td>
            <td>
              <button className="btn btn-sm btn-outline" onClick={() => handleViewLedger(customer.id)}>Ledger</button>
              <button className="btn btn-sm btn-primary" onClick={() => handleRecordPayment(customer)}>Record Payment</button>
            </td>
          </tr>
        ))}
        {customers.length === 0 && (
          <tr><td colSpan={5} className="text-center">No outstanding credit</td></tr>
        )}
      </tbody>
    </table>
  );

  const renderAllCustomers = () => (
    <table className="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Credit Limit</th>
          <th>Credit Balance</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {allCustomers.map((customer) => (
          <tr key={customer.id}>
            <td>{customer.name}</td>
            <td>{customer.phone || '-'}</td>
            <td>KES {customer.credit_limit.toLocaleString()}</td>
            <td>KES {customer.credit_balance.toLocaleString()}</td>
            <td>{customer.status}</td>
            <td>
              <button className="btn btn-sm btn-outline" onClick={() => handleViewLedger(customer.id)}>Ledger</button>
              {customer.credit_balance > 0 && (
                <button className="btn btn-sm btn-primary" onClick={() => handleRecordPayment(customer)}>Record Payment</button>
              )}
            </td>
          </tr>
        ))}
        {allCustomers.length === 0 && (
          <tr><td colSpan={6} className="text-center">No customers found</td></tr>
        )}
      </tbody>
    </table>
  );

  const renderAging = () => (
    <table className="table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Balance</th>
          <th>Oldest Credit Date</th>
          <th>Age (days)</th>
          <th>Bucket</th>
        </tr>
      </thead>
      <tbody>
        {agingData.map((entry) => (
          <tr key={entry.customer_id}>
            <td>{entry.name}</td>
            <td>KES {entry.balance.toLocaleString()}</td>
            <td>{entry.oldest_credit_date ? new Date(entry.oldest_credit_date).toLocaleDateString() : 'N/A'}</td>
            <td>{entry.age_days}</td>
            <td>{entry.bucket}</td>
          </tr>
        ))}
        {agingData.length === 0 && (
          <tr><td colSpan={5} className="text-center">No aging data</td></tr>
        )}
      </tbody>
    </table>
  );

  return (
    <Layout>
      <h1>Credit Management</h1>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'outstanding' ? styles.active : ''}`}
          onClick={() => setActiveTab('outstanding')}
        >
          Outstanding
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Customers
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'aging' ? styles.active : ''}`}
          onClick={() => setActiveTab('aging')}
        >
          Credit Aging
        </button>
      </div>

      {loading ? <p>Loading...</p> : (
        <>
          {activeTab === 'outstanding' && renderOutstanding()}
          {activeTab === 'all' && renderAllCustomers()}
          {activeTab === 'aging' && renderAging()}
        </>
      )}

      {/* Ledger Modal */}
      {ledger && selectedCustomer && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Ledger: {selectedCustomer.name}</h3>
            <p><strong>Balance:</strong> KES {selectedCustomer.credit_balance}</p>
            <p><strong>Credit Limit:</strong> KES {selectedCustomer.credit_limit}</p>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {/* Sales */}
                {ledger.sales?.map((sale: any) => (
                  <tr key={`sale-${sale.id}`}>
                    <td>{new Date(sale.sale_date).toLocaleDateString()}</td>
                    <td>Sale {sale.invoice_no}</td>
                    <td>KES {sale.total}</td>
                    <td>Sale</td>
                  </tr>
                ))}
                {/* Payments */}
                {ledger.payments?.map((payment: any) => (
                  <tr key={`pay-${payment.id}`}>
                    <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                    <td>Payment {payment.reference ? `(${payment.reference})` : ''}</td>
                    <td>KES {payment.amount}</td>
                    <td>Payment</td>
                  </tr>
                ))}
                {/* Returns */}
                {ledger.returns?.map((ret: any) => (
                  <tr key={`ret-${ret.id}`}>
                    <td>{new Date(ret.return_date).toLocaleDateString()}</td>
                    <td>Return (Credit Note)</td>
                    <td>KES {ret.total_refund}</td>
                    <td>Return</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-outline" onClick={() => setLedger(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedCustomer && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Record Payment</h3>
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
              <button className="btn btn-outline" onClick={() => setShowPaymentModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
