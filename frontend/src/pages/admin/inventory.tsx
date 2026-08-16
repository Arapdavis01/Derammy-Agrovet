import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';

interface ProductStock {
  id: string;
  name: string;
  sku: string;
  unit: string;
  reorder_level: number;
  track_batch_expiry: boolean;
  category?: { id: string; name: string };
  total_stock: number;
  is_low_stock: boolean;
  stock_batches?: any[];
}

interface Product {
  id: string;
  name: string;
  selling_price: number;
  cost_price: number;
  unit: string;
}

export default function Inventory() {
  const { user } = useAuth();
  const router = useRouter();
  const [inventory, setInventory] = useState<ProductStock[]>([]);
  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

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
  }, [user]);

  const fetchData = async () => {
    try {
      const [inventoryRes, productsRes] = await Promise.all([
        api.get('/inventory'),
        api.get('/products', { params: { limit: 200 } }),
      ]);
      const stockData = inventoryRes.data;
      const productsData = productsRes.data.data || [];

      const map: Record<string, Product> = {};
      productsData.forEach((p: Product) => {
        map[p.id] = p;
      });

      setInventory(stockData);
      setProductMap(map);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  // Compute summary
  const totalProducts = inventory.length;
  const productTypes = new Set(inventory.map((item) => item.category?.id || 'uncategorized')).size;
  const inventoryValue = inventory.reduce((sum, item) => {
    const sellingPrice = productMap[item.id]?.selling_price || 0;
    return sum + item.total_stock * sellingPrice;
  }, 0);
  const lowStockItems = inventory.filter((item) => item.is_low_stock).length;
  const outOfStock = inventory.filter((item) => item.total_stock === 0).length;

  // Filter for search
  const filteredInventory = inventory.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <Layout>
        <div>Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="welcome-heading">
        <h1>Inventory Management</h1>
        <p>Overview of your stock levels and values.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="card summary-card">
          <i className="fas fa-boxes-stacked card-icon" style={{ color: '#1B5E20' }}></i>
          <h4>Total Products</h4>
          <p className="summary-value">{totalProducts}</p>
          <span className="summary-subtitle">{productTypes} product types</span>
        </div>

        <div className="card summary-card">
          <i className="fas fa-money-bill-wave card-icon" style={{ color: '#F57C00' }}></i>
          <h4>Inventory Value</h4>
          <p className="summary-value">KES {inventoryValue.toLocaleString()}</p>
          <span className="summary-subtitle">Current stock value</span>
        </div>

        <div className="card summary-card" onClick={() => router.push('/admin/inventory?filter=low')}>
          <i className="fas fa-exclamation-triangle card-icon" style={{ color: '#FFA000' }}></i>
          <h4>Low Stock Items</h4>
          <p className="summary-value">{lowStockItems}</p>
          <span className="summary-subtitle">Click to view - Need restocking</span>
        </div>

        <div className="card summary-card" onClick={() => router.push('/admin/inventory?filter=out')}>
          <i className="fas fa-times-circle card-icon" style={{ color: '#D32F2F' }}></i>
          <h4>Out of Stock</h4>
          <p className="summary-value">{outOfStock}</p>
          <span className="summary-subtitle">Click to view - Unavailable</span>
        </div>
      </div>

      {/* Product Inventory Overview */}
      <div className="dashboard-section">
        <h2><i className="fas fa-list" style={{ marginRight: '8px' }}></i>Products Inventory Overview</h2>
        <div className="filters">
          <input
            type="text"
            placeholder="Search inventory..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input"
            style={{ maxWidth: '300px' }}
          />
        </div>

        <table className="table mt-4">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Unit</th>
              <th>Buy Price</th>
              <th>Sell Price</th>
              <th>Stock</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredInventory.map((item) => {
              const product = productMap[item.id];
              const sellPrice = product?.selling_price || 0;
              const buyPrice = product?.cost_price || 0;
              const value = item.total_stock * sellPrice;
              return (
                <tr key={item.id}>
                  <td>
                    <span className="font-weight-bold">{item.name}</span>
                    {item.sku && <div className="text-muted">{item.sku}</div>}
                  </td>
                  <td>{item.category?.name || 'Uncategorized'}</td>
                  <td>{item.unit}</td>
                  <td>KES {buyPrice.toFixed(2)}</td>
                  <td>KES {sellPrice.toFixed(2)}</td>
                  <td>{item.total_stock} {item.unit}</td>
                  <td>KES {value.toFixed(2)}</td>
                  <td>
                    {item.total_stock === 0 ? (
                      <span className="status inactive">Out of Stock</span>
                    ) : item.is_low_stock ? (
                      <span className="status held">Low Stock</span>
                    ) : (
                      <span className="status active">OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredInventory.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center">No inventory items found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
