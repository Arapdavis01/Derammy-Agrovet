import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import styles from '@/styles/Inventory.module.css';

interface Product {
  id: string;
  name: string;
  sku: string;
  unit: string;
  reorder_level: number;
  track_batch_expiry: boolean;
  category?: { id: string; name: string };
  total_stock: number;
  is_low_stock: boolean;
  stock_batches?: {
    id: string;
    batch_number: string | null;
    expiry_date: string | null;
    quantity_remaining: number;
  }[];
}

interface Movement {
  id: string;
  product_id: string;
  batch_id: string | null;
  movement_type: string;
  quantity: number;
  reference_id: string | null;
  user_id: string;
  created_at: string;
  product: { id: string; name: string; unit: string };
  user: { id: string; full_name: string };
}

interface ExpiringBatch {
  id: string;
  product_id: string;
  batch_number: string | null;
  expiry_date: string;
  quantity_remaining: number;
  product: { id: string; name: string; unit: string };
}

export default function Inventory() {
  const { user } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'levels' | 'low' | 'expiring' | 'movements'>('levels');
  const [stockLevels, setStockLevels] = useState<Product[]>([]);
  const [lowStock, setLowStock] = useState<Product[]>([]);
  const [expiring, setExpiring] = useState<ExpiringBatch[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Adjust modal state
  const [adjustProductId, setAdjustProductId] = useState('');
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustBatchId, setAdjustBatchId] = useState('');
  const [productBatches, setProductBatches] = useState<any[]>([]);

  // Movement filters
  const [movementProductId, setMovementProductId] = useState('');
  const [movementType, setMovementType] = useState('');
  const [movementStartDate, setMovementStartDate] = useState('');
  const [movementEndDate, setMovementEndDate] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [movementTotal, setMovementTotal] = useState(0);

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
      if (activeTab === 'levels') {
        const res = await api.get('/inventory');
        setStockLevels(res.data);
      } else if (activeTab === 'low') {
        const res = await api.get('/inventory/low-stock');
        setLowStock(res.data);
      } else if (activeTab === 'expiring') {
        const res = await api.get('/inventory/expiring-soon', { params: { days: 30 } });
        setExpiring(res.data);
      } else if (activeTab === 'movements') {
        fetchMovements();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovements = async (page = movementPage) => {
    try {
      const params: any = { page, limit: 20 };
      if (movementProductId) params.product_id = movementProductId;
      if (movementType) params.type = movementType;
      if (movementStartDate) params.start_date = movementStartDate;
      if (movementEndDate) params.end_date = movementEndDate;
      const res = await api.get('/inventory/movements', { params });
      setMovements(res.data.data);
      setMovementTotal(res.data.total);
      setMovementPage(res.data.page);
    } catch (error: any) {
      toast.error('Failed to fetch movements');
    }
  };

  const handleAdjustClick = async (product?: Product) => {
    if (product) {
      setAdjustProductId(product.id);
      // If product tracks batch, load batches
      if (product.track_batch_expiry) {
        const res = await api.get(`/inventory/batches/${product.id}`);
        setProductBatches(res.data);
      } else {
        setProductBatches([]);
      }
    } else {
      setAdjustProductId('');
      setProductBatches([]);
    }
    setAdjustQuantity('');
    setAdjustReason('');
    setAdjustBatchId('');
    setShowAdjustModal(true);
  };

  const submitAdjust = async () => {
    if (!adjustProductId || !adjustQuantity || !adjustReason) {
      toast.error('Please fill all required fields');
      return;
    }
    const qty = parseFloat(adjustQuantity);
    if (isNaN(qty) || qty === 0) {
      toast.error('Quantity must be non-zero');
      return;
    }
    try {
      await api.post('/inventory/adjust', {
        product_id: adjustProductId,
        quantity: qty,
        reason: adjustReason,
        batch_id: adjustBatchId || undefined,
      });
      toast.success('Stock adjusted successfully');
      setShowAdjustModal(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to adjust stock');
    }
  };

  const renderStockLevels = () => (
    <table className="table">
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th>Category</th>
          <th>Unit</th>
          <th>Total Stock</th>
          <th>Reorder Level</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {stockLevels.map((product) => (
          <tr key={product.id}>
            <td>{product.name}</td>
            <td>{product.sku || '-'}</td>
            <td>{product.category?.name || '-'}</td>
            <td>{product.unit}</td>
            <td>{product.total_stock}</td>
            <td>{product.reorder_level}</td>
            <td>
              {product.is_low_stock ? (
                <span className="alert alert-warning" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}>Low Stock</span>
              ) : (
                <span style={{ color: 'green' }}>OK</span>
              )}
            </td>
            <td>
              <button className="btn btn-sm btn-outline" onClick={() => handleAdjustClick(product)}>
                Adjust
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderLowStock = () => (
    <table className="table">
      <thead>
        <tr>
          <th>Product</th>
          <th>SKU</th>
          <th>Total Stock</th>
          <th>Reorder Level</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {lowStock.map((product) => (
          <tr key={product.id}>
            <td>{product.name}</td>
            <td>{product.sku || '-'}</td>
            <td>{product.total_stock}</td>
            <td>{product.reorder_level}</td>
            <td>
              <button className="btn btn-sm btn-outline" onClick={() => handleAdjustClick(product)}>Adjust</button>
            </td>
          </tr>
        ))}
        {lowStock.length === 0 && (
          <tr><td colSpan={5} className="text-center">No low stock items</td></tr>
        )}
      </tbody>
    </table>
  );

  const renderExpiring = () => (
    <table className="table">
      <thead>
        <tr>
          <th>Product</th>
          <th>Batch Number</th>
          <th>Expiry Date</th>
          <th>Quantity Remaining</th>
        </tr>
      </thead>
      <tbody>
        {expiring.map((batch) => (
          <tr key={batch.id}>
            <td>{batch.product.name}</td>
            <td>{batch.batch_number || '-'}</td>
            <td>{new Date(batch.expiry_date).toLocaleDateString()}</td>
            <td>{batch.quantity_remaining}</td>
          </tr>
        ))}
        {expiring.length === 0 && (
          <tr><td colSpan={4} className="text-center">No expiring soon items</td></tr>
        )}
      </tbody>
    </table>
  );

  const renderMovements = () => (
    <>
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Product ID"
          value={movementProductId}
          onChange={(e) => setMovementProductId(e.target.value)}
          className="input"
          style={{ width: '150px' }}
        />
        <select
          value={movementType}
          onChange={(e) => setMovementType(e.target.value)}
          className="input"
          style={{ width: '150px' }}
        >
          <option value="">All Types</option>
          <option value="purchase">Purchase</option>
          <option value="sale">Sale</option>
          <option value="return">Return</option>
          <option value="adjustment">Adjustment</option>
        </select>
        <input
          type="date"
          value={movementStartDate}
          onChange={(e) => setMovementStartDate(e.target.value)}
          className="input"
          style={{ width: '160px' }}
        />
        <input
          type="date"
          value={movementEndDate}
          onChange={(e) => setMovementEndDate(e.target.value)}
          className="input"
          style={{ width: '160px' }}
        />
        <button className="btn btn-outline" onClick={() => fetchMovements(1)}>Filter</button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Product</th>
            <th>Type</th>
            <th>Quantity</th>
            <th>User</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((mov) => (
            <tr key={mov.id}>
              <td>{new Date(mov.created_at).toLocaleString()}</td>
              <td>{mov.product?.name || '-'}</td>
              <td>{mov.movement_type}</td>
              <td style={{ color: mov.quantity > 0 ? 'green' : 'red' }}>{mov.quantity}</td>
              <td>{mov.user?.full_name || '-'}</td>
            </tr>
          ))}
          {movements.length === 0 && (
            <tr><td colSpan={5} className="text-center">No movements found</td></tr>
          )}
        </tbody>
      </table>
      {movementTotal > 20 && (
        <div className="flex justify-between mt-4">
          <button
            className="btn btn-outline btn-sm"
            disabled={movementPage <= 1}
            onClick={() => fetchMovements(movementPage - 1)}
          >
            Previous
          </button>
          <span>Page {movementPage} of {Math.ceil(movementTotal / 20)}</span>
          <button
            className="btn btn-outline btn-sm"
            disabled={movementPage >= Math.ceil(movementTotal / 20)}
            onClick={() => fetchMovements(movementPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <h1>Inventory Management</h1>
        <button className="btn btn-primary" onClick={() => handleAdjustClick()}>
          Adjust Stock
        </button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'levels' ? styles.active : ''}`}
          onClick={() => setActiveTab('levels')}
        >
          Stock Levels
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'low' ? styles.active : ''}`}
          onClick={() => setActiveTab('low')}
        >
          Low Stock
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'expiring' ? styles.active : ''}`}
          onClick={() => setActiveTab('expiring')}
        >
          Expiring Soon
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'movements' ? styles.active : ''}`}
          onClick={() => setActiveTab('movements')}
        >
          Stock Movements
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {activeTab === 'levels' && renderStockLevels()}
          {activeTab === 'low' && renderLowStock()}
          {activeTab === 'expiring' && renderExpiring()}
          {activeTab === 'movements' && renderMovements()}
        </>
      )}

      {showAdjustModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Adjust Stock</h3>
            <div className="flex flex-col gap-2">
              <label>Product</label>
              <select
                value={adjustProductId}
                onChange={(e) => {
                  setAdjustProductId(e.target.value);
                  const selected = stockLevels.find(p => p.id === e.target.value);
                  if (selected?.track_batch_expiry) {
                    api.get(`/inventory/batches/${selected.id}`).then(res => setProductBatches(res.data));
                  } else {
                    setProductBatches([]);
                  }
                }}
                className="input"
                required
              >
                <option value="">Select product</option>
                {stockLevels.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {productBatches.length > 0 && (
                <>
                  <label>Batch (required for batch-tracked)</label>
                  <select
                    value={adjustBatchId}
                    onChange={(e) => setAdjustBatchId(e.target.value)}
                    className="input"
                  >
                    <option value="">Select batch</option>
                    {productBatches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.batch_number || 'No batch'} (Exp: {b.expiry_date || 'N/A'}) - Qty: {b.quantity_remaining}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label>Quantity (positive to add, negative to reduce)</label>
              <input
                type="number"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(e.target.value)}
                className="input"
                required
                step="0.01"
              />
              <label>Reason</label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="input"
                required
                placeholder="e.g., Damaged stock, Stock count correction"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitAdjust}>Submit</button>
              <button className="btn btn-outline" onClick={() => setShowAdjustModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
