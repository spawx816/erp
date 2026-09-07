import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Search, Calendar, DollarSign, X, CheckCircle } from 'lucide-react';
import api from '../services/api';

export default function PurchasesPage({ activeBranch }) {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Purchase Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    supplier_id: '',
    warehouse_id: '',
    supplier_invoice_number: '',
    payment_terms: 'cash',
    credit_days: '30',
    notes: '',
    items: [{ product_id: '', quantity: '1', unit_cost: '0', tax_rate: '18' }]
  });

  useEffect(() => {
    loadPurchases();
    loadMeta();
  }, [activeBranch]);

  const loadMeta = async () => {
    try {
      const [sRes, pRes, wRes] = await Promise.all([
        api.get('/third-parties/suppliers'),
        api.get('/catalog/products', { limit: 100 }),
        api.get('/admin/branches-warehouses')
      ]);
      if (sRes.success) setSuppliers(sRes.data);
      if (pRes.success) setProducts(pRes.data);
      if (wRes.success) setWarehouses(wRes.warehouses);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchases');
      if (res.success) setPurchases(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: '', quantity: '1', unit_cost: '0', tax_rate: '18' }]
    });
  };

  const handleRemoveItem = (idx) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== idx)
    });
  };

  const handleItemChange = (idx, field, val) => {
    const it = [...formData.items];
    it[idx][field] = val;
    if (field === 'product_id') {
      const prod = products.find(p => p.id === parseInt(val, 10));
      if (prod) it[idx].unit_cost = prod.cost;
    }
    setFormData({ ...formData, items: it });
  };

  const handleSavePurchase = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/purchases', formData);
      if (res.success) {
        alert('Compra registrada y existencias incrementadas en inventario.');
        setShowModal(false);
        loadPurchases();
      }
    } catch (err) {
      alert(err.message || 'Error registrando compra.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Compras & Recepción de Mercancía</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ingreso de inventario y generación de Cuentas por Pagar (CxP)</p>
        </div>
        <button
          onClick={() => {
            setFormData({
              supplier_id: suppliers[0]?.id || '',
              warehouse_id: warehouses[0]?.id || '',
              supplier_invoice_number: `FPROV-${Date.now().toString().slice(-4)}`,
              payment_terms: 'cash',
              credit_days: '30',
              notes: '',
              items: [{ product_id: products[0]?.id || '', quantity: '5', unit_cost: products[0]?.cost || '0', tax_rate: '18' }]
            });
            setShowModal(true);
          }}
          className="btn btn-primary"
        >
          <Plus size={18} />
          <span>Registrar Compra</span>
        </button>
      </div>

      {/* Purchases Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>No. Compra</th>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Factura Prov.</th>
              <th>Almacén</th>
              <th>Términos</th>
              <th>Total (RD$)</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>Cargando compras...</td></tr>
            ) : purchases.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se han registrado compras.</td></tr>
            ) : (
              purchases.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{p.purchase_number}</td>
                  <td style={{ fontSize: '0.78rem' }}>{new Date(p.created_at).toLocaleDateString('es-DO')}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.supplier_name}</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>RNC: {p.supplier_tax_id}</span>
                  </td>
                  <td>{p.supplier_invoice_number || '-'}</td>
                  <td>{p.warehouse_name}</td>
                  <td>
                    <span className={`badge ${p.payment_terms === 'credit' ? 'badge-warning' : 'badge-info'}`}>
                      {p.payment_terms === 'credit' ? 'Crédito (CxP)' : 'Contado'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 800, color: '#38bdf8' }}>
                    RD$ {Number(p.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className="badge badge-success">Recibida</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* NEW PURCHASE MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-content-lg" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Registrar Factura de Compra
              </h3>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div>
                  <label className="label-control">Proveedor *</label>
                  <select
                    required
                    className="select-control"
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
                  >
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name} ({s.tax_id})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-control">Almacén de Entrada *</label>
                  <select
                    required
                    className="select-control"
                    value={formData.warehouse_id}
                    onChange={(e) => setFormData({ ...formData, warehouse_id: e.target.value })}
                  >
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-control">No. Factura Proveedor</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="B01000..."
                    value={formData.supplier_invoice_number}
                    onChange={(e) => setFormData({ ...formData, supplier_invoice_number: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
                <div>
                  <label className="label-control">Condición de Pago</label>
                  <select
                    className="select-control"
                    value={formData.payment_terms}
                    onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                  >
                    <option value="cash">Contado</option>
                    <option value="credit">Crédito</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">Días de Crédito</label>
                  <input
                    type="number"
                    disabled={formData.payment_terms !== 'credit'}
                    className="input-control"
                    value={formData.credit_days}
                    onChange={(e) => setFormData({ ...formData, credit_days: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Notas</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Comentarios adicionales"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Artículos de la Compra</h4>
                  <button type="button" onClick={handleAddItem} className="btn btn-secondary btn-sm">
                    <Plus size={14} />
                    <span>Agregar Ítem</span>
                  </button>
                </div>

                {formData.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    <select
                      className="select-control"
                      value={item.product_id}
                      onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                    >
                      <option value="">Seleccione producto</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>

                    <input
                      type="number"
                      min="1"
                      placeholder="Cantidad"
                      className="input-control"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                    />

                    <input
                      type="number"
                      step="0.01"
                      placeholder="Costo Unitario"
                      className="input-control"
                      value={item.unit_cost}
                      onChange={(e) => handleItemChange(idx, 'unit_cost', e.target.value)}
                    />

                    <button type="button" onClick={() => handleRemoveItem(idx)} className="btn btn-danger btn-sm" style={{ padding: '8px' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Procesar Compra & Ingresar Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
