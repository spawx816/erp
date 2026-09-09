import React, { useState, useEffect } from 'react';
import {
  Receipt, Search, Printer, Ban, AlertCircle, X,
  FileX, CheckCircle, Undo2, ChevronRight, Building2,
  Wallet, CreditCard, Filter, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import ThermalReceipt from '../components/ThermalReceipt';

const ACTION_OPTIONS = [
  {
    value: 'refund_cash',
    label: 'Reembolso en Efectivo',
    description: 'Se devuelve el dinero al cliente directamente.',
    color: '#10b981'
  },
  {
    value: 'credit_cxc',
    label: 'Nota de Crédito en CxC',
    description: 'Se aplica como abono en la cuenta por cobrar del cliente.',
    color: '#3b82f6'
  },
  {
    value: 'store_credit',
    label: 'Crédito en Tienda',
    description: 'Se acredita al saldo disponible del cliente para próximas compras.',
    color: '#f59e0b'
  }
];

export default function SalesHistoryPage({ activeBranch }) {
  const { addToast } = useToast();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranch?.id !== undefined ? String(activeBranch.id) : '');
  const [branches, setBranches] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [cancelModalSale, setCancelModalSale] = useState(null);
  const [cancelReason, setCancelReason] = useState('Devolución de cliente');
  const [actionTaken, setActionTaken] = useState('refund_cash');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (activeBranch?.id !== undefined) {
      setSelectedBranchId(String(activeBranch.id));
    }
  }, [activeBranch]);

  useEffect(() => {
    api.get('/admin/branches-warehouses')
      .then(res => {
        if (res.success && Array.isArray(res.branches)) {
          setBranches(res.branches);
        }
      })
      .catch(err => console.error('Error fetching branches:', err));
  }, []);

  useEffect(() => {
    loadSales();
  }, [selectedBranchId, search, filterStatus, filterType]);

  const loadSales = async () => {
    setLoading(true);
    try {
      const params = {
        search: search || undefined,
        branch_id: selectedBranchId || undefined,
        status: filterStatus || undefined,
        sale_type: filterType || undefined,
        limit: 100
      };
      const res = await api.get('/sales', params);
      if (res.success) setSales(res.data || []);
    } catch (err) {
      console.error(err);
      addToast('Error cargando el listado de ventas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewReceipt = async (id) => {
    try {
      const res = await api.get(`/sales/${id}`);
      if (res.success) setSelectedSale(res.data);
    } catch (err) {
      addToast(err.message || 'Error cargando comprobante.', 'error');
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalSale) return;
    if (!cancelReason.trim()) {
      addToast('Debe ingresar un motivo de anulación.', 'warning');
      return;
    }
    setCancelling(true);
    try {
      const res = await api.post(`/sales/${cancelModalSale.id}/cancel`, {
        reason: cancelReason,
        action_taken: actionTaken
      });
      if (res.success) {
        addToast(
          `Venta anulada. NC B04 generada: ${res.credit_note?.ncf || ''}`,
          'success'
        );
        setCancelModalSale(null);
        setCancelReason('Devolución de cliente');
        setActionTaken('refund_cash');
        loadSales();
      }
    } catch (err) {
      addToast(err.message || 'Error anulando venta.', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const saleTypeLabel = (t) => {
    if (t === 'credit') return { label: 'Crédito', cls: 'badge-warning' };
    if (t === 'mixed') return { label: 'Mixta', cls: 'badge-info' };
    return { label: 'Contado', cls: 'badge-success' };
  };

  // KPIs
  const totalAmount = sales.filter(s => s.status !== 'cancelled').reduce((sum, s) => sum + Number(s.total || 0), 0);
  const cashCount = sales.filter(s => s.sale_type === 'cash' && s.status !== 'cancelled').length;
  const creditCount = sales.filter(s => s.sale_type === 'credit' && s.status !== 'cancelled').length;
  const cancelledCount = sales.filter(s => s.status === 'cancelled').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Ventas &amp; Facturación Histórica</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Histórico oficial de comprobantes fiscales emitidos (NCF DGII) y anulación con Notas de Crédito B04
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Facturación Activa</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={16} color="#3b82f6" />
            </div>
          </div>
          <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#60a5fa' }}>
            RD$ {totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{sales.filter(s => s.status !== 'cancelled').length} facturas activas</p>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Ventas al Contado</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wallet size={16} color="#10b981" />
            </div>
          </div>
          <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981' }}>{cashCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Efectivo, transferencias y tarjetas</p>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Ventas a Crédito</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={16} color="#f59e0b" />
            </div>
          </div>
          <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f59e0b' }}>{creditCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Con línea de crédito y balance CxC</p>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Facturas Anuladas</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ban size={16} color="#ef4444" />
            </div>
          </div>
          <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{cancelledCount}</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Con Nota de Crédito B04 generada</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            className="input-control"
            placeholder="Buscar por número de venta, NCF o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '38px', height: '38px' }}
          />
        </div>

        {/* Branch Filter */}
        <select
          className="select-control"
          value={selectedBranchId}
          onChange={(e) => setSelectedBranchId(e.target.value)}
          style={{ width: '220px', height: '38px', fontSize: '0.8rem' }}
        >
          <option value="">🏢 Todas las sucursales</option>
          {branches.map(b => (
            <option key={b.id} value={String(b.id)}>
              📍 {b.name}
            </option>
          ))}
        </select>

        {/* Status Filter */}
        <select
          className="select-control"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ width: '170px', height: '38px', fontSize: '0.8rem' }}
        >
          <option value="">Todos los estados</option>
          <option value="paid">✅ Pagadas</option>
          <option value="pending">⏳ Con Saldo Pendiente</option>
          <option value="cancelled">🚫 Anuladas</option>
        </select>

        {/* Sale Type Filter */}
        <select
          className="select-control"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ width: '160px', height: '38px', fontSize: '0.8rem' }}
        >
          <option value="">Todos los tipos</option>
          <option value="cash">Contado</option>
          <option value="credit">Crédito</option>
          <option value="mixed">Mixta</option>
        </select>

        <button
          onClick={loadSales}
          className="btn btn-secondary btn-sm"
          title="Refrescar listado"
          style={{ height: '38px', padding: '0 12px' }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Sales Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>No. Factura</th>
              <th>NCF</th>
              <th>Fecha</th>
              <th>Sucursal</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Total (RD$)</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando ventas...</td></tr>
            ) : sales.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay ventas registradas con los filtros seleccionados.</td></tr>
            ) : (
              sales.map(s => {
                const typeInfo = saleTypeLabel(s.sale_type);
                return (
                  <tr key={s.id} style={{ opacity: s.status === 'cancelled' ? 0.6 : 1 }}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>
                      {s.sale_number}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#38bdf8' }}>{s.ncf}</span>
                      <span style={{ fontSize: '0.68rem', display: 'block', color: 'var(--text-muted)' }}>{s.fiscal_type_code}</span>
                    </td>
                    <td style={{ fontSize: '0.78rem' }}>{new Date(s.created_at).toLocaleString('es-DO')}</td>
                    <td>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={12} color="#60a5fa" />
                        {s.branch_name || 'Principal'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.customer_name}</div>
                      {s.customer_tax_id && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{s.customer_tax_id}</span>}
                    </td>
                    <td>
                      <span className={`badge ${typeInfo.cls}`}>{typeInfo.label}</span>
                    </td>
                    <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                      RD$ {Number(s.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'cancelled' ? 'badge-danger' : s.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                        {s.status === 'cancelled' ? '🚫 Anulada' : s.status === 'paid' ? '✅ Pagada' : '⏳ Pendiente'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleViewReceipt(s.id)}
                          className="btn btn-secondary btn-sm"
                          title="Ver/Imprimir Comprobante"
                        >
                          <Printer size={14} />
                        </button>
                        {s.status !== 'cancelled' && (
                          <button
                            onClick={() => setCancelModalSale(s)}
                            className="btn btn-danger btn-sm"
                            title="Anular Venta → Nota de Crédito B04"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: ANULACIÓN / NOTA DE CRÉDITO B04 */}
      {cancelModalSale && (
        <div className="modal-overlay" onClick={() => setCancelModalSale(null)}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '28px' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileX size={18} color="#ef4444" />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Anular Venta #{cancelModalSale.sale_number}
                  </h3>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '44px' }}>
                  Se emitirá una <strong style={{ color: '#f59e0b' }}>Nota de Crédito B04</strong> oficial DGII
                </p>
              </div>
              <button onClick={() => setCancelModalSale(null)} className="btn btn-secondary btn-sm" style={{ padding: '5px' }}>
                <X size={15} />
              </button>
            </div>

            {/* Sale Summary */}
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', fontSize: '0.8rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Cliente</span>
                  <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>{cancelModalSale.customer_name}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>NCF Original</span>
                  <p style={{ fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{cancelModalSale.ncf}</p>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Total</span>
                  <p style={{ fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                    RD$ {Number(cancelModalSale.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Motivo */}
            <div style={{ marginBottom: '18px' }}>
              <label className="label-control">Motivo de Anulación *</label>
              <textarea
                rows="3"
                className="input-control"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Describa el motivo de la anulación..."
              />
            </div>

            {/* Acción */}
            <div style={{ marginBottom: '22px' }}>
              <label className="label-control" style={{ marginBottom: '10px', display: 'block' }}>
                Acción sobre el Importe *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ACTION_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: `1.5px solid ${actionTaken === opt.value ? opt.color : '#1e293b'}`,
                      background: actionTaken === opt.value ? `${opt.color}10` : '#0b1120',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <input
                      type="radio"
                      name="action_taken"
                      value={opt.value}
                      checked={actionTaken === opt.value}
                      onChange={() => setActionTaken(opt.value)}
                      style={{ marginTop: '3px', accentColor: opt.color }}
                    />
                    <div>
                      <div style={{ fontWeight: 700, color: actionTaken === opt.value ? opt.color : '#fff', fontSize: '0.88rem' }}>
                        {opt.label}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {opt.description}
                      </div>
                    </div>
                    {actionTaken === opt.value && (
                      <CheckCircle size={16} color={opt.color} style={{ marginLeft: 'auto', flexShrink: 0 }} />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Warning */}
            <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '8px', marginBottom: '18px', fontSize: '0.75rem', color: '#fbbf24' }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>Esta acción es <strong>irreversible</strong>. La mercancía se reintegrará al inventario y el NCF B04 quedará registrado en la DGII.</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setCancelModalSale(null)}
                className="btn btn-secondary"
                style={{ flex: 1 }}
                disabled={cancelling}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="btn btn-danger"
                style={{ flex: 1, gap: '6px' }}
                disabled={cancelling || !cancelReason.trim()}
              >
                {cancelling ? (
                  <span>Procesando...</span>
                ) : (
                  <>
                    <Undo2 size={15} />
                    <span>Confirmar Anulación</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT THERMAL RECEIPT */}
      {selectedSale && (
        <ThermalReceipt
          saleData={selectedSale}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </div>
  );
}
