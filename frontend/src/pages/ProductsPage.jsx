import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package, Plus, Search, Edit2, ChevronLeft, ChevronRight,
  X, Filter, SlidersHorizontal
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function ProductsPage({ user }) {
  const { addToast } = useToast();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [units, setUnits] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const searchTimerRef = useRef(null);

  const isVendedor = user?.role_slug === 'vendedor';

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' | 'edit'
  const [editingId, setEditingId] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    internal_code: '',
    category_id: '',
    brand_id: '',
    unit_id: '',
    type: 'physical',
    cost: '',
    price: '',
    min_price: '',
    tax_rate: '18',
    stock_min: '5',
    stock_max: '500',
    allows_discount: true,
    max_discount_percent: '15',
    description: '',
    initial_warehouse_id: '',
    initial_stock: '0',
    variants: []
  });

  useEffect(() => {
    // Debounce search: reset page on filter change
    setPage(1);
  }, [search, filterCategory, filterBrand, filterType, filterStatus]);

  useEffect(() => {
    loadProducts();
  }, [page, search, filterCategory, filterBrand, filterType, filterStatus]);

  useEffect(() => {
    loadMetadata();
  }, []);

  const loadMetadata = async () => {
    try {
      const [cRes, bRes, uRes, wRes] = await Promise.all([
        api.get('/catalog/categories'),
        api.get('/catalog/brands'),
        api.get('/catalog/units'),
        api.get('/admin/branches-warehouses')
      ]);
      if (cRes.success) setCategories(cRes.data);
      if (bRes.success) setBrands(bRes.data);
      if (uRes.success) setUnits(uRes.data);
      if (wRes.success) setWarehouses(wRes.warehouses);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (search)         params.search      = search;
      if (filterCategory) params.category_id = filterCategory;
      if (filterBrand)    params.brand_id    = filterBrand;
      if (filterType)     params.type        = filterType;
      if (filterStatus)   params.status      = filterStatus;
      const res = await api.get('/catalog/products', params);
      if (res.success) {
        setProducts(res.data);
        setPagination(res.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setFilterCategory('');
    setFilterBrand('');
    setFilterType('');
    setFilterStatus('');
    setPage(1);
  };

  const hasActiveFilters = search || filterCategory || filterBrand || filterType || filterStatus;

  const handleOpenCreate = () => {
    setModalMode('create');
    setEditingId(null);
    setFormData({
      name: '',
      sku: `SKU-${Date.now().toString().slice(-5)}`,
      barcode: '',
      internal_code: '',
      category_id: categories[0]?.id || '',
      brand_id: brands[0]?.id || '',
      unit_id: units[0]?.id || '',
      type: 'physical',
      cost: '',
      price: '',
      min_price: '',
      tax_rate: '18',
      stock_min: '5',
      stock_max: '500',
      allows_discount: true,
      max_discount_percent: '15',
      description: '',
      initial_warehouse_id: warehouses[0]?.id || '',
      initial_stock: '0',
      variants: []
    });
    setShowModal(true);
  };

  const handleOpenEdit = (p) => {
    setModalMode('edit');
    setEditingId(p.id);
    setFormData({
      name: p.name || '',
      sku: p.sku || '',
      barcode: p.barcode || '',
      internal_code: p.internal_code || '',
      category_id: p.category_id || '',
      brand_id: p.brand_id || '',
      unit_id: p.unit_id || '',
      type: p.type || 'physical',
      cost: p.cost || '',
      price: p.price || '',
      min_price: p.min_price || '',
      tax_rate: p.tax_rate || '18',
      stock_min: p.stock_min || '5',
      stock_max: p.stock_max || '500',
      allows_discount: p.allows_discount ?? true,
      max_discount_percent: p.max_discount_percent || '15',
      description: p.description || '',
      initial_warehouse_id: '',
      initial_stock: '0',
      variants: p.variants || []
    });
    setShowModal(true);
  };

  const handleAddVariant = () => {
    setFormData({
      ...formData,
      variants: [
        ...formData.variants,
        {
          variant_name: '',
          sku: `${formData.sku}-V${formData.variants.length + 1}`,
          barcode: '',
          cost: formData.cost,
          price: formData.price
        }
      ]
    });
  };

  const handleRemoveVariant = (index) => {
    setFormData({
      ...formData,
      variants: formData.variants.filter((_, idx) => idx !== index)
    });
  };

  const handleVariantChange = (index, field, val) => {
    const updated = [...formData.variants];
    updated[index][field] = val;
    setFormData({ ...formData, variants: updated });
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        const res = await api.post('/catalog/products', formData);
        if (res.success) {
          addToast('Producto creado exitosamente.', 'success');
          setShowModal(false);
          loadProducts();
        }
      } else {
        const res = await api.put(`/catalog/products/${editingId}`, formData);
        if (res.success) {
          addToast('Producto actualizado exitosamente.', 'success');
          setShowModal(false);
          loadProducts();
        }
      }
    } catch (err) {
      addToast(err.message || 'Error guardando producto.', 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Catálogo de Productos & Variantes</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Manejo de referencias, precios de venta, ITBIS y disponibilidad de stock</p>
        </div>
        {!isVendedor && (
          <button onClick={handleOpenCreate} className="btn btn-primary">
            <Plus size={18} />
            <span>Nuevo Producto</span>
          </button>
        )}
      </div>

      {/* Filter / Search Bar */}
      <div className="card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Row 1: search + toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="input-control"
              placeholder="Buscar por nombre, SKU o código de barras..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '38px' }}
            />
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            style={{ whiteSpace: 'nowrap' }}
          >
            <SlidersHorizontal size={15} />
            <span>Filtros{hasActiveFilters ? ` (${[filterCategory,filterBrand,filterType,filterStatus,search].filter(Boolean).length})` : ''}</span>
          </button>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="btn btn-secondary btn-sm" title="Limpiar filtros">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Row 2: expanded filter dropdowns */}
        {showFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div>
              <label className="label-control" style={{ marginBottom: '4px' }}>Categoría</label>
              <select
                className="select-control"
                value={filterCategory}
                onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
              >
                <option value="">Todas las categorías</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-control" style={{ marginBottom: '4px' }}>Marca</label>
              <select
                className="select-control"
                value={filterBrand}
                onChange={e => { setFilterBrand(e.target.value); setPage(1); }}
              >
                <option value="">Todas las marcas</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-control" style={{ marginBottom: '4px' }}>Tipo</label>
              <select
                className="select-control"
                value={filterType}
                onChange={e => { setFilterType(e.target.value); setPage(1); }}
              >
                <option value="">Todos los tipos</option>
                <option value="physical">Producto Físico</option>
                <option value="service">Servicio</option>
              </select>
            </div>
            <div>
              <label className="label-control" style={{ marginBottom: '4px' }}>Estado</label>
              <select
                className="select-control"
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              >
                <option value="">Todos los estados</option>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Products Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>SKU / Código</th>
              <th>Producto</th>
              <th>Categoría</th>
              {!isVendedor && <th>Costo (RD$)</th>}
              <th>Precio Venta (RD$)</th>
              <th>Existencia Total</th>
              <th>Variantes</th>
              <th>Estado</th>
              {!isVendedor && <th style={{ width: '60px' }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isVendedor ? 7 : 8} style={{ textAlign: 'center', padding: '40px' }}>
                  Cargando catálogo...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={isVendedor ? 7 : 8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No se encontraron productos en el catálogo.
                </td>
              </tr>
            ) : (
              products.map(p => (
                <tr key={p.id}>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#93c5fd' }}>{p.sku}</span>
                    {p.barcode && <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{p.barcode}</p>}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {p.type === 'physical' ? 'Físico' : 'Servicio'} • {p.brand_name || 'Sin marca'}
                    </span>
                  </td>
                  <td>{p.category_name || '-'}</td>
                  {!isVendedor && (
                    <td>RD$ {Number(p.cost).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                  )}
                  <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                    RD$ {Number(p.price).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className={`badge ${p.total_stock > p.stock_min ? 'badge-success' : (p.total_stock <= 0 ? 'badge-danger' : 'badge-warning')}`}>
                      {p.total_stock} {p.unit_code || 'UND'}
                    </span>
                  </td>
                  <td>
                    {p.variants && p.variants.length > 0 ? (
                      <span className="badge badge-info">{p.variants.length} variantes</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Único</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${p.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {p.status === 'active' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {!isVendedor && (
                    <td>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="btn btn-secondary btn-sm"
                        title="Editar producto"
                        style={{ padding: '5px 8px' }}
                      >
                        <Edit2 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            Mostrando {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} productos
          </span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={15} />
              <span>Anterior</span>
            </button>
            {Array.from({ length: pagination.pages }, (_, i) => i + 1)
              .filter(n => Math.abs(n - pagination.page) <= 2)
              .map(n => (
                <button
                  key={n}
                  className={`btn btn-sm ${n === pagination.page ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setPage(n)}
                  style={{ minWidth: '34px' }}
                >
                  {n}
                </button>
              ))
            }
            <button
              className="btn btn-secondary btn-sm"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPage(p => p + 1)}
            >
              <span>Siguiente</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* CREATE / EDIT PRODUCT MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-lg" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {modalMode === 'create' ? 'Nuevo Producto / Servicio' : 'Editar Producto'}
              </h3>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label className="label-control">Nombre del Producto *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">SKU *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Código de Barras</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="745300..."
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 2: Classification */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div>
                  <label className="label-control">Tipo</label>
                  <select
                    className="select-control"
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  >
                    <option value="physical">Producto Físico</option>
                    <option value="service">Servicio</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">Categoría</label>
                  <select
                    className="select-control"
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  >
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-control">Marca</label>
                  <select
                    className="select-control"
                    value={formData.brand_id}
                    onChange={(e) => setFormData({ ...formData, brand_id: e.target.value })}
                  >
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-control">Unidad</label>
                  <select
                    className="select-control"
                    value={formData.unit_id}
                    onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                  >
                    {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
                  </select>
                </div>
              </div>

              {/* Row 3: Financials */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <div>
                  <label className="label-control">Costo (RD$)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="input-control"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Precio de Venta (RD$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-control"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">ITBIS / Impuesto (%)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={formData.tax_rate}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Stock Mínimo</label>
                  <input
                    type="number"
                    className="input-control"
                    value={formData.stock_min}
                    onChange={(e) => setFormData({ ...formData, stock_min: e.target.value })}
                  />
                </div>
              </div>

              {/* Initial stock on creation */}
              {modalMode === 'create' && formData.type === 'physical' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '10px' }}>
                  <div>
                    <label className="label-control">Almacén para Stock Inicial</label>
                    <select
                      className="select-control"
                      value={formData.initial_warehouse_id}
                      onChange={(e) => setFormData({ ...formData, initial_warehouse_id: e.target.value })}
                    >
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label-control">Cantidad de Apertura</label>
                    <input
                      type="number"
                      className="input-control"
                      value={formData.initial_stock}
                      onChange={(e) => setFormData({ ...formData, initial_stock: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Variants Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Variantes del Producto (Tallas, Colores, etc.)</h4>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Opcional: agrega variantes con su propio SKU y precio</p>
                  </div>
                  <button type="button" onClick={handleAddVariant} className="btn btn-secondary btn-sm">
                    <Plus size={14} />
                    <span>Agregar Variante</span>
                  </button>
                </div>

                {formData.variants.map((v, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 40px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="input-control"
                      placeholder="Ej. Talla 8 / Negro"
                      value={v.variant_name}
                      onChange={(e) => handleVariantChange(idx, 'variant_name', e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-control"
                      placeholder="SKU"
                      value={v.sku}
                      onChange={(e) => handleVariantChange(idx, 'sku', e.target.value)}
                    />
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Costo"
                      value={v.cost}
                      onChange={(e) => handleVariantChange(idx, 'cost', e.target.value)}
                    />
                    <input
                      type="number"
                      className="input-control"
                      placeholder="Precio"
                      value={v.price}
                      onChange={(e) => handleVariantChange(idx, 'price', e.target.value)}
                    />
                    <button type="button" onClick={() => handleRemoveVariant(idx)} className="btn btn-danger btn-sm" style={{ padding: '8px' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
