import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/router';
import { getStockDisplay, getPriceDisplay, hasDualUnit } from '@/utils/productDisplay';

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string; // used as brand
  barcode: string;
  variant: string | null;
  category_id: string | null;
  category?: { id: string; name: string } | null;
  unit: string;
  cost_price: number;
  selling_price: number;
  reorder_level: number;
  is_returnable: boolean;
  tax_rate: number;
  track_batch_expiry: boolean;
  sales_unit?: string | null;
  conversion_factor?: number | null;
  total_stock?: number;
}

export default function AdminProducts() {
  const { user } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    variant: '',
    barcode: '',
    category_id: '',
    unit: 'piece',
    cost_price: '',
    selling_price: '',
    reorder_level: '0',
    sales_unit: '',
    conversion_factor: '',
    is_returnable: true,
    tax_rate: '0',
    track_batch_expiry: false,
  });

  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState('1');

  const [deleteConfirm, setDeleteConfirm] = useState<Product | null>(null);

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
    setLoading(true);
    try {
      const [productsRes, categoriesRes, inventoryRes] = await Promise.all([
        api.get('/products', { params: { limit: 200 } }),
        api.get('/categories'),
        api.get('/inventory'),
      ]);

      setProducts(productsRes.data.data || []);
      setCategories(categoriesRes.data || []);

      const inventoryData = inventoryRes.data || [];
      const map: Record<string, number> = {};
      inventoryData.forEach((item: any) => {
        map[item.id] = item.total_stock || 0;
      });
      setStockMap(map);
    } catch (error: any) {
      toast.error('Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  // Group products by name (case-insensitive)
  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    products.forEach((product) => {
      const key = product.name.toLowerCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });
    return groups;
  }, [products]);

  // Filter products based on search
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groupedProducts;
    const term = search.toLowerCase();
    const result: Record<string, Product[]> = {};
    Object.entries(groupedProducts).forEach(([key, variants]) => {
      const groupMatch = key.includes(term);
      const filteredVariants = variants.filter(
        (p) =>
          groupMatch ||
          (p.sku && p.sku.toLowerCase().includes(term)) ||
          (p.variant && p.variant.toLowerCase().includes(term)) ||
          (p.category?.name && p.category.name.toLowerCase().includes(term))
      );
      if (filteredVariants.length > 0) {
        result[key] = filteredVariants;
      }
    });
    return result;
  }, [groupedProducts, search]);

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({
      name: '',
      sku: '',
      variant: '',
      barcode: '',
      category_id: '',
      unit: 'piece',
      cost_price: '',
      selling_price: '',
      reorder_level: '0',
      sales_unit: '',
      conversion_factor: '',
      is_returnable: true,
      tax_rate: '0',
      track_batch_expiry: false,
    });
    setShowProductForm(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      sku: product.sku || '',
      variant: product.variant || '',
      barcode: product.barcode || '',
      category_id: product.category_id || '',
      unit: product.unit,
      cost_price: product.cost_price.toString(),
      selling_price: product.selling_price.toString(),
      reorder_level: product.reorder_level.toString(),
      sales_unit: product.sales_unit || '',
      conversion_factor: product.conversion_factor ? product.conversion_factor.toString() : '',
      is_returnable: product.is_returnable,
      tax_rate: product.tax_rate.toString(),
      track_batch_expiry: product.track_batch_expiry,
    });
    setShowProductForm(true);
  };

  const handleProductFormChange = (field: string, value: any) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const submitProductForm = async () => {
    if (!productForm.name || !productForm.unit || productForm.cost_price === '' || productForm.selling_price === '') {
      toast.error('Name, unit, cost price, and selling price are required');
      return;
    }
    if (parseFloat(productForm.selling_price) < parseFloat(productForm.cost_price)) {
      toast.error('Selling price cannot be less than cost price');
      return;
    }

    const payload = {
      name: productForm.name,
      sku: productForm.sku,
      variant: productForm.variant || null,
      barcode: productForm.barcode,
      category_id: productForm.category_id || null,
      unit: productForm.unit,
      cost_price: parseFloat(productForm.cost_price),
      selling_price: parseFloat(productForm.selling_price),
      reorder_level: parseFloat(productForm.reorder_level) || 0,
      sales_unit: productForm.sales_unit || null,
      conversion_factor: parseFloat(productForm.conversion_factor) || 0,
      is_returnable: productForm.is_returnable,
      tax_rate: parseFloat(productForm.tax_rate) || 0,
      track_batch_expiry: productForm.track_batch_expiry,
    };

    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/products', payload);
        toast.success('Product created');
      }
      setShowProductForm(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save product');
    }
  };

  const openRestock = (product: Product) => {
    setRestockProduct(product);
    setRestockQty('1');
    setShowRestockModal(true);
  };

  const submitRestock = async () => {
    if (!restockProduct) return;
    const qty = parseFloat(restockQty);
    if (!qty || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    try {
      await api.post('/inventory/adjust', {
        product_id: restockProduct.id,
        quantity: qty,
        reason: 'Restock from Products page',
      });
      toast.success('Stock added successfully');
      setShowRestockModal(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to restock');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/products/${deleteConfirm.id}`);
      toast.success('Product deleted');
      setDeleteConfirm(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to delete product');
    }
  };

  return (
    <Layout>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1>Products ({products.length} items)</h1>
          <p className="text-muted">Manage your product catalog and inventory.</p>
        </div>
        <button className="btn btn-primary" onClick={openAddProduct}>
          <i className="fas fa-plus" style={{ marginRight: '6px' }}></i> Add Product
        </button>
      </div>

      {/* Search */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search by name, brand, variant, or category (e.g., supplements)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input"
        />
        <button className="btn btn-outline" onClick={fetchData}>
          <i className="fas fa-refresh" style={{ marginRight: '6px' }}></i> Refresh
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div className="mt-4">
          {Object.keys(filteredGroups).length === 0 ? (
            <p className="alert alert-info">No products found.</p>
          ) : (
            Object.entries(filteredGroups).map(([key, variants]) => (
              <div key={key} className="card mb-2">
                <div className="flex justify-between items-center">
                  <h3 className="card-title" style={{ marginBottom: '0' }}>
                    <i className="fas fa-box" style={{ marginRight: '8px' }}></i>
                    {variants[0].name}
                    <span className="text-muted" style={{ fontSize: '0.9rem', marginLeft: '8px' }}>
                      {variants.length} variant{variants.length !== 1 ? 's' : ''}
                    </span>
                  </h3>
                  <button className="btn btn-sm btn-outline" onClick={() => openAddProduct()}>
                    <i className="fas fa-plus" style={{ marginRight: '4px' }}></i> Add Variant
                  </button>
                </div>

                <table className="table mt-2">
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Variant</th>
                      <th>Category</th>
                      <th>Buy Price</th>
                      <th>Sell Price</th>
                      <th>Stock</th>
                      <th>Unit</th>
                      <th>Sales Unit</th>
                      <th>Conv.</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((product) => {
                      const stock = stockMap[product.id] ?? 0;
                      const status =
                        stock <= 0
                          ? 'inactive'
                          : stock <= product.reorder_level
                          ? 'held'
                          : 'active';
                      const statusText =
                        stock <= 0 ? 'Out' : stock <= product.reorder_level ? 'Low' : 'OK';
                      const stockDisplay = getStockDisplay(
                        stock,
                        product.unit,
                        product.sales_unit,
                        product.conversion_factor
                      );
                      const priceDisplay = getPriceDisplay(
                        product.selling_price,
                        product.unit,
                        product.sales_unit,
                        product.conversion_factor
                      );
                      return (
                        <tr key={product.id}>
                          <td>{product.sku || '-'}</td>
                          <td>{product.variant || '-'}</td>
                          <td>{product.category?.name || 'Uncategorized'}</td>
                          <td>KES {product.cost_price.toFixed(2)}</td>
                          <td>{priceDisplay}</td>
                          <td>{stockDisplay}</td>
                          <td>{product.unit}</td>
                          <td>{product.sales_unit || '-'}</td>
                          <td>{product.conversion_factor || '-'}</td>
                          <td>
                            <span className={`status ${status}`}>{statusText}</span>
                          </td>
                          <td>
                            <button className="btn btn-sm btn-outline" onClick={() => openEditProduct(product)}>
                              <i className="fas fa-edit"></i>
                            </button>
                            <button className="btn btn-sm btn-outline" onClick={() => openRestock(product)}>
                              <i className="fas fa-plus"></i>
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => setDeleteConfirm(product)}>
                              <i className="fas fa-trash"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      )}

      {/* Product Form Modal (Improved) */}
      {showProductForm && (
        <div className="modal-overlay">
          <div className="modal modal-large">
            {/* Modal Header */}
            <div className="modal-header">
              <h3 className="modal-title">
                <i className="fas fa-box-open"></i>{' '}
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h3>
              <button
                className="modal-close"
                onClick={() => setShowProductForm(false)}
                aria-label="Close"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="modal-body">
              {/* Basic Information */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <i className="fas fa-info-circle"></i> Basic Information
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label htmlFor="prodName">
                      <i className="fas fa-tag"></i> Name *
                    </label>
                    <input
                      id="prodName"
                      type="text"
                      value={productForm.name}
                      onChange={(e) => handleProductFormChange('name', e.target.value)}
                      className="input"
                      placeholder="e.g., Chick Mash"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodBrand">
                      <i className="fas fa-trademark"></i> Brand
                    </label>
                    <input
                      id="prodBrand"
                      type="text"
                      value={productForm.sku}
                      onChange={(e) => handleProductFormChange('sku', e.target.value)}
                      className="input"
                      placeholder="e.g., Pembe"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodVariant">
                      <i className="fas fa-list"></i> Variant
                    </label>
                    <input
                      id="prodVariant"
                      type="text"
                      value={productForm.variant}
                      onChange={(e) => handleProductFormChange('variant', e.target.value)}
                      className="input"
                      placeholder="e.g., 50kg"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodBarcode">
                      <i className="fas fa-barcode"></i> Barcode
                    </label>
                    <input
                      id="prodBarcode"
                      type="text"
                      value={productForm.barcode}
                      onChange={(e) => handleProductFormChange('barcode', e.target.value)}
                      className="input"
                      placeholder="Scan or enter barcode"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodCategory">
                      <i className="fas fa-folder"></i> Category
                    </label>
                    <select
                      id="prodCategory"
                      value={productForm.category_id}
                      onChange={(e) => handleProductFormChange('category_id', e.target.value)}
                      className="input"
                    >
                      <option value="">Select category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodUnit">
                      <i className="fas fa-weight"></i> Unit *
                    </label>
                    <input
                      id="prodUnit"
                      type="text"
                      value={productForm.unit}
                      onChange={(e) => handleProductFormChange('unit', e.target.value)}
                      className="input"
                      placeholder="e.g., bag, kg, piece"
                    />
                  </div>
                </div>
              </div>

              {/* Pricing & Stock */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <i className="fas fa-money-bill-wave"></i> Pricing & Stock
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label htmlFor="prodCost">
                      <i className="fas fa-download"></i> Cost Price *
                    </label>
                    <input
                      id="prodCost"
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.cost_price}
                      onChange={(e) => handleProductFormChange('cost_price', e.target.value)}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodPrice">
                      <i className="fas fa-upload"></i> Selling Price *
                    </label>
                    <input
                      id="prodPrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.selling_price}
                      onChange={(e) => handleProductFormChange('selling_price', e.target.value)}
                      className="input"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodReorder">
                      <i className="fas fa-exclamation-triangle"></i> Reorder Level
                    </label>
                    <input
                      id="prodReorder"
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.reorder_level}
                      onChange={(e) => handleProductFormChange('reorder_level', e.target.value)}
                      className="input"
                      placeholder="0"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodTax">
                      <i className="fas fa-percentage"></i> Tax Rate (%)
                    </label>
                    <input
                      id="prodTax"
                      type="number"
                      step="0.01"
                      min="0"
                      value={productForm.tax_rate}
                      onChange={(e) => handleProductFormChange('tax_rate', e.target.value)}
                      className="input"
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Alternative Sales Unit */}
              <div className="form-section alt-unit-section">
                <h4 className="form-section-title">
                  <i className="fas fa-sync-alt"></i> Alternative Sales Unit
                  <span className="optional-badge">Optional</span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label htmlFor="prodSalesUnit">
                      <i className="fas fa-ruler"></i> Sales Unit Name
                    </label>
                    <input
                      id="prodSalesUnit"
                      type="text"
                      value={productForm.sales_unit}
                      onChange={(e) => handleProductFormChange('sales_unit', e.target.value)}
                      className="input"
                      placeholder="e.g., kg, tonne"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="prodConvFactor">
                      <i className="fas fa-calculator"></i> Conversion Factor
                    </label>
                    <input
                      id="prodConvFactor"
                      type="number"
                      step="1"
                      min="0"
                      value={productForm.conversion_factor}
                      onChange={(e) => handleProductFormChange('conversion_factor', e.target.value)}
                      className="input"
                      placeholder="e.g., 50"
                    />
                  </div>
                </div>
                <p className="form-hint">
                  How many base units make one sales unit? Example: 1 bag = 50 kg, enter 50.
                </p>
              </div>

              {/* Settings */}
              <div className="form-section">
                <h4 className="form-section-title">
                  <i className="fas fa-cog"></i> Settings
                </h4>
                <div className="flex gap-4">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={productForm.is_returnable}
                      onChange={(e) => handleProductFormChange('is_returnable', e.target.checked)}
                    />
                    <span className="toggle-text">
                      <i className="fas fa-undo"></i> Returnable
                    </span>
                  </label>
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={productForm.track_batch_expiry}
                      onChange={(e) => handleProductFormChange('track_batch_expiry', e.target.checked)}
                    />
                    <span className="toggle-text">
                      <i className="fas fa-clock"></i> Track Batch/Expiry
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowProductForm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitProductForm}>
                <i className="fas fa-save"></i> {editingProduct ? 'Update Product' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {showRestockModal && restockProduct && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Restock: {restockProduct.name}</h3>
            <p>Current Stock: {getStockDisplay(stockMap[restockProduct.id] ?? 0, restockProduct.unit, restockProduct.sales_unit, restockProduct.conversion_factor)}</p>
            <div className="form-group">
              <label>Quantity to Add ({restockProduct.unit})</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                className="input"
                style={{ textAlign: 'center' }}
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-primary" onClick={submitRestock}>Add Stock</button>
              <button className="btn btn-outline" onClick={() => setShowRestockModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Product</h3>
            <p>Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?</p>
            <div className="flex gap-2 mt-4">
              <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
