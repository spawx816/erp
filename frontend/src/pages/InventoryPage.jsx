import React, { useState, useEffect, useMemo } from 'react';
import {
  Warehouse, ArrowRightLeft, Sliders, History, Search,
  Plus, CheckCircle, AlertTriangle, X, Layers, Activity,
  Calendar, Package, Clock, CheckCircle2, AlertCircle,
  Filter, Tag, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Trash2
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function InventoryPage({ initialTab = 'stock' }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab); // 'stock' | 'kardex' | 'lots' | 'analysis' | 'transfers'

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [stockList, setStockList] = useState([]);
  const [kardexList, setKardexList] = useState([]);
  const [lotsList, setLotsList] = useState([]);
  const [analysisData, setAnalysisData] = useState(null);
  const [noMovementDays, setNoMovementDays] = useState('60');
  const [analysisPage, setAnalysisPage] = useState(1);
  const [analysisPageSize, setAnalysisPageSize] = useState(15);
  const [analysisClassFilter, setAnalysisClassFilter] = useState('all'); // 'all' | 'alta' | 'media' | 'sin_movimiento'
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [kardexMovementType, setKardexMovementType] = useState('all');

  // Modals
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  // Adjust Form
  const [adjustData, setAdjustData] = useState({
    warehouse_id: '',
    product_id: '',
    adjustment_type: 'in', // 'in' | 'out' | 'physical_count' | 'purchase_return' | 'initial'
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
  }, [activeTab, selectedWarehouse, noMovementDays, search, kardexMovementType]);

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
      const res = await api.get('/inventory/stock', { warehouse_id: selectedWarehouse, search });
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
      const res = await api.get('/inventory/kardex', {
        warehouse_id: selectedWarehouse,
        movement_type: kardexMovementType !== 'all' ? kardexMovementType : undefined,
        search
      });
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

  // Filtrado y Paginación para Análisis de Rotación
  useEffect(() => {
    setAnalysisPage(1);
  }, [noMovementDays, analysisClassFilter, search]);

  const filteredAnalysisProducts = useMemo(() => {
    if (!analysisData?.products) return [];
    let list = analysisData.products;

    if (analysisClassFilter !== 'all') {
      list = list.filter(p => p.rotation_class === analysisClassFilter);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.brand_name && p.brand_name.toLowerCase().includes(q)) ||
        (p.line && p.line.toLowerCase().includes(q))
      );
    }

    return list;
  }, [analysisData?.products, analysisClassFilter, search]);

  const totalAnalysisPages = Math.max(1, Math.ceil(filteredAnalysisProducts.length / analysisPageSize));

  useEffect(() => {
    if (analysisPage > totalAnalysisPages) {
      setAnalysisPage(1);
    }
  }, [totalAnalysisPages, analysisPage]);

  const paginatedAnalysisProducts = useMemo(() => {
    const start = (analysisPage - 1) * analysisPageSize;
    return filteredAnalysisProducts.slice(start, start + analysisPageSize);
  }, [filteredAnalysisProducts, analysisPage, analysisPageSize]);

  const analysisPageNumbers = useMemo(() => {
    const pages = [];
    const maxButtons = 5;
    let start = Math.max(1, analysisPage - 2);
    let end = Math.min(totalAnalysisPages, start + maxButtons - 1);

    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [analysisPage, totalAnalysisPages]);

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
      const validItems = transferData.items.filter(i => i.product_id && Number(i.quantity) > 0);
      if (validItems.length === 0) {
        return addToast('Debe agregar al menos un producto con cantidad válida.', 'warning');
      }
      const res = await api.post('/inventory/transfers', {
        ...transferData,
        items: validItems
      });
      if (res.success) {
        addToast('Transferencia creada exitosamente.', 'success');
        setShowTransferModal(false);
        setTransferData({
          from_warehouse_id: '',
          to_warehouse_id: '',
          notes: '',
          items: [{ product_id: '', quantity: '1' }]
        });
        loadTransfers();
      }
    } catch (err) {
      addToast(err.message || 'Error en transferencia.', 'error');
    }
  };

  const handleAddTransferItem = () => {
    setTransferData(prev => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: '1' }]
    }));
  };

  const handleRemoveTransferItem = (idx) => {
    if (transferData.items.length <= 1) return;
    setTransferData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx)
    }));
  };

  const handleTransferItemChange = (idx, field, value) => {
    setTransferData(prev => {
      const newItems = [...prev.items];
      newItems[idx] = { ...newItems[idx], [field]: value };
      return { ...prev, items: newItems };
    });
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

        {/* Warehouse & Search Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-control"
              placeholder="Buscar en inventario..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '30px', height: '36px', fontSize: '0.78rem' }}
            />
          </div>

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

          {activeTab === 'kardex' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Tipo Mov.:</span>
              <select
                className="select-control"
                value={kardexMovementType}
                onChange={(e) => setKardexMovementType(e.target.value)}
                style={{ width: '190px', height: '36px', fontSize: '0.78rem' }}
              >
                <option value="all">Todos los Movimientos</option>
                <option value="physical_count">Conteo Físico</option>
                <option value="adjustment_in">Ajuste Entrada (+)</option>
                <option value="adjustment_out">Ajuste Salida (-)</option>
                <option value="initial">Inventario Inicial</option>
                <option value="purchase">Compra de Mercancía</option>
                <option value="purchase_return">Devolución a Proveedor</option>
                <option value="sale">Venta POS / Factura</option>
                <option value="sale_return">Devolución de Cliente</option>
                <option value="transfer_in">Transferencia (Entrada)</option>
                <option value="transfer_out">Transferencia (Salida)</option>
              </select>
            </div>
          )}
        </div>
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
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 600 }}>{item.sku || item.product_sku}</td>
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
                <th>Producto / SKU</th>
                <th>Tipo Movimiento</th>
                <th>Cantidad</th>
                <th>Stock Resultante</th>
                <th>Usuario / Referencia</th>
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
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{k.product_name}</div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{k.sku || k.product_sku}</span>
                      </td>
                      <td>
                        <span className={`badge ${isPositive ? 'badge-success' : 'badge-warning'}`} style={{ textTransform: 'capitalize' }}>
                          {k.movement_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: isPositive ? 'var(--success)' : 'var(--danger)' }}>
                        {isPositive ? `+${k.quantity}` : k.quantity}
                      </td>
                      <td style={{ fontWeight: 800, color: '#38bdf8' }}>{k.new_quantity}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <div>{k.user_name || k.username || 'Sistema'}</div>
                        {k.reason && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{k.reason}</span>}
                      </td>
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
            <div
              className="card"
              onClick={() => setAnalysisClassFilter('all')}
              style={{
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderColor: analysisClassFilter === 'all' ? '#3b82f6' : 'var(--border-color)',
                background: analysisClassFilter === 'all' ? 'rgba(59, 130, 246, 0.08)' : undefined,
                boxShadow: analysisClassFilter === 'all' ? '0 0 0 1px #3b82f6' : 'none'
              }}
              title="Click para ver todos los productos"
            >
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Valoración Total Inventario</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>
                RD$ {Number(analysisData.kpis?.total_valuation || analysisData.totals?.total_valuation || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </p>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {analysisData.products?.length || 0} productos analizados
              </span>
            </div>

            <div
              className="card"
              onClick={() => setAnalysisClassFilter(analysisClassFilter === 'alta' ? 'all' : 'alta')}
              style={{
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderColor: analysisClassFilter === 'alta' ? '#10b981' : 'rgba(16, 185, 129, 0.3)',
                background: analysisClassFilter === 'alta' ? 'rgba(16, 185, 129, 0.15)' : undefined,
                boxShadow: analysisClassFilter === 'alta' ? '0 0 0 1px #10b981' : 'none'
              }}
              title="Click para filtrar por Alta Rotación"
            >
              <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600 }}>Alta Rotación</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#10b981', marginTop: '4px' }}>
                {analysisData.rotation_summary?.alta || 0} productos
              </p>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {analysisClassFilter === 'alta' ? '● Filtro activo' : 'Click para filtrar'}
              </span>
            </div>

            <div
              className="card"
              onClick={() => setAnalysisClassFilter(analysisClassFilter === 'media' ? 'all' : 'media')}
              style={{
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderColor: analysisClassFilter === 'media' ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)',
                background: analysisClassFilter === 'media' ? 'rgba(59, 130, 246, 0.15)' : undefined,
                boxShadow: analysisClassFilter === 'media' ? '0 0 0 1px #3b82f6' : 'none'
              }}
              title="Click para filtrar por Media Rotación"
            >
              <span style={{ fontSize: '0.72rem', color: '#3b82f6', fontWeight: 600 }}>Media Rotación</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#3b82f6', marginTop: '4px' }}>
                {analysisData.rotation_summary?.media || 0} productos
              </p>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {analysisClassFilter === 'media' ? '● Filtro activo' : 'Click para filtrar'}
              </span>
            </div>

            <div
              className="card"
              onClick={() => setAnalysisClassFilter(analysisClassFilter === 'sin_movimiento' ? 'all' : 'sin_movimiento')}
              style={{
                padding: '16px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderColor: analysisClassFilter === 'sin_movimiento' ? '#ef4444' : 'rgba(239, 68, 68, 0.3)',
                background: analysisClassFilter === 'sin_movimiento' ? 'rgba(239, 68, 68, 0.15)' : undefined,
                boxShadow: analysisClassFilter === 'sin_movimiento' ? '0 0 0 1px #ef4444' : 'none'
              }}
              title="Click para filtrar por Sin Movimiento"
            >
              <span style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 600 }}>Sin Movimiento (+{noMovementDays}d)</span>
              <p style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ef4444', marginTop: '4px' }}>
                {analysisData.rotation_summary?.sin_movimiento || 0} productos
              </p>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {analysisClassFilter === 'sin_movimiento' ? '● Filtro activo' : 'Click para filtrar'}
              </span>
            </div>
          </div>

          {/* Quick Filter Chips Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: '4px' }}>Filtrar por:</span>
              <button
                onClick={() => setAnalysisClassFilter('all')}
                className={`btn btn-sm ${analysisClassFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: '20px' }}
              >
                Todos ({analysisData.products?.length || 0})
              </button>
              <button
                onClick={() => setAnalysisClassFilter('alta')}
                className={`btn btn-sm ${analysisClassFilter === 'alta' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '20px',
                  borderColor: analysisClassFilter === 'alta' ? '#10b981' : undefined,
                  background: analysisClassFilter === 'alta' ? '#10b981' : undefined,
                  color: analysisClassFilter === 'alta' ? '#fff' : '#10b981'
                }}
              >
                Alta Rotación ({analysisData.rotation_summary?.alta || 0})
              </button>
              <button
                onClick={() => setAnalysisClassFilter('media')}
                className={`btn btn-sm ${analysisClassFilter === 'media' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '20px',
                  borderColor: analysisClassFilter === 'media' ? '#3b82f6' : undefined,
                  background: analysisClassFilter === 'media' ? '#3b82f6' : undefined,
                  color: analysisClassFilter === 'media' ? '#fff' : '#3b82f6'
                }}
              >
                Media Rotación ({analysisData.rotation_summary?.media || 0})
              </button>
              <button
                onClick={() => setAnalysisClassFilter('sin_movimiento')}
                className={`btn btn-sm ${analysisClassFilter === 'sin_movimiento' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  borderRadius: '20px',
                  borderColor: analysisClassFilter === 'sin_movimiento' ? '#ef4444' : undefined,
                  background: analysisClassFilter === 'sin_movimiento' ? '#ef4444' : undefined,
                  color: analysisClassFilter === 'sin_movimiento' ? '#fff' : '#ef4444'
                }}
              >
                Sin Movimiento ({analysisData.rotation_summary?.sin_movimiento || 0})
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Página <strong style={{ color: 'var(--text-primary)' }}>{analysisPage}</strong> de <strong style={{ color: 'var(--text-primary)' }}>{totalAnalysisPages}</strong>
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
                {paginatedAnalysisProducts.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No se encontraron productos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  paginatedAnalysisProducts.map(p => {
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
                        <td style={{ color: (p.days_since_last_sale ?? 999) > 60 ? 'var(--danger)' : 'inherit' }}>
                          {p.days_since_last_sale === null || p.days_since_last_sale === undefined ? 'Sin ventas' : `${p.days_since_last_sale} días`}
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
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls Footer */}
          {filteredAnalysisProducts.length > 0 && (
            <div
              className="card"
              style={{
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginTop: '4px'
              }}
            >
              {/* Left: Rows Per Page Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mostrar</span>
                <select
                  className="select-control"
                  value={analysisPageSize}
                  onChange={(e) => {
                    setAnalysisPageSize(Number(e.target.value));
                    setAnalysisPage(1);
                  }}
                  style={{ width: '80px', height: '32px', fontSize: '0.8rem', padding: '0 8px' }}
                >
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>por página</span>
              </div>

              {/* Center: Showing X to Y of Z */}
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Mostrando <strong style={{ color: 'var(--text-primary)' }}>{(analysisPage - 1) * analysisPageSize + 1}</strong> - <strong style={{ color: 'var(--text-primary)' }}>{Math.min(analysisPage * analysisPageSize, filteredAnalysisProducts.length)}</strong> de <strong style={{ color: 'var(--text-primary)' }}>{filteredAnalysisProducts.length}</strong> productos
                {analysisClassFilter !== 'all' && (
                  <span style={{ marginLeft: '6px', color: 'var(--text-muted)' }}>
                    (filtrado por {analysisClassFilter === 'alta' ? 'Alta Rotación' : analysisClassFilter === 'media' ? 'Media Rotación' : 'Sin Movimiento'})
                  </span>
                )}
              </div>

              {/* Right: Page Navigation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setAnalysisPage(1)}
                  disabled={analysisPage <= 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Primera página"
                >
                  <ChevronsLeft size={14} />
                </button>

                <button
                  onClick={() => setAnalysisPage(p => Math.max(1, p - 1))}
                  disabled={analysisPage <= 1}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Página anterior"
                >
                  <ChevronLeft size={14} />
                </button>

                {analysisPageNumbers.map(p => (
                  <button
                    key={p}
                    onClick={() => setAnalysisPage(p)}
                    style={{
                      minWidth: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      border: p === analysisPage ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                      background: p === analysisPage ? '#3b82f6' : 'var(--bg-subtle)',
                      color: p === analysisPage ? '#ffffff' : 'var(--text-primary)',
                      fontWeight: p === analysisPage ? 700 : 500,
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => setAnalysisPage(p => Math.min(totalAnalysisPages, p + 1))}
                  disabled={analysisPage >= totalAnalysisPages}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Página siguiente"
                >
                  <ChevronRight size={14} />
                </button>

                <button
                  onClick={() => setAnalysisPage(totalAnalysisPages)}
                  disabled={analysisPage >= totalAnalysisPages}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '6px 8px', height: '32px' }}
                  title="Última página"
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            </div>
          )}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Tipo de Ajuste</label>
                  <select
                    className="select-control"
                    value={adjustData.adjustment_type}
                    onChange={(e) => setAdjustData({ ...adjustData, adjustment_type: e.target.value })}
                  >
                    <option value="in">Entrada por Ajuste (+)</option>
                    <option value="out">Salida por Ajuste / Merma (-)</option>
                    <option value="physical_count">Conteo Físico (Inventario Real)</option>
                    <option value="purchase_return">Devolución a Proveedor (-)</option>
                    <option value="initial">Inventario Inicial (+)</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">
                    {adjustData.adjustment_type === 'physical_count' ? 'Conteo Físico Real' : 'Cantidad'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    className="input-control"
                    value={adjustData.quantity}
                    onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })}
                  />
                </div>
              </div>

              {adjustData.adjustment_type === 'physical_count' && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontSize: '0.78rem',
                  color: '#38bdf8'
                }}>
                  ℹ️ <strong>Conteo Físico:</strong> Ingrese el stock real contado en anaquel. El sistema calculará automáticamente la diferencia con respecto a las existencias actuales registradas y creará el movimiento correspondiente.
                </div>
              )}

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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="label-control" style={{ marginBottom: 0 }}>Productos a Transferir *</label>
                  <button
                    type="button"
                    onClick={handleAddTransferItem}
                    className="btn btn-sm btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Plus size={13} />
                    <span>Agregar Producto</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
                  {transferData.items.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 90px 32px',
                        gap: '8px',
                        alignItems: 'center',
                        background: 'var(--bg-card)',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <select
                        required
                        className="select-control"
                        style={{ height: '34px', fontSize: '0.78rem' }}
                        value={item.product_id}
                        onChange={(e) => handleTransferItemChange(idx, 'product_id', e.target.value)}
                      >
                        <option value="">Seleccionar Producto...</option>
                        {products.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        step="any"
                        required
                        placeholder="Cant."
                        className="input-control"
                        style={{ height: '34px', fontSize: '0.78rem' }}
                        value={item.quantity}
                        onChange={(e) => handleTransferItemChange(idx, 'quantity', e.target.value)}
                      />

                      {transferData.items.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveTransferItem(idx)}
                          className="btn btn-sm btn-danger"
                          style={{ padding: '6px', height: '34px', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          title="Eliminar producto"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <div style={{ width: '32px' }} />
                      )}
                    </div>
                  ))}
                </div>
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
