import React, { useState, useEffect } from 'react';
import {
  FileX, Search, Eye, X, Ban,
  Building2, User, Clock,
  ArrowLeftRight, Wallet, CreditCard, Package, RefreshCw
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => `RD$ ${Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
const fmtDate = (d) => new Date(d).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });

const ACTION_LABELS = {
  refund_cash: { label: 'Reembolso Efectivo', icon: Wallet, color: '#10b981' },
  credit_cxc: { label: 'Nota en CxC', icon: ArrowLeftRight, color: '#3b82f6' },
  store_credit: { label: 'Crédito Tienda', icon: CreditCard, color: '#f59e0b' }
};
const RETURN_LABELS = {
  total: { label: 'Anulación Total', color: '#ef4444' },
  partial: { label: 'Devolución Parcial', color: '#f59e0b' },
  financial_adjustment: { label: 'Ajuste Financiero', color: '#8b5cf6' }
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function CreditNoteDetailModal({ cn, onClose }) {
  const action = ACTION_LABELS[cn.action_taken] || { label: cn.action_taken, color: '#94a3b8' };
  const retType = RETURN_LABELS[cn.return_type] || { label: cn.return_type, color: '#94a3b8' };
  const ActionIcon = action.icon || FileX;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '680px', padding: '28px', background: 'var(--bg-header)', border: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileX size={22} color="#ef4444" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Nota de Crédito {cn.credit_note_number}
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#ef4444', fontWeight: 700 }}>
                  {cn.ncf}
                </span>
                <span className="badge" style={{ background: `${retType.color}20`, color: retType.color, fontSize: '0.68rem' }}>
                  {retType.label}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '6px' }}>
            <X size={15} />
          </button>
        </div>

        {/* Meta Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '20px' }}>
          <div style={{ background: 'var(--bg-subtle)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              {cn.customer_tax_id ? <Building2 size={13} color="var(--text-muted)" /> : <User size={13} color="var(--text-muted)" />}
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Cliente</span>
            </div>
            <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{cn.customer_name}</p>
            {cn.customer_tax_id && <p style={{ fontSize: '0.72rem', color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{cn.customer_tax_id}</p>}
          </div>

          <div style={{ background: 'var(--bg-subtle)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <ArrowLeftRight size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Venta Origen</span>
            </div>
            <p style={{ fontWeight: 700, color: '#60a5fa', fontFamily: 'var(--font-mono)', fontSize: '0.88rem' }}>
              {cn.original_sale_number}
            </p>
            <p style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{cn.original_ncf}</p>
          </div>

          <div style={{ background: 'var(--bg-subtle)', borderRadius: '10px', padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Clock size={13} color="var(--text-muted)" />
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Fecha Emisión</span>
            </div>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.82rem' }}>{fmtDate(cn.created_at)}</p>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{cn.user_name}</p>
          </div>
        </div>

        {/* Reason */}
        <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: '10px', padding: '12px', marginBottom: '20px' }}>
          <p style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase' }}>Motivo</p>
          <p style={{ fontSize: '0.88rem', color: '#fca5a5' }}>{cn.reason}</p>
        </div>

        {/* Items */}
        {cn.items && cn.items.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px', textTransform: 'uppercase' }}>
              Artículos Devueltos
            </p>
            <div className="table-container">
              <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                    <th style={{ textAlign: 'right' }}>ITBIS</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'center' }}>A Inventario</th>
                  </tr>
                </thead>
                <tbody>
                  {cn.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{item.product_name}</strong>
                        {item.variant_attrs && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {(() => {
                              try {
                                const parsed = JSON.parse(item.variant_attrs);
                                return Array.isArray(parsed) ? parsed.join(', ') : (parsed?.name || item.variant_attrs);
                              } catch {
                                return item.variant_attrs;
                              }
                            })()}
                          </div>
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{item.sku}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{Number(item.quantity)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(item.subtotal)}</td>
                      <td style={{ textAlign: 'right', color: '#f59e0b' }}>
                        {Number(item.tax_rate || 0)}% / {fmt(item.tax_amount)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#ef4444' }}>{fmt(item.total)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {item.returned_to_inventory
                          ? <span style={{ color: '#10b981' }}>✅</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Totals + Action */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {/* Totals */}
          <div style={{ background: 'var(--bg-subtle)', borderRadius: '10px', padding: '16px' }}>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '12px', textTransform: 'uppercase' }}>Resumen Financiero</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                <span style={{ fontWeight: 600 }}>{fmt(cn.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>ITBIS (18%)</span>
                <span style={{ fontWeight: 600, color: '#f59e0b' }}>{fmt(cn.tax_amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Total NC</span>
                <span style={{ fontWeight: 800, fontSize: '1rem', color: '#ef4444' }}>{fmt(cn.total)}</span>
              </div>
            </div>
          </div>

          {/* Action */}
          <div style={{ background: `${action.color}08`, border: `1.5px solid ${action.color}30`, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <ActionIcon size={28} color={action.color} />
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Acción Aplicada</p>
            <p style={{ fontWeight: 800, color: action.color, fontSize: '0.95rem', textAlign: 'center' }}>
              {action.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CreditNotesPage({ activeBranch }) {
  const { addToast } = useToast();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterReturnType, setFilterReturnType] = useState('');
  const [selectedNote, setSelectedNote] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Stats
  const totalNC = notes.reduce((s, n) => s + Number(n.total || 0), 0);
  const totalReturn = notes.filter(n => n.return_type === 'total').length;
  const totalPartial = notes.filter(n => n.return_type === 'partial').length;
  const totalStoreCredit = notes
    .filter(n => n.action_taken === 'store_credit')
    .reduce((s, n) => s + Number(n.total || 0), 0);

  useEffect(() => {
    loadNotes();
  }, [activeBranch, search, filterAction, filterReturnType]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const params = { search, action_taken: filterAction, return_type: filterReturnType };
      const res = await api.get('/sales/credit-notes/list', params);
      if (res.success) setNotes(res.data);
    } catch (err) {
      addToast('Error cargando Notas de Crédito.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const res = await api.get(`/sales/credit-notes/${id}`);
      if (res.success) setSelectedNote(res.data);
    } catch (err) {
      addToast('Error cargando detalle de Nota de Crédito.', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Notas de Crédito B04</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Registro oficial de anulaciones y devoluciones con NCF tipo B04 para DGII República Dominicana
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {[
          { label: 'Total Emitido en NC', value: fmt(totalNC), icon: FileX, color: '#ef4444', sub: `${notes.length} notas de crédito` },
          { label: 'Anulaciones Totales', value: totalReturn, icon: Ban, color: '#f97316', sub: 'facturas anuladas completamente' },
          { label: 'Devoluciones Parciales', value: totalPartial, icon: Package, color: '#8b5cf6', sub: 'devoluciones de ítems' },
          { label: 'Crédito en Tienda', value: fmt(totalStoreCredit), icon: CreditCard, color: '#f59e0b', sub: 'acreditado a clientes' }
        ].map((kpi, i) => {
          const KpiIcon = kpi.icon;
          return (
            <div key={i} className="card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{kpi.label}</span>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${kpi.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <KpiIcon size={16} color={kpi.color} />
                </div>
              </div>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</p>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
          <Search size={15} color="var(--text-muted)" style={{ position: 'absolute', left: '11px', top: '13px' }} />
          <input
            type="text"
            className="input-control"
            placeholder="Buscar por NCF, número NC o motivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>

        <select
          className="input-control"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{ width: '200px' }}
        >
          <option value="">Todas las acciones</option>
          <option value="refund_cash">💵 Reembolso Efectivo</option>
          <option value="credit_cxc">📊 Nota en CxC</option>
          <option value="store_credit">🎫 Crédito Tienda</option>
        </select>

        <select
          className="input-control"
          value={filterReturnType}
          onChange={(e) => setFilterReturnType(e.target.value)}
          style={{ width: '200px' }}
        >
          <option value="">Todos los tipos</option>
          <option value="total">Anulación Total</option>
          <option value="partial">Devolución Parcial</option>
          <option value="financial_adjustment">Ajuste Financiero</option>
        </select>

        <button onClick={loadNotes} className="btn btn-secondary btn-sm" title="Refrescar">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>No. NC</th>
              <th>NCF B04</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Factura Origen</th>
              <th>Tipo</th>
              <th>Acción</th>
              <th style={{ textAlign: 'right' }}>Total NC</th>
              <th>Emitido por</th>
              <th>Ver</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '40px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Cargando Notas de Crédito...</span>
                  </div>
                </td>
              </tr>
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan="10" style={{ textAlign: 'center', padding: '50px' }}>
                  <FileX size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay Notas de Crédito registradas.</p>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>
                    Las NC se generan al anular una venta desde el Historial de Ventas.
                  </p>
                </td>
              </tr>
            ) : (
              notes.map(nc => {
                const action = ACTION_LABELS[nc.action_taken] || { label: nc.action_taken, color: '#94a3b8' };
                const retType = RETURN_LABELS[nc.return_type] || { label: nc.return_type, color: '#94a3b8' };
                const ActionIcon = action.icon || FileX;
                return (
                  <tr key={nc.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60a5fa' }}>
                        {nc.credit_note_number}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#ef4444', fontSize: '0.82rem' }}>
                        {nc.ncf}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {fmtDate(nc.created_at)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.84rem' }}>{nc.customer_name}</div>
                      {nc.customer_tax_id && (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {nc.customer_tax_id}
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#38bdf8', fontWeight: 700 }}>
                        {nc.original_sale_number}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{nc.original_ncf}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: `${retType.color}15`, color: retType.color, fontSize: '0.68rem', fontWeight: 700 }}>
                        {retType.label}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ActionIcon size={13} color={action.color} />
                        <span style={{ fontSize: '0.78rem', color: action.color, fontWeight: 600 }}>{action.label}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>
                      {fmt(nc.total)}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {nc.user_name}
                    </td>
                    <td>
                      <button
                        onClick={() => handleViewDetail(nc.id)}
                        className="btn btn-secondary btn-sm"
                        disabled={loadingDetail}
                        title="Ver Detalle"
                        style={{ padding: '5px 10px' }}
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedNote && (
        <CreditNoteDetailModal
          cn={selectedNote}
          onClose={() => setSelectedNote(null)}
        />
      )}
    </div>
  );
}
