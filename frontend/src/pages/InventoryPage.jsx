import React, { useState, useEffect } from 'react';
import {
  Warehouse, ArrowRightLeft, Sliders, History, Search,
  Plus, CheckCircle, AlertTriangle, X, Layers, Activity,
  Calendar, Package, Clock, CheckCircle2, AlertCircle,
  Filter, Tag
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function InventoryPage({ initialTab = 'stock' }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab); // 'stock' | 'kardex' | 'lots' | 'analysis' | 'transfers'
  const [stockList, setStockList] = useState([]);
  const [kardexList, setKardexList] = useState([]);
  const [lotsList, setLotsList] = useState([]);
  const [analysisData, setAnalysisData] = useState(null);
  const [noMovementDays, setNoMovementDays] = useState('60');
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Adjust Form
  const [adjustData, setAdjustData] = useState({
    warehouse_id: '',
    product_id: '',
    adjustment_type: 'in', // 'in' | 'out'
    quantity: '1',
    unit_cost: '0',
    reason: ''
  });

  // Transfer Form
  const [transferData, setTransferData] = useState({
    from_warehouse_id: '',
    to_warehouse_id: '',
    notes: '',
    items: [{ product_id: '', quantity: '1' }]
  });

  useEffect(() => {
    loadMeta();
  }, []);

  useEffect(() => {
    if (activeTab === 'stock') loadStock();
    if (activeTab === 'kardex') loadKardex();
    if (activeTab === 'lots') loadLots();
    if (activeTab === 'analysis') loadAnalysis();
    if (activeTab === 'transfers') loadTransfers();
  }, [activeTab, selectedWarehouse, noMovementDays]);

  const loadMeta = async () => {
    try {
      const [wRes, pRes] = await Promise.all([
        api.get('/admin/branches-warehouses'),
        api.get('/catalog/products', { limit: 120 })
      ]);
      if (wRes.success) setWarehouses(wRes.warehouses);
      if (pRes.success) setProducts(pRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStock = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/stock', { warehouse_id: selectedWarehouse });
      if (res.success) setStockList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadKardex = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/kardex', { warehouse_id: selectedWarehouse });
      if (res.success) setKardexList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLots = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/lots', { warehouse_id: selectedWarehouse });
      if (res.success) setLotsList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAnalysis = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/analysis', { no_movement_days: noMovementDays });
      if (res.success) setAnalysisData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTransfers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/transfers');
      if (res.success) setTransfers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/inventory/adjust', adjustData);
      if (res.success) {
        addToast('Ajuste de inventario aplicado exitosamente.', 'success');
        setShowAdjustModal(false);
        loadStock();
      }
    } catch (err) {
      addToast(err.message || 'Error en ajuste.', 'error');
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/inventory/transfers', transferData);
      if (res.success) {
        addToast('Transferencia creada exitosamente.', 'success');
        setShowTransferModal(false);
        loadTransfers();
      }
    } catch (err) {
      addToast(err.message || 'Error en transferencia.', 'error');
    }
  };

  const handleReceiveTransfer = async (id) => {
    try {
      const res = await api.post(`/inventory/transfers/${id}/receive`);
      if (res.success) {
        addToast('Transferencia recibida en almacén destino.', 'success');
        loadTransfers();
      }
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header Banner */}
      <div style={{
        background: 'var(--bg-banner)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)'
          }}>
            <Warehouse size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Control de Almacén & Inventarios
              </h2>
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
                Sección 19 & 20
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Existencias multialmacén, kardex físico, trazabilidad de lotes con edad en inventario y análisis de rotación
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowAdjustModal(true)} className="btn btn-secondary">
            <Sliders size={16} />
            <span>Ajuste Físico</span>
          </button>
          <button onClick={() => setShowTransferModal(true)} className="btn btn-primary">
            <ArrowRightLeft size={16} />
            <span>Nueva Transferencia</span>
          </button>
        </div>
      </div>

      {/* Tabs & Warehouse Filter */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('stock')}
            className={`btn btn-sm ${activeTab === 'stock' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Warehouse size={15} />
            <span>Existencias</span>
          </button>
          <button
            onClick={() => setActiveTab('kardex')}
            className={`btn btn-sm ${activeTab === 'kardex' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <History size={15} />
            <span>Kardex de Movimientos</span>
          </button>
          <button
            onClick={() => setActiveTab('lots')}
            className={`btn btn-sm ${activeTab === 'lots' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Layers size={15} />
            <span>Lotes & Antigüedad ({lotsList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`btn btn-sm ${activeTab === 'analysis' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Activity size={15} />
            <span>Análisis de Rotación</span>
          </button>
          <button
            onClick={() => setActiveTab('transfers')}
            className={`btn btn-sm ${activeTab === 'transfers' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <ArrowRightLeft size={15} />
            <span>Transferencias ({transfers.length})</span>
          </button>
        </div>

        {/* Warehouse Selector */}
        {activeTab !== 'transfers' && activeTab !== 'analysis' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Almacén:</span>
            <select
              className="select-control"
              value={selectedWarehouse}
              onChange={(e) => setSelectedWarehouse(e.target.value)}
              style={{ width: '200px', height: '36px', fontSize: '0.78rem' }}
            >
              <option value="">Todos los Almacenes</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: STOCK EXISTENCIAS */}
      {activeTab === 'stock' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Código / SKU</th>
                <th>Producto</th>
                <th>Línea / Tono</th>
                <th>Almacén</th>
                <th>Stock Actual</th>
                <th>Mínimo Alerta</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>Cargando stock...</td></tr>
              ) : stockList.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay existencias registradas.</td></tr>
              ) : (
                stockList.map((item, idx) => {
                  const isLow = Number(item.quantity) <= Number(item.stock_min);
                  const isOut = Number(item.quantity) <= 0;

                  return (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{item.sku}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.product_name}</td>
                      <td>
                        {item.shade_number ? (
                          <span className="badge" style={{ background: 'rgba(236, 72, 153, 0.15)', color: '#f472b6' }}>
                            Tono {item.shade_number}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{item.line || '-'}</span>
                        )}
                      </td>
                      <td>{item.warehouse_name}</td>
                      <td style={{ fontWeight: 800, fontSize: '0.95rem', color: isOut ? 'var(--danger)' : isLow ? 'var(--warning)' : 'var(--success)' }}>
                        {item.quantity} {item.unit_code || 'und'}
                      </td>
                      <td>{item.stock_min}</td>
                      <td>
                        <span className={`badge ${isOut ? 'badge-danger' : isLow ? 'badge-warning' : 'badge-success'}`}>
                          {isOut ? 'Agotado' : isLow ? 'Stock Bajo' : 'Óptimo'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: KARDEX */}
      {activeTab === 'kardex' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Almacén</th>
                <th>Producto</th>
                <th>Tipo Movimiento</th>
                <th>Cantidad</th>
                <th>Saldo Resultante</th>
                <th>Motivo / Referencia</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>Cargando kardex...</td></tr>
              ) : kardexList.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay movimientos registrados.</td></tr>
              ) : (
                kardexList.map(k => {
                  const isPositive = Number(k.quantity) > 0;
                  return (
                    <tr key={k.id}>
                      <td style={{ fontSize: '0.78rem' }}>{new Date(k.created_at).toLocaleString('es-DO')}</td>
                      <td>{k.warehouse_name}</td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.product_name}</td>
                      <td>
                        <span className={`badge ${isPositive ? 'badge-success' : 'badge-warning'}`} style={{ textTransform: 'capitalize' }}>
                          {k.movement_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: isPositive ? 'var(--success)' : 'var(--danger)' }}>
                        {isPositive ? `+${k.quantity}` : k.quantity}
                      </td>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>{k.balance_after}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{k.reason || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: LOTES & ANTIGÜEDAD (SECTION #19) */}
      {activeTab === 'lots' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>No. Lote</th>
                  <th>Producto</th>
                  <th>Almacén</th>
                  <th>Fecha Recepción</th>
                  <th>Días en Inventario</th>
                  <th>Fecha Vencimiento</th>
                  <th>Días Restantes</th>
                  <th>Cantidad Actual</th>
                  <th>Proveedor</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando lotes...</td></tr>
                ) : lotsList.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay lotes registrados.</td></tr>
                ) : (
                  lotsList.map(lot => {
                    const daysToExp = Number(lot.days_to_expiration);
                    const isNearExp = daysToExp <= 60 && daysToExp > 0;
                    const isExpired = daysToExp <= 0;

                    return (
                      <tr key={lot.id} style={{ background: isExpired ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {lot.lot_number}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lot.product_name}</div>
                          {lot.shade_number && (
                            <span style={{ fontSize: '0.7rem', color: '#f472b6' }}>Tono {lot.shade_number}</span>
                          )}
                        </td>
                        <td>{lot.warehouse_name}</td>
                        <td>{lot.entry_date}</td>
                        <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                          {lot.days_in_inventory || 0} días
                        </td>
                        <td style={{ color: isExpired ? 'var(--danger)' : isNearExp ? 'var(--warning)' : 'inherit', fontWeight: 600 }}>
                          {lot.expiration_date}
                        </td>
                        <td>
                          <span className={`badge ${isExpired ? 'badge-danger' : isNearExp ? 'badge-warning' : 'badge-success'}`}>
                            {isExpired ? 'Vencido' : `${daysToExp} días`}
                          </span>
                        </td>
                        <td style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.95rem' }}>
                          {lot.current_quantity} und.
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          {lot.supplier_name || 'Importación Directa'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: ANÁLISIS DE ROTACIÓN (SECTION #20) */}
      {activeTab === 'analysis' && analysisData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Controls & Rotation Filters */}
          <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Clasificación de Rotación de Inventario
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Filtro configurable de productos sin movimiento (Hueso / Dead Stock)
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Umbral Sin Movimiento:</span>
              <div style={{ display: 'flex', background: 'var(--bg-main)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {['60', '90', '120', '180'].map(days => (
                  <button
                    key={days}
                    onClick={() => setNoMovementDays(days)}
                    className={`btn btn-sm ${noMovementDays === days ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                  >
                    {days} Días
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
            <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Valoración Total Inventario</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                RD$ {Number(analysisData.totals?.total_valuation || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="card" style={{ padding: '16px', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
              <span style={{ fontSize: '0.72rem', color: '#10b981' }}>Alta Rotación</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                {analysisData.rotation_summary?.alta || 0} productos
              </p>
            </div>

            <div className="card" style={{ padding: '16px', textAlign: 'center', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
              <span style={{ fontSize: '0.72rem', color: '#3b82f6' }}>Media Rotación</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#3b82f6', marginTop: '4px' }}>
                {analysisData.rotation_summary?.media || 0} productos
              </p>
            </div>

            <div className="card" style={{ padding: '16px', textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
              <span style={{ fontSize: '0.72rem', color: '#ef4444' }}>Sin Movimiento (+{noMovementDays}d)</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                {analysisData.rotation_summary?.sin_movimiento || 0} productos
              </p>
            </div>
          </div>

          {/* Products Rotation Table */}
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Línea / Marca</th>
                  <th>Stock Actual</th>
                  <th>Ventas Últimos 30 Días</th>
                  <th>Días sin Vender</th>
                  <th>Valor en Inventario</th>
                  <th>Clase de Rotación</th>
                </tr>
              </thead>
              <tbody>
                {analysisData.products?.map(p => {
                  const isDead = p.rotation_class === 'sin_movimiento';
                  const isHigh = p.rotation_class === 'alta';
                  const isMedium = p.rotation_class === 'media';

                  const badgeBg = isHigh ? 'rgba(16, 185, 129, 0.15)' : isMedium ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                  const badgeColor = isHigh ? 'var(--success)' : isMedium ? '#3b82f6' : 'var(--danger)';
                  const label = isHigh ? 'Alta Rotación' : isMedium ? 'Media Rotación' : 'Sin Movimiento';

                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.sku}</span>
                      </td>
                      <td>{p.brand_name || p.line || '-'}</td>
                      <td style={{ fontWeight: 700 }}>{p.current_stock} und.</td>
                      <td style={{ fontWeight: 700, color: '#38bdf8' }}>{p.units_sold_30d || 0} und.</td>
                      <td style={{ color: p.days_since_sale > 60 ? 'var(--danger)' : 'inherit' }}>
                        {p.days_since_sale === 999 ? 'Sin ventas' : `${p.days_since_sale} días`}
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                        RD$ {(Number(p.cost) * Number(p.current_stock)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <span className="badge" style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}40` }}>
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: TRANSFERENCIAS */}
      {activeTab === 'transfers' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>No. Transferencia</th>
                <th>Origen</th>
                <th>Destino</th>
                <th>Fecha</th>
                <th>Artículos</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>Cargando transferencias...</td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay transferencias registradas.</td></tr>
              ) : (
                transfers.map(tr => (
                  <tr key={tr.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{tr.transfer_number}</td>
                    <td>{tr.from_warehouse_name}</td>
                    <td>{tr.to_warehouse_name}</td>
                    <td>{new Date(tr.created_at).toLocaleDateString('es-DO')}</td>
                    <td>{tr.items?.length || 0} productos</td>
                    <td>
                      <span className={`badge ${tr.status === 'received' ? 'badge-success' : 'badge-warning'}`}>
                        {tr.status === 'received' ? 'Recibida' : 'En Tránsito'}
                      </span>
                    </td>
                    <td>
                      {tr.status !== 'received' ? (
                        <button onClick={() => handleReceiveTransfer(tr.id)} className="btn btn-primary btn-sm">
                          <CheckCircle size={14} />
                          <span>Recibir</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completada</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ADJUST MODAL */}
      {showAdjustModal && (
        <div className="modal-overlay" onClick={() => setShowAdjustModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Ajuste Físico de Inventario</h3>
            <form onSubmit={handleAdjustSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label-control">Almacén *</label>
                <select
                  required
                  className="select-control"
                  value={adjustData.warehouse_id}
                  onChange={(e) => setAdjustData({ ...adjustData, warehouse_id: e.target.value })}
                >
                  <option value="">Seleccionar Almacén...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-control">Producto *</label>
                <select
                  required
                  className="select-control"
                  value={adjustData.product_id}
                  onChange={(e) => setAdjustData({ ...adjustData, product_id: e.target.value })}
                >
                  <option value="">Seleccionar Producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Tipo de Ajuste</label>
                  <select
                    className="select-control"
                    value={adjustData.adjustment_type}
                    onChange={(e) => setAdjustData({ ...adjustData, adjustment_type: e.target.value })}
                  >
                    <option value="in">Entrada (+)</option>
                    <option value="out">Salida (-)</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="input-control"
                    value={adjustData.quantity}
                    onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">Motivo del Ajuste</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Ej: Conteo físico fin de mes / Merma"
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowAdjustModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Aplicar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSFER MODAL */}
      {showTransferModal && (
        <div className="modal-overlay" onClick={() => setShowTransferModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Nueva Transferencia de Mercancía</h3>
            <form onSubmit={handleTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Almacén Origen *</label>
                  <select
                    required
                    className="select-control"
                    value={transferData.from_warehouse_id}
                    onChange={(e) => setTransferData({ ...transferData, from_warehouse_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-control">Almacén Destino *</label>
                  <select
                    required
                    className="select-control"
                    value={transferData.to_warehouse_id}
                    onChange={(e) => setTransferData({ ...transferData, to_warehouse_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-control">Producto a Transferir *</label>
                <select
                  required
                  className="select-control"
                  value={transferData.items[0].product_id}
                  onChange={(e) => setTransferData({
                    ...transferData,
                    items: [{ ...transferData.items[0], product_id: e.target.value }]
                  })}
                >
                  <option value="">Seleccionar Producto...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-control">Cantidad *</label>
                <input
                  type="number"
                  min="1"
                  required
                  className="input-control"
                  value={transferData.items[0].quantity}
                  onChange={(e) => setTransferData({
                    ...transferData,
                    items: [{ ...transferData.items[0], quantity: e.target.value }]
                  })}
                />
              </div>

              <div>
                <label className="label-control">Notas / Observaciones</label>
                <input
                  type="text"
                  className="input-control"
                  value={transferData.notes}
                  onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowTransferModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Emitir Transferencia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
