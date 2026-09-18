import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardList, CheckCircle2, XCircle, PackageCheck,
  Clock, ArrowRight, Search, Eye, Filter, RefreshCw,
  User, Warehouse, DollarSign, AlertCircle, Send, Check,
  Receipt, CreditCard, Banknote, Building2
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function OrdersPage({ user, activeBranch, onNavigate }) {
  const { addToast } = useToast();
  const isManager = ['super-admin', 'admin', 'gerente'].includes(user?.role_slug);
  const isWarehouse = ['super-admin', 'admin', 'almacen'].includes(user?.role_slug);
  const isSeller = user?.role_slug === 'vendedor';

  // Default tab based on role
  const defaultTab = isManager ? 'pending' : (isWarehouse ? 'approved' : 'all');
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [rejectionModal, setRejectionModal] = useState({ open: false, orderId: null, orderNumber: '', reason: '' });
  const [invoiceModal, setInvoiceModal] = useState({
    open: false,
    order: null,
    paymentType: 'cash',
    fiscalType: 'B02',
    creditDays: 30,
    paymentMethod: 'cash',
    submitting: false
  });
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    loadOrders();
  }, [activeTab, search, activeBranch]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (activeBranch?.id) params.branch_id = activeBranch.id;

      if (activeTab === 'pending') params.status = 'pending_approval';
      else if (activeTab === 'approved') params.status = 'approved';
      else if (activeTab === 'dispatched') params.status = 'dispatched';
      else if (activeTab === 'invoiced') params.status = 'invoiced';

      const res = await api.get('/sales/orders', params);
      if (res.success) {
        setOrders(res.data || []);
        setSummary(res.summary || {});
      }
    } catch (err) {
      console.error('Error loading orders:', err);
      addToast('Error al cargar pedidos comerciales.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (orderId, orderNum) => {
    setProcessingId(orderId);
    try {
      const res = await api.post(`/sales/orders/${orderId}/approve`);
      if (res.success) {
        addToast(`Pedido ${orderNum} autorizado exitosamente por Gerencia.`, 'success');
        loadOrders();
        if (selectedOrder?.id === orderId) {
          setShowDetailModal(false);
        }
      }
    } catch (err) {
      addToast(err.message || 'Error autorizando pedido.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectionModal.reason || !rejectionModal.reason.trim()) {
      addToast('Ingrese el motivo de rechazo del pedido.', 'warning');
      return;
    }

    setProcessingId(rejectionModal.orderId);
    try {
      const res = await api.post(`/sales/orders/${rejectionModal.orderId}/reject`, {
        rejection_reason: rejectionModal.reason.trim()
      });
      if (res.success) {
        addToast(`Pedido ${rejectionModal.orderNumber} rechazado.`, 'info');
        setRejectionModal({ open: false, orderId: null, orderNumber: '', reason: '' });
        loadOrders();
        setShowDetailModal(false);
      }
    } catch (err) {
      addToast(err.message || 'Error rechazando pedido.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDispatch = async (orderId, orderNum) => {
    if (!window.confirm(`¿Confirmar despacho de mercancía del Pedido ${orderNum}? Se rebajará el stock físico del Kardex.`)) {
      return;
    }

    setProcessingId(orderId);
    try {
      const res = await api.post(`/sales/orders/${orderId}/dispatch`);
      if (res.success) {
        addToast(`Pedido ${orderNum} despachado exitosamente de Almacén.`, 'success');
        loadOrders();
        if (selectedOrder?.id === orderId) {
          setShowDetailModal(false);
        }
      }
    } catch (err) {
      addToast(err.message || 'Error despachando pedido.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenDetail = async (order) => {
    try {
      const res = await api.get(`/sales/orders/${order.id}`);
      if (res.success) {
        setSelectedOrder(res.data);
        setShowDetailModal(true);
      }
    } catch (err) {
      addToast('Error al cargar detalle del pedido.', 'error');
    }
  };

  const handleOpenInvoiceModal = (order) => {
    const isCreditDefault = order.payment_type === 'credit' || (Number(order.credit_limit || 0) > 0);
    const defaultFiscal = order.fiscal_type_code || (order.customer_tax_id ? 'B01' : 'B02');
    setInvoiceModal({
      open: true,
      order,
      paymentType: isCreditDefault ? 'credit' : 'cash',
      fiscalType: defaultFiscal,
      creditDays: order.credit_days || Number(order.payment_terms_days) || 30,
      paymentMethod: 'cash',
      submitting: false
    });
  };

  const handleInvoiceSubmit = async () => {
    const { order, paymentType, fiscalType, creditDays, paymentMethod } = invoiceModal;
    if (!order) return;

    setInvoiceModal(prev => ({ ...prev, submitting: true }));
    try {
      let payments = [];
      if (paymentType === 'cash') {
        payments = [{ payment_method: paymentMethod, amount: Number(order.total) }];
      } else {
        payments = [{ payment_method: 'credit', amount: Number(order.total) }];
      }

      const payload = {
        fiscal_type_code: fiscalType,
        payment_type: paymentType,
        credit_days: paymentType === 'credit' ? creditDays : 0,
        payments
      };

      const res = await api.post(`/sales/orders/${order.id}/invoice`, payload);
      if (res.success) {
        addToast(`¡Factura ${res.data.invoiceNumber || res.data.saleNumber} emitida exitosamente con NCF ${res.data.ncf}!`, 'success');
        setInvoiceModal({ open: false, order: null, submitting: false });
        loadOrders();
        if (selectedOrder?.id === order.id) {
          setShowDetailModal(false);
        }
      }
    } catch (err) {
      addToast(err.message || 'Error facturando pedido.', 'error');
    } finally {
      setInvoiceModal(prev => ({ ...prev, submitting: false }));
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending_approval':
        return <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Por Autorizar</span>;
      case 'approved':
        return <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Autorizado / Almacén</span>;
      case 'dispatched':
        return <span className="badge badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><PackageCheck size={12} /> Despachado</span>;
      case 'invoiced':
        return <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={12} /> Facturado (NCF)</span>;
      case 'rejected':
        return <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><XCircle size={12} /> Rechazado</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
          }}>
            <ClipboardList size={26} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              Flujo Comercial de Pedidos
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Vendedor (Preventa) ──► Gerencia (Autorización) ──► Almacén (Despacho Kardex) ──► Caja (Cobro)
            </p>
          </div>
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate('pos')}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: 700 }}
          >
            <Send size={16} />
            <span>Crear Pedido en POS</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: '10px', borderRadius: '10px', color: '#f59e0b' }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Por Autorizar</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.pendingCount || 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #06b6d4' }}>
          <div style={{ background: 'rgba(6, 182, 212, 0.15)', padding: '10px', borderRadius: '10px', color: '#06b6d4' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Autorizados (Almacén)</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.approvedCount || 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #3b82f6' }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: '10px', borderRadius: '10px', color: '#3b82f6' }}>
            <PackageCheck size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Despachados</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.dispatchedCount || 0}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', borderLeft: '4px solid #10b981' }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '10px', borderRadius: '10px', color: '#10b981' }}>
            <DollarSign size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Facturados</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{summary.invoicedCount || 0}</div>
          </div>
        </div>
      </div>

      {/* Controls & Tabs */}
      <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.04)', padding: '4px', borderRadius: '10px' }}>
            {isManager && (
              <button
                onClick={() => setActiveTab('pending')}
                className={`btn btn-sm ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700 }}
              >
                Por Autorizar ({summary.pendingCount || 0})
              </button>
            )}
            {isWarehouse && (
              <button
                onClick={() => setActiveTab('approved')}
                className={`btn btn-sm ${activeTab === 'approved' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700 }}
              >
                Listos para Despacho ({summary.approvedCount || 0})
              </button>
            )}
            <button
              onClick={() => setActiveTab('dispatched')}
              className={`btn btn-sm ${activeTab === 'dispatched' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700 }}
            >
              Despachados ({summary.dispatchedCount || 0})
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700 }}
            >
              Todos los Pedidos ({summary.totalCount || 0})
            </button>
          </div>

          {/* Search bar & Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative', minWidth: '280px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="text"
                className="input-control"
                placeholder="Buscar pedido, cliente, RNC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '38px', height: '38px', fontSize: '0.85rem' }}
              />
            </div>
            <button
              onClick={loadOrders}
              className="btn btn-secondary"
              style={{ height: '38px', width: '38px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="Actualizar lista"
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Orders Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th>No. Pedido</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Condición / NCF</th>
                <th>Vendedor</th>
                <th>Almacén</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Estado</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <RefreshCw size={18} className="spin" />
                      <span>Cargando pedidos...</span>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <ClipboardList size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <p style={{ margin: 0 }}>No hay pedidos en esta sección.</p>
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                  <tr key={order.id}>
                    <td>
                      <span style={{ fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px' }}>
                        {order.order_number}
                      </span>
                    </td>
                    <td>{new Date(order.created_at).toLocaleDateString('es-DO')}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{order.customer_name}</div>
                      {order.customer_tax_id && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RNC: {order.customer_tax_id}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {order.payment_type === 'credit' ? (
                          <span className="badge" style={{ background: 'rgba(2, 132, 199, 0.15)', color: '#38bdf8', border: '1px solid rgba(2, 132, 199, 0.3)', width: 'fit-content' }}>
                            💳 Crédito {order.credit_days ? `(${order.credit_days}d)` : ''}
                          </span>
                        ) : (
                          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', width: 'fit-content' }}>
                            💵 Contado
                          </span>
                        )}
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {order.fiscal_type_code === 'B01' ? 'B01 Crédito Fiscal' : (order.fiscal_type_code || 'B02')}
                        </span>
                      </div>
                    </td>
                    <td>{order.seller_name || order.seller_username}</td>
                    <td>{order.warehouse_name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text-primary)' }}>
                      RD$ {Number(order.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {getStatusBadge(order.status)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleOpenDetail(order)}
                          className="btn btn-sm btn-secondary"
                          style={{ padding: '4px 8px' }}
                          title="Ver detalle"
                        >
                          <Eye size={14} />
                        </button>

                        {/* Gerente Action: Approve / Reject */}
                        {isManager && order.status === 'pending_approval' && (
                          <>
                            <button
                              onClick={() => handleApprove(order.id, order.order_number)}
                              disabled={processingId === order.id}
                              className="btn btn-sm btn-success"
                              style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700 }}
                            >
                              ✓ Autorizar
                            </button>
                            <button
                              onClick={() => setRejectionModal({ open: true, orderId: order.id, orderNumber: order.order_number, reason: '' })}
                              disabled={processingId === order.id}
                              className="btn btn-sm btn-danger"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              ✕
                            </button>
                          </>
                        )}

                        {/* Almacen Action: Dispatch */}
                        {isWarehouse && order.status === 'approved' && (
                          <button
                            onClick={() => handleDispatch(order.id, order.order_number)}
                            disabled={processingId === order.id}
                            className="btn btn-sm btn-primary"
                            style={{ padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: '#3b82f6' }}
                          >
                            <PackageCheck size={14} style={{ marginRight: '4px' }} />
                            Despachar
                          </button>
                        )}

                        {/* Facturación Directa */}
                        {['dispatched', 'approved'].includes(order.status) && !order.sale_id && (
                          <button
                            onClick={() => handleOpenInvoiceModal(order)}
                            disabled={processingId === order.id}
                            className="btn btn-sm btn-success"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#10b981' }}
                            title="Emitir Factura Oficial con NCF"
                          >
                            <Receipt size={13} />
                            <span>Facturar</span>
                          </button>
                        )}

                        {order.sale_id && (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Check size={12} /> {order.invoice_ncf || order.sale_number || 'Facturado'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {showDetailModal && selectedOrder && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div className="card" style={{ maxWidth: '750px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Detalle de Pedido: {selectedOrder.order_number}</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Creado el {new Date(selectedOrder.created_at).toLocaleString('es-DO')} por {selectedOrder.seller_name}
                </div>
              </div>
              <div>{getStatusBadge(selectedOrder.status)}</div>
            </div>

            {/* Traceability Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CLIENTE:</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedOrder.customer_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>RNC: {selectedOrder.customer_tax_id || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>AUTORIZADO POR:</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedOrder.approved_by_name || 'Pendiente'}</div>
                {selectedOrder.approved_at && (
                  <div style={{ fontSize: '0.72rem', color: '#10b981' }}>{new Date(selectedOrder.approved_at).toLocaleDateString('es-DO')}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DESPACHADO POR:</div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{selectedOrder.dispatched_by_name || 'Pendiente'}</div>
                {selectedOrder.dispatched_at && (
                  <div style={{ fontSize: '0.72rem', color: '#38bdf8' }}>{new Date(selectedOrder.dispatched_at).toLocaleDateString('es-DO')}</div>
                )}
              </div>
            </div>

            {selectedOrder.rejection_reason && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', color: '#ef4444', fontSize: '0.85rem', marginBottom: '16px' }}>
                <strong>Motivo de Rechazo:</strong> {selectedOrder.rejection_reason}
              </div>
            )}

            {/* Items Table */}
            <table className="table" style={{ width: '100%', fontSize: '0.82rem', marginBottom: '16px' }}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th style={{ textAlign: 'center' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Desc.</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(selectedOrder.items || []).map(it => (
                  <tr key={it.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SKU: {it.sku} {it.variant_name ? `(${it.variant_name})` : ''}</div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{Number(it.quantity)}</td>
                    <td style={{ textAlign: 'right' }}>RD$ {Number(it.unit_price).toFixed(2)}</td>
                    <td style={{ textAlign: 'right', color: Number(it.discount_amount) > 0 ? '#f59e0b' : 'inherit' }}>
                      {Number(it.discount_amount) > 0 ? `-RD$ ${Number(it.discount_amount).toFixed(2)}` : '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>RD$ {Number(it.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginBottom: '20px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Subtotal: <strong>RD$ {Number(selectedOrder.subtotal).toFixed(2)}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                ITBIS: <strong>RD$ {Number(selectedOrder.tax_amount).toFixed(2)}</strong>
              </div>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
                TOTAL: RD$ {Number(selectedOrder.total).toFixed(2)}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowDetailModal(false)}
                className="btn btn-secondary"
              >
                Cerrar
              </button>

              {isManager && selectedOrder.status === 'pending_approval' && (
                <button
                  onClick={() => handleApprove(selectedOrder.id, selectedOrder.order_number)}
                  className="btn btn-success"
                  style={{ fontWeight: 700 }}
                >
                  ✓ Autorizar Pedido
                </button>
              )}

              {isWarehouse && selectedOrder.status === 'approved' && (
                <button
                  onClick={() => handleDispatch(selectedOrder.id, selectedOrder.order_number)}
                  className="btn btn-primary"
                  style={{ fontWeight: 700 }}
                >
                  <PackageCheck size={16} style={{ marginRight: '6px' }} />
                  Despachar de Almacén
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REJECTION REASON MODAL */}
      {rejectionModal.open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px'
        }}>
          <div className="card" style={{ maxWidth: '440px', width: '100%', padding: '20px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#ef4444' }}>
              Rechazar Pedido {rejectionModal.orderNumber}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Indique el motivo por el cual no se autoriza este pedido comercial:
            </p>
            <textarea
              className="input-control"
              rows={3}
              placeholder="Ej: Límite de crédito superado, precio desactualizado..."
              value={rejectionModal.reason}
              onChange={(e) => setRejectionModal(prev => ({ ...prev, reason: e.target.value }))}
              style={{ width: '100%', marginBottom: '16px', fontSize: '0.85rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setRejectionModal({ open: false, orderId: null, orderNumber: '', reason: '' })}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectConfirm}
                className="btn btn-danger"
                style={{ fontWeight: 700 }}
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIRECT INVOICE MODAL (NCF + CRÉDITO / CONTADO) */}
      {invoiceModal.open && invoiceModal.order && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px'
        }}>
          <div className="card" style={{ maxWidth: '520px', width: '100%', padding: '24px', background: 'var(--bg-header)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.75)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <Receipt size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Facturar Pedido {invoiceModal.order.order_number}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Emisión de Factura Fiscal Oficial con NCF DGII
                  </div>
                </div>
              </div>
            </div>

            {/* Order info summary */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Cliente:</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{invoiceModal.order.customer_name}</span>
              </div>
              {invoiceModal.order.customer_tax_id && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>RNC / Cédula:</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#60a5fa' }}>{invoiceModal.order.customer_tax_id}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-color)', paddingTop: '6px', marginTop: '6px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Total a Facturar:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
                  RD$ {Number(invoiceModal.order.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              {/* Comprobante Fiscal Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  TIPO DE COMPROBANTE FISCAL (NCF):
                </label>
                <select
                  value={invoiceModal.fiscalType}
                  onChange={(e) => setInvoiceModal(prev => ({ ...prev, fiscalType: e.target.value }))}
                  className="input-control"
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem', fontWeight: 600 }}
                >
                  <option value="B01">B01 - Factura de Crédito Fiscal (Empresas con RNC)</option>
                  <option value="B02">B02 - Factura de Consumo Final</option>
                  <option value="B14">B14 - Régimen Especial de Tributación</option>
                  <option value="B15">B15 - Comprobante Gubernamental</option>
                </select>
              </div>

              {/* Condición de Pago: Crédito vs Contado */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  CONDICIÓN DE PAGO:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setInvoiceModal(prev => ({ ...prev, paymentType: 'credit' }))}
                    className={`btn ${invoiceModal.paymentType === 'credit' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ height: '40px', gap: '6px', fontSize: '0.85rem' }}
                  >
                    <CreditCard size={16} />
                    <span>💳 A Crédito</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceModal(prev => ({ ...prev, paymentType: 'cash' }))}
                    className={`btn ${invoiceModal.paymentType === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ height: '40px', gap: '6px', fontSize: '0.85rem' }}
                  >
                    <Banknote size={16} />
                    <span>💵 Al Contado</span>
                  </button>
                </div>
              </div>

              {/* Details for Credit */}
              {invoiceModal.paymentType === 'credit' ? (
                <div style={{ background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.3)', padding: '12px 14px', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#38bdf8' }}>Plazo de Crédito:</span>
                    <select
                      value={invoiceModal.creditDays}
                      onChange={(e) => setInvoiceModal(prev => ({ ...prev, creditDays: Number(e.target.value) }))}
                      className="input-control"
                      style={{ height: '32px', width: '130px', fontSize: '0.82rem' }}
                    >
                      <option value={15}>15 días</option>
                      <option value={30}>30 días</option>
                      <option value={45}>45 días</option>
                      <option value={60}>60 días</option>
                      <option value={90}>90 días</option>
                    </select>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    ℹ️ Se registrará la factura en <strong>Cuentas por Cobrar (CxC)</strong> con balance pendiente. No requiere apertura de caja física.
                  </div>
                </div>
              ) : (
                /* Details for Cash */
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    MÉTODO DE COBRO:
                  </label>
                  <select
                    value={invoiceModal.paymentMethod}
                    onChange={(e) => setInvoiceModal(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    className="input-control"
                    style={{ width: '100%', height: '38px', fontSize: '0.85rem' }}
                  >
                    <option value="cash">Efectivo en Caja</option>
                    <option value="card">Tarjeta de Débito / Crédito</option>
                    <option value="transfer">Transferencia Bancaria</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setInvoiceModal({ open: false, order: null, submitting: false })}
                className="btn btn-secondary"
                disabled={invoiceModal.submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleInvoiceSubmit}
                disabled={invoiceModal.submitting}
                className="btn btn-success"
                style={{ fontWeight: 700, padding: '0 20px', gap: '8px', display: 'flex', alignItems: 'center', background: '#10b981' }}
              >
                {invoiceModal.submitting ? <RefreshCw size={16} className="spin" /> : <Receipt size={16} />}
                <span>{invoiceModal.submitting ? 'Emitiendo Factura...' : 'Emitir Factura Fiscal'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
