import React, { useState, useEffect } from 'react';
import {
  UserCheck, Percent, Plus, Search, Eye, CheckCircle2,
  DollarSign, Target, TrendingUp, FileText, Printer,
  Phone, Mail, MapPin, Calendar, X, AlertCircle
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function SalespeoplePage({ user, initialTab = 'salespeople' }) {
  const { addToast } = useToast();
  const isVendedor = user?.role_slug === 'vendedor';
  const [activeTab, setActiveTab] = useState(isVendedor ? 'commissions' : initialTab); // 'salespeople' | 'commissions'

  useEffect(() => {
    if (initialTab) {
      setActiveTab(isVendedor ? 'commissions' : initialTab);
    }
  }, [initialTab, isVendedor]);
  const [salespeople, setSalespeople] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState(null);
  const [spDetails, setSpDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    phone: '',
    email: '',
    zone: 'Santo Domingo Centro',
    monthly_goal: '350000',
    commission_rate: '5.0',
    hire_date: new Date().toISOString().split('T')[0]
  });

  // Commission Payment Selection
  const [selectedCommissions, setSelectedCommissions] = useState([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [generatedReceipt, setGeneratedReceipt] = useState(null);
  const [filterSpId, setFilterSpId] = useState('ALL');
  const [filterCommStatus, setFilterCommStatus] = useState('ALL');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [spRes, commRes] = await Promise.all([
        api.get('/third-parties/salespeople'),
        api.get('/sales/commissions/list')
      ]);

      if (spRes.success) setSalespeople(spRes.data);
      if (commRes.success) setCommissions(commRes.data);
    } catch (err) {
      console.error('Error loading data:', err);
      addToast('Error al cargar datos de vendedores.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = async (sp) => {
    setSelectedSalesperson(sp);
    setLoadingDetails(true);
    try {
      const res = await api.get(`/third-parties/salespeople/${sp.id}`);
      if (res.success) {
        setSpDetails(res.data);
      }
    } catch (err) {
      addToast('Error al cargar perfil del vendedor.', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreateSalesperson = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/third-parties/salespeople', formData);
      if (res.success) {
        addToast('Vendedor creado exitosamente.', 'success');
        setShowNewModal(false);
        setFormData({
          name: '', code: '', phone: '', email: '',
          zone: 'Santo Domingo Centro', monthly_goal: '350000',
          commission_rate: '5.0', hire_date: new Date().toISOString().split('T')[0]
        });
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error al crear vendedor.', 'error');
    }
  };

  const handleToggleSelectCommission = (id) => {
    if (selectedCommissions.includes(id)) {
      setSelectedCommissions(selectedCommissions.filter(i => i !== id));
    } else {
      setSelectedCommissions([...selectedCommissions, id]);
    }
  };

  const handleSelectAllPending = () => {
    const pendingIds = filteredCommissions
      .filter(c => c.status === 'pending')
      .map(c => c.id);
    setSelectedCommissions(pendingIds);
  };

  const handleClearSelection = () => {
    setSelectedCommissions([]);
  };

  const handlePayCommissions = async () => {
    if (selectedCommissions.length === 0) {
      addToast('Seleccione al menos una comisión para pagar.', 'warning');
      return;
    }

    try {
      const res = await api.post('/sales/commissions/pay', {
        commission_ids: selectedCommissions,
        payment_method: 'transfer',
        notes: 'Pago liquidación de comisiones periódica'
      });

      if (res.success) {
        addToast(`Se liquidaron ${res.data.count} comisiones por un total de RD$ ${res.data.total_paid.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`, 'success');
        setGeneratedReceipt(res.data);
        setShowReceiptModal(true);
        setSelectedCommissions([]);
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error liquidando comisiones.', 'error');
    }
  };

  // Filtered salespeople
  const filteredSalespeople = salespeople.filter(sp => {
    return !search ||
      sp.name.toLowerCase().includes(search.toLowerCase()) ||
      sp.code.toLowerCase().includes(search.toLowerCase()) ||
      (sp.zone && sp.zone.toLowerCase().includes(search.toLowerCase()));
  });

  // Filtered commissions
  const filteredCommissions = commissions.filter(c => {
    const matchSp = filterSpId === 'ALL' || c.salesperson_id === parseInt(filterSpId, 10);
    const matchStatus = filterCommStatus === 'ALL' || c.status === filterCommStatus;
    const matchSearch = !search ||
      c.salesperson_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.sale_number && c.sale_number.toLowerCase().includes(search.toLowerCase()));
    return matchSp && matchStatus && matchSearch;
  });

  // KPI summaries
  const pendingCommissionsTotal = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  const paidCommissionsTotal = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header */}
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
            background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(59, 130, 246, 0.35)'
          }}>
            <UserCheck size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {isVendedor ? 'Mis Comisiones de Venta' : 'Fuerza de Ventas & Comisiones'}
              </h2>
              <span className="badge badge-success" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                {isVendedor ? 'Comercial' : 'Sección 8 & 27'}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {isVendedor
                ? 'Historial de comisiones generadas, estado de liquidación y facturas asociadas'
                : 'Gestión de vendedores, asignación permanente de clientes, metas mensuales y liquidación de comisiones'}
            </p>
          </div>
        </div>

        {!isVendedor && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setShowNewModal(true)} className="btn btn-primary">
              <Plus size={16} />
              <span>Nuevo Vendedor</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {!isVendedor && (
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <button
            onClick={() => setActiveTab('salespeople')}
            className={`btn btn-sm ${activeTab === 'salespeople' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <UserCheck size={16} />
            <span>Vendedores & Metas ({salespeople.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('commissions')}
            className={`btn btn-sm ${activeTab === 'commissions' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Percent size={16} />
            <span>Liquidación de Comisiones ({commissions.length})</span>
          </button>
        </div>
      )}

      {/* TAB 1: VENDEDORES */}
      {activeTab === 'salespeople' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Search bar */}
          <div className="card" style={{ padding: '14px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <input
                type="text"
                className="input-control"
                placeholder="Buscar vendedor por nombre, código o zona asignada..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '38px', height: '40px' }}
              />
            </div>
          </div>

          {/* Salespeople Cards Grid */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
              <div style={{ width: '28px', height: '28px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            </div>
          ) : filteredSalespeople.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No se encontraron vendedores registrados.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
              {filteredSalespeople.map(sp => {
                const goal = Number(sp.monthly_goal || 0);
                const salesAchieved = Number(sp.sales_this_month || 0);
                const percent = goal > 0 ? Math.min(100, Math.round((salesAchieved / goal) * 100)) : 0;

                const progressColor = percent >= 100 ? '#10b981' : percent >= 70 ? '#3b82f6' : '#f59e0b';

                return (
                  <div
                    key={sp.id}
                    className="card"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '16px',
                      position: 'relative',
                      border: '1px solid var(--border-color)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    {/* Top Row: Avatar & Basic Info */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '12px',
                          background: 'var(--bg-subtle-2)',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1.1rem',
                          color: '#60a5fa'
                        }}>
                          {sp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{sp.name}</h4>
                            <span className="badge badge-success" style={{ fontSize: '0.65rem' }}>
                              {sp.status === 'active' ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {sp.code} • Zona: {sp.zone || 'No asignada'}
                          </span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Comisión</span>
                        <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#a78bfa' }}>
                          {Number(sp.commission_rate || 5).toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar: Quota Attainment */}
                    <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Target size={13} color="var(--text-muted)" /> Meta Mes
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: progressColor }}>
                          {percent}% logrado
                        </span>
                      </div>

                      {/* Progress Bar Container */}
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-subtle-2)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: progressColor,
                            borderRadius: '4px',
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                          RD$ {salesAchieved.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          de RD$ {goal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    {/* Quick Stats: Portfolio & Invoices */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-subtle-2)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Clientes en Cartera</span>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {sp.assigned_customers_count || 0}
                        </p>
                      </div>

                      <div style={{ padding: '8px 12px', background: 'var(--bg-subtle-2)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Facturas este Mes</span>
                        <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {sp.invoices_this_month || 0}
                        </p>
                      </div>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => handleOpenDetails(sp)}
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      <Eye size={15} />
                      <span>Ver Ficha Completa & Cartera</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LIQUIDACIÓN DE COMISIONES */}
      {activeTab === 'commissions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div className="card" style={{ padding: '16px 20px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                Comisiones Pendientes de Pago
              </span>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                RD$ {pendingCommissionsTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {commissions.filter(c => c.status === 'pending').length} ventas listas para liquidar
              </p>
            </div>

            <div className="card" style={{ padding: '16px 20px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                Comisiones Pagadas / Liquidadas
              </span>
              <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>
                RD$ {paidCommissionsTotal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </h3>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {commissions.filter(c => c.status === 'paid').length} recibos de pago emitidos
              </p>
            </div>
          </div>

          {/* Filters & Actions Bar */}
          <div className="card" style={{ padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
              <select
                className="select-control"
                value={filterSpId}
                onChange={(e) => setFilterSpId(e.target.value)}
                style={{ width: '200px', height: '38px' }}
              >
                <option value="ALL">Todos los Vendedores</option>
                {salespeople.map(sp => (
                  <option key={sp.id} value={sp.id}>{sp.name}</option>
                ))}
              </select>

              <select
                className="select-control"
                value={filterCommStatus}
                onChange={(e) => setFilterCommStatus(e.target.value)}
                style={{ width: '160px', height: '38px' }}
              >
                <option value="ALL">Todos los Estados</option>
                <option value="pending">Pendientes</option>
                <option value="paid">Pagadas / Liquidadas</option>
              </select>

              <button
                onClick={handleSelectAllPending}
                className="btn btn-secondary btn-sm"
              >
                {selectedCommissions.length > 0 ? 'Deseleccionar' : 'Seleccionar Todo Pendiente'}
              </button>
            </div>

            {selectedCommissions.length > 0 && (
              <button
                onClick={handlePayCommissions}
                className="btn btn-primary btn-sm"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <DollarSign size={16} />
                <span>Liquidar Seleccionadas ({selectedCommissions.length})</span>
              </button>
            )}
          </div>

          {/* Commissions Table */}
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      onChange={handleSelectAllPending}
                      checked={selectedCommissions.length > 0 && selectedCommissions.length === filteredCommissions.filter(c => c.status === 'pending').length}
                    />
                  </th>
                  <th>Vendedor</th>
                  <th>Factura / NCF</th>
                  <th>Fecha Venta</th>
                  <th>Monto Facturado</th>
                  <th>% Comisión</th>
                  <th>Monto Comisión</th>
                  <th>Estado</th>
                  <th>Recibo Liquidación</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando comisiones...</td></tr>
                ) : filteredCommissions.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay comisiones para los filtros seleccionados.</td></tr>
                ) : (
                  filteredCommissions.map(c => {
                    const isPending = c.status === 'pending';
                    const isSelected = selectedCommissions.includes(c.id);

                    return (
                      <tr key={c.id} style={{ background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'transparent' }}>
                        <td>
                          {isPending && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCommission(c.id)}
                            />
                          )}
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.salesperson_name}
                          <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{c.salesperson_code}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                          {c.sale_number || `Venta #${c.sale_id}`}
                        </td>
                        <td>{new Date(c.created_at).toLocaleDateString('es-DO')}</td>
                        <td>RD$ {Number(c.sale_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                        <td style={{ fontWeight: 700, color: '#a78bfa' }}>{Number(c.commission_rate || 5).toFixed(1)}%</td>
                        <td style={{ fontWeight: 800, color: isPending ? '#f59e0b' : 'var(--success)' }}>
                          RD$ {Number(c.commission_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className={`badge ${isPending ? 'badge-warning' : 'badge-success'}`}>
                            {isPending ? 'Pendiente' : 'Liquidada'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {c.receipt_number || '-'}
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

      {/* SALESPERSON 360 PROFILE MODAL */}
      {selectedSalesperson && (
        <div className="modal-overlay" onClick={() => setSelectedSalesperson(null)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--text-primary)'
                }}>
                  {selectedSalesperson.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {selectedSalesperson.name} ({selectedSalesperson.code})
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    Zona: {selectedSalesperson.zone || 'No asignada'} • Tel: {selectedSalesperson.phone || 'N/A'} • Meta Mensual: RD$ {Number(selectedSalesperson.monthly_goal || 0).toLocaleString('es-DO')}
                  </p>
                </div>
              </div>

              <button onClick={() => setSelectedSalesperson(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            {loadingDetails ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '250px' }}>
                <div style={{ width: '28px', height: '28px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
              </div>
            ) : spDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Portfolio of customers */}
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                    Cartera de Clientes Asignados ({spDetails.customers?.length || 0})
                  </h4>
                  <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Cliente / Negocio</th>
                          <th>RNC / Cédula</th>
                          <th>Ciudad</th>
                          <th>Saldo Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spDetails.customers?.map(c => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.company_name || `${c.first_name} ${c.last_name}`}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{c.tax_id || c.id_card || '-'}</td>
                            <td>{c.city || 'Santo Domingo'}</td>
                            <td style={{ fontWeight: 700, color: Number(c.current_balance) > 0 ? '#38bdf8' : 'var(--text-muted)' }}>
                              RD$ {Number(c.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recent Sales by Salesperson */}
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                    Últimas Ventas Facturadas
                  </h4>
                  <div className="table-container" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Factura</th>
                          <th>NCF</th>
                          <th>Cliente</th>
                          <th>Fecha</th>
                          <th>Total</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {spDetails.recent_sales?.map(s => (
                          <tr key={s.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.sale_number}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{s.ncf}</td>
                            <td>{s.customer_name}</td>
                            <td>{new Date(s.created_at).toLocaleDateString('es-DO')}</td>
                            <td style={{ fontWeight: 700, color: '#60a5fa' }}>
                              RD$ {Number(s.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span className={`badge ${s.status === 'cancelled' ? 'badge-danger' : 'badge-success'}`}>
                                {s.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* NEW SALESPERSON MODAL */}
      {showNewModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Nuevo Vendedor</h3>
            <form onSubmit={handleCreateSalesperson} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Ej: Rafael Santana"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Teléfono</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="809-555-0100"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Correo Electrónico</label>
                  <input
                    type="email"
                    className="input-control"
                    placeholder="vendedor@empresa.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">Zona Asignada</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: Santo Domingo Este / Santiago"
                  value={formData.zone}
                  onChange={(e) => setFormData({ ...formData, zone: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Meta Mensual (RD$)</label>
                  <input
                    type="number"
                    step="1000"
                    className="input-control"
                    value={formData.monthly_goal}
                    onChange={(e) => setFormData({ ...formData, monthly_goal: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">% Comisión Venta</label>
                  <input
                    type="number"
                    step="0.5"
                    className="input-control"
                    value={formData.commission_rate}
                    onChange={(e) => setFormData({ ...formData, commission_rate: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowNewModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Vendedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMMISSION LIQUIDATION RECEIPT MODAL */}
      {showReceiptModal && generatedReceipt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <CheckCircle2 size={24} color="var(--success)" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Recibo de Liquidación de Comisiones</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Comprobante de Pago No. <strong style={{ color: 'var(--text-primary)' }}>{generatedReceipt.receipt_number}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Vendedor:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{generatedReceipt.salesperson_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fecha de Pago:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{generatedReceipt.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Ventas Liquidadas:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{generatedReceipt.items.length} facturas</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Total Liquidado:</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--success)' }}>
                  RD$ {Number(generatedReceipt.total_amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => window.print()} className="btn btn-secondary" style={{ flex: 1 }}>
                <Printer size={16} />
                <span>Imprimir Recibo</span>
              </button>
              <button onClick={() => setShowReceiptModal(false)} className="btn btn-primary" style={{ flex: 1 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
