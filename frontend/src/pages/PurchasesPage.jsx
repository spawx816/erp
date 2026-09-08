import React, { useState, useEffect } from 'react';
import {
  ShoppingBag, Plus, Search, Calendar, DollarSign, X,
  CheckCircle2, AlertCircle, Warehouse, Truck, FileText,
  Clock, Filter, ArrowUpRight
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function PurchasesPage({ activeBranch }) {
  const { addToast } = useToast();
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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
        api.get('/catalog/products', { limit: 150 }),
        api.get('/admin/branches-warehouses')
      ]);
      if (sRes.success) setSuppliers(sRes.data || []);
      if (pRes.success) setProducts(pRes.data || []);
      if (wRes.success) setWarehouses(wRes.warehouses || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const res = await api.get('/purchases');
      if (res.success) setPurchases(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    const defaultSup = suppliers[0]?.id ? String(suppliers[0].id) : '';
    const defaultWh = warehouses[0]?.id ? String(warehouses[0].id) : '';
    const defaultProd = products[0]?.id ? String(products[0].id) : '';
    const defaultCost = products[0]?.cost ? String(products[0].cost) : '0';

    setFormData({
      supplier_id: defaultSup,
      warehouse_id: defaultWh,
      supplier_invoice_number: `FPROV-${Date.now().toString().slice(-4)}`,
      payment_terms: 'cash',
      credit_days: '30',
      notes: '',
      items: [{
        product_id: defaultProd,
        quantity: '5',
        unit_cost: defaultCost,
        tax_rate: '18'
      }]
    });
    setShowModal(true);
  };

  const handleAddItem = () => {
    const defaultProd = products[0]?.id ? String(products[0].id) : '';
    const defaultCost = products[0]?.cost ? String(products[0].cost) : '0';
    setFormData({
      ...formData,
      items: [...formData.items, { product_id: defaultProd, quantity: '1', unit_cost: defaultCost, tax_rate: '18' }]
    });
  };

  const handleRemoveItem = (idx) => {
    if (formData.items.length <= 1) {
      addToast('La compra debe contener al menos un artículo.', 'error');
      return;
    }
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== idx)
    });
  };

  const handleItemChange = (idx, field, val) => {
    const it = [...formData.items];
    it[idx][field] = val;
    if (field === 'product_id') {
      const prod = products.find(p => String(p.id) === String(val));
      if (prod) {
        it[idx].unit_cost = prod.cost || 0;
      }
    }
    setFormData({ ...formData, items: it });
  };

  // Calculations
  const calculatedSubtotal = formData.items.reduce((acc, item) => {
    return acc + (parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0));
  }, 0);

  const calculatedTax = formData.items.reduce((acc, item) => {
    const sub = parseFloat(item.quantity || 0) * parseFloat(item.unit_cost || 0);
    return acc + (sub * (parseFloat(item.tax_rate || 18) / 100));
  }, 0);

  const calculatedTotal = calculatedSubtotal + calculatedTax;

  const handleSavePurchase = async (e) => {
    e.preventDefault();

    if (!formData.supplier_id) {
      addToast('Por favor seleccione un proveedor.', 'error');
      return;
    }
    if (!formData.warehouse_id) {
      addToast('Por favor seleccione el almacén de destino.', 'error');
      return;
    }
    const hasInvalidItem = formData.items.some(it => !it.product_id || parseFloat(it.quantity || 0) <= 0);
    if (hasInvalidItem) {
      addToast('Verifique que todos los productos y cantidades sean válidos.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        supplier_id: parseInt(formData.supplier_id, 10),
        warehouse_id: parseInt(formData.warehouse_id, 10),
        items: formData.items.map(it => ({
          product_id: parseInt(it.product_id, 10),
          quantity: parseFloat(it.quantity),
          unit_cost: parseFloat(it.unit_cost || 0),
          tax_rate: parseFloat(it.tax_rate || 18)
        }))
      };

      const res = await api.post('/purchases', payload);
      if (res.success) {
        addToast(`Compra registrada exitosamente. ${formData.payment_terms === 'credit' ? 'Se generó CxP a proveedor.' : ''}`, 'success');
        setShowModal(false);
        loadPurchases();
      }
    } catch (err) {
      addToast(err.message || 'Error registrando compra.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPurchases = purchases.filter(p => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.purchase_number?.toLowerCase().includes(term) ||
      p.supplier_name?.toLowerCase().includes(term) ||
      p.supplier_invoice_number?.toLowerCase().includes(term)
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShoppingBag size={24} className="text-blue-500" />
            Compras & Recepción de Mercancía
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Ingreso y costeo de inventario con generación automática de CxP</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar compra, factura..."
              className="input-control"
              style={{ paddingLeft: '36px', minWidth: '240px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={handleOpenModal}
            className="btn btn-primary"
          >
            <Plus size={18} />
            <span>Registrar Compra</span>
          </button>
        </div>
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
            ) : filteredPurchases.length === 0 ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se encontraron registros de compra.</td></tr>
            ) : (
              filteredPurchases.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{p.purchase_number}</td>
                  <td style={{ fontSize: '0.78rem' }}>{new Date(p.created_at).toLocaleDateString('es-DO')}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.supplier_name}</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>RNC: {p.supplier_tax_id}</span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{p.supplier_invoice_number || '-'}</td>
                  <td>
                    <span className="badge badge-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Warehouse size={12} />
                      {p.warehouse_name}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${p.payment_terms === 'credit' ? 'badge-warning' : 'badge-info'}`}>
                      {p.payment_terms === 'credit' ? 'Crédito (CxP)' : 'Contado'}
                    </span>
                  </td>
                  <td style={{ fontWeight: 800, color: '#38bdf8' }}>
                    RD$ {Number(p.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </td>
                  <td>
                    <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} />
                      Ingresado
                    </span>
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
          <div className="modal-content modal-content-lg" style={{ padding: '24px', maxWidth: '850px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '8px', borderRadius: '10px' }}>
                  <Truck size={22} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Registrar Factura de Compra
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ingreso de mercancía al almacén con actualización automática de costos</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="btn btn-secondary btn-sm" style={{ padding: '6px' }}>
                <X size={18} />
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
                    <option value="">Seleccione proveedor...</option>
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
                    <option value="">Seleccione almacén...</option>
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
                    min="1"
                    disabled={formData.payment_terms !== 'credit'}
                    className="input-control"
                    value={formData.credit_days}
                    onChange={(e) => setFormData({ ...formData, credit_days: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Notas u Observaciones</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Comentarios adicionales sobre la orden"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  />
                </div>
              </div>

              {/* Items Section */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Artículos de la Compra</h4>
                  <button type="button" onClick={handleAddItem} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Plus size={14} />
                    <span>Agregar Ítem</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {formData.items.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.2fr 40px', gap: '8px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', padding: '6px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <select
                        className="select-control"
                        required
                        value={item.product_id}
                        onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                      >
                        <option value="">Seleccione producto...</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                      </select>

                      <input
                        type="number"
                        min="1"
                        step="any"
                        placeholder="Cant."
                        className="input-control"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                      />

                      <input
                        type="number"
                        step="0.01"
                        placeholder="Costo (RD$)"
                        className="input-control"
                        value={item.unit_cost}
                        onChange={(e) => handleItemChange(idx, 'unit_cost', e.target.value)}
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="btn btn-danger btn-sm"
                        style={{ padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Calculation Panel */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  <span>Subtotal:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>RD$ {calculatedSubtotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <span>ITBIS (18%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>RD$ {calculatedTax.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '8px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>Total General:</span>
                  <span style={{ fontWeight: 900, color: '#38bdf8', fontSize: '1.25rem' }}>
                    RD$ {calculatedTotal.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary" style={{ minWidth: '220px' }}>
                  {submitting ? 'Procesando Compra...' : 'Procesar Compra & Ingresar Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
