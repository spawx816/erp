import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck, Percent, Plus, Search, Eye, CheckCircle2,
  DollarSign, Target, TrendingUp, FileText, Printer,
  Phone, Mail, MapPin, Calendar, X, AlertCircle,
  ChevronLeft, ChevronRight, Check, AlertTriangle,
  Receipt, Wallet, Sparkles
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import Pagination from '../components/Pagination';

export default function SalespeoplePage({ user, initialTab = 'salespeople' }) {
  const { addToast } = useToast();
  const isVendedor = user?.role_slug === 'vendedor';
  const [activeTab, setActiveTab] = useState(isVendedor ? 'commissions' : initialTab); // 'salespeople' | 'commissions'

  // Pagination states
  const [spPage, setSpPage] = useState(1);
  const [spPageSize, setSpPageSize] = useState(12);
  const [monthlyPage, setMonthlyPage] = useState(1);
  const [monthlyPageSize, setMonthlyPageSize] = useState(15);
  const [commPage, setCommPage] = useState(1);
  const [commPageSize, setCommPageSize] = useState(15);

  // Month navigation state
  const getCurrentMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [commissionsSubTab, setCommissionsSubTab] = useState('monthly'); // 'monthly' | 'history'

  useEffect(() => {
    if (initialTab) {
      setActiveTab(isVendedor ? 'commissions' : initialTab);
    }
  }, [initialTab, isVendedor]);

  const [salespeople, setSalespeople] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [search, setSearch] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState(null);
  const [spDetails, setSpDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Breakdown Modal for Monthly Collections
  const [breakdownSp, setBreakdownSp] = useState(null);

  // Form State for new salesperson
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
  const [liquidatingId, setLiquidatingId] = useState(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'commissions') {
      loadMonthlySummary(selectedMonth);
    }
  }, [selectedMonth, activeTab]);

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

  const loadMonthlySummary = async (month) => {
    setLoadingSummary(true);
    try {
      const res = await api.get('/sales/commissions/monthly-summary', {
        params: { month }
      });
      if (res.success) {
        setMonthlySummary(res);
      }
    } catch (err) {
      console.error('Error loading monthly summary:', err);
      addToast('Error al cargar el resumen mensual de comisiones.', 'error');
    } finally {
      setLoadingSummary(false);
    }
  };

  const changeMonth = (offset) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + offset, 1);
    const newMonthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(newMonthStr);
  };

  const formatMonthLabel = (monthStr) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
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
        if (activeTab === 'commissions') {
          loadMonthlySummary(selectedMonth);
        }
      }
    } catch (err) {
      addToast(err.message || 'Error al crear vendedor.', 'error');
    }
  };

  // Pay single monthly commission
  const handlePayMonthlySingle = async (spItem) => {
    if (!spItem.qualifies) {
      addToast(`El vendedor ${spItem.name} no alcanza el 70% requerido de cobro (${spItem.compliance_percentage}%).`, 'warning');
      return;
    }

    setLiquidatingId(spItem.salesperson_id);
    try {
      const res = await api.post('/sales/commissions/pay-monthly', {
        salesperson_ids: [spItem.salesperson_id],
        month: selectedMonth,
        payment_method: 'transfer',
        notes: `Liquidación mensual de comisiones ${formatMonthLabel(selectedMonth)}`
      });

      if (res.success) {
        addToast(`Comisión liquidada para ${spItem.name} por RD$ ${spItem.commission_amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`, 'success');
        
        const receiptData = {
          receipt_number: res.data.settlements[0]?.receipt_number || 'REC-COM',
          salesperson_name: spItem.name,
          salesperson_code: spItem.code,
          month: formatMonthLabel(selectedMonth),
          monthly_goal: spItem.monthly_goal,
          total_collected: spItem.total_collected,
          compliance_percentage: spItem.compliance_percentage,
          commission_rate: spItem.commission_rate,
          total_amount: spItem.commission_amount,
          date: new Date().toLocaleDateString('es-DO'),
          cash_count: spItem.cash_details?.length || 0,
          cxc_count: spItem.cxc_details?.length || 0
        };

        setGeneratedReceipt(receiptData);
        setShowReceiptModal(true);
        loadMonthlySummary(selectedMonth);
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error al liquidar comisión mensual.', 'error');
    } finally {
      setLiquidatingId(null);
    }
  };

  // Pay all qualified monthly commissions
  const handlePayAllQualified = async () => {
    const eligibleList = (monthlySummary?.data || []).filter(s => s.qualifies && !s.is_paid);
    if (eligibleList.length === 0) {
      addToast('No hay vendedores calificados pendientes de liquidar en este mes.', 'warning');
      return;
    }

    try {
      const spIds = eligibleList.map(s => s.salesperson_id);
      const res = await api.post('/sales/commissions/pay-monthly', {
        salesperson_ids: spIds,
        month: selectedMonth,
        payment_method: 'transfer',
        notes: `Liquidación en lote ${formatMonthLabel(selectedMonth)}`
      });

      if (res.success) {
        addToast(`Se liquidaron ${res.data.count} comisiones por RD$ ${res.data.total_paid.toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`, 'success');
        loadMonthlySummary(selectedMonth);
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error al liquidar comisiones.', 'error');
    }
  };

  // Legacy transaction selection
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
        addToast(`Se liquidaron comisiones con éxito.`, 'success');
        setSelectedCommissions([]);
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error liquidando comisiones.', 'error');
    }
  };

  // Filtered salespeople
  const filteredSalespeople = useMemo(() => {
    return salespeople.filter(sp => {
      return !search ||
        sp.name.toLowerCase().includes(search.toLowerCase()) ||
        sp.code.toLowerCase().includes(search.toLowerCase()) ||
        (sp.zone && sp.zone.toLowerCase().includes(search.toLowerCase()));
    });
  }, [salespeople, search]);

  const paginatedSalespeople = useMemo(() => {
    const start = (spPage - 1) * spPageSize;
    return filteredSalespeople.slice(start, start + spPageSize);
  }, [filteredSalespeople, spPage, spPageSize]);

  // Filtered monthly summary list
  const filteredMonthlyList = useMemo(() => {
    return (monthlySummary?.data || []).filter(sp => {
      return !search ||
        sp.name.toLowerCase().includes(search.toLowerCase()) ||
        sp.code.toLowerCase().includes(search.toLowerCase()) ||
        (sp.zone && sp.zone.toLowerCase().includes(search.toLowerCase()));
    });
  }, [monthlySummary?.data, search]);

  const paginatedMonthlyList = useMemo(() => {
    const start = (monthlyPage - 1) * monthlyPageSize;
    return filteredMonthlyList.slice(start, start + monthlyPageSize);
  }, [filteredMonthlyList, monthlyPage, monthlyPageSize]);

  // Filtered legacy commissions
  const filteredCommissions = useMemo(() => {
    return commissions.filter(c => {
      const matchSp = filterSpId === 'ALL' || c.salesperson_id === parseInt(filterSpId, 10);
      const matchStatus = filterCommStatus === 'ALL' || c.status === filterCommStatus;
      const matchSearch = !search ||
        c.salesperson_name.toLowerCase().includes(search.toLowerCase()) ||
        (c.sale_number && c.sale_number.toLowerCase().includes(search.toLowerCase()));
      return matchSp && matchStatus && matchSearch;
    });
  }, [commissions, filterSpId, filterCommStatus, search]);

  const paginatedCommissions = useMemo(() => {
    const start = (commPage - 1) * commPageSize;
    return filteredCommissions.slice(start, start + commPageSize);
  }, [filteredCommissions, commPage, commPageSize]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
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
                {isVendedor ? 'Mis Comisiones sobre Cobros' : 'Fuerza de Ventas & Liquidación de Comisiones'}
              </h2>
              <span className="badge badge-success" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                Regla Umbral 70%
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {isVendedor
                ? 'Comisiones calculadas en base a lo cobrado en el mes. Se activan a partir del 70% de cumplimiento de meta.'
                : 'Gestión comercial, metas mensuales de cobro y liquidación de comisiones con umbral del 70%.'}
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

      {/* Main Tabs */}
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
            <span>Liquidación Mensual de Comisiones</span>
          </button>
        </div>
      )}

      {/* TAB 1: VENDEDORES & METAS */}
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
              {paginatedSalespeople.map(sp => {
                const goal = Number(sp.monthly_goal || 0);
                const collectionsMonth = Number(sp.collections_month || 0);
                const compliance = goal > 0 ? (collectionsMonth / goal) * 100 : 0;
                const qualifies = compliance >= 70.0;
                const progressColor = compliance >= 100 ? '#10b981' : compliance >= 70 ? '#3b82f6' : '#f59e0b';

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
                  >
                    <div>
                      {/* Top Info */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))',
                            color: '#3b82f6',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '1.1rem'
                          }}>
                            {sp.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h4 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {sp.name}
                            </h4>
                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                              {sp.code} • Zona: {sp.zone || 'General'}
                            </span>
                          </div>
                        </div>

                        <span className={`badge ${qualifies ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                          {qualifies ? 'Califica (≥70%)' : 'Bajo Umbral (<70%)'}
                        </span>
                      </div>

                      {/* Goal & Collections Bar */}
                      <div style={{ background: 'var(--bg-card-secondary)', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '6px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Cobrado este Mes:</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                            RD$ {collectionsMonth.toLocaleString('es-DO', { minimumFractionDigits: 2 })} / RD$ {goal.toLocaleString('es-DO')}
                          </span>
                        </div>

                        {/* Progress bar with 70% marker */}
                        <div style={{ position: 'relative', width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${Math.min(100, compliance)}%`,
                            height: '100%',
                            background: progressColor,
                            borderRadius: '4px',
                            transition: 'width 0.4s ease'
                          }} />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                          <span>Cumplimiento: <strong style={{ color: progressColor }}>{compliance.toFixed(1)}%</strong></span>
                          <span>Umbral mínimo: <strong>70.0%</strong></span>
                        </div>
                      </div>

                      {/* Financial Metrics */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
                        <div style={{ background: 'var(--bg-card-secondary)', padding: '8px 10px', borderRadius: '8px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Tasa Comisión</span>
                          <strong style={{ color: '#a78bfa', fontSize: '0.9rem' }}>{Number(sp.commission_rate || 5).toFixed(1)}%</strong>
                        </div>
                        <div style={{ background: 'var(--bg-card-secondary)', padding: '8px 10px', borderRadius: '8px' }}>
                          <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Comisión Est. Mes</span>
                          <strong style={{ color: qualifies ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.9rem' }}>
                            RD$ {(sp.estimated_commission || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
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
          <Pagination
            currentPage={spPage}
            totalItems={filteredSalespeople.length}
            pageSize={spPageSize}
            onPageChange={setSpPage}
            onPageSizeChange={(s) => { setSpPageSize(s); setSpPage(1); }}
            itemLabel="vendedores"
          />
        </div>
      )}

      {/* TAB 2: LIQUIDACIÓN DE COMISIONES (MENSUAL POR COBROS & UMBRAL 70%) */}
      {activeTab === 'commissions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Sub-navigation & Month Selector Bar */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card-secondary)', padding: '4px', borderRadius: '8px' }}>
                <button
                  onClick={() => setCommissionsSubTab('monthly')}
                  className={`btn btn-sm ${commissionsSubTab === 'monthly' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ height: '32px', fontSize: '0.8rem' }}
                >
                  <Target size={14} />
                  <span>Liquidación Mensual (Umbral 70%)</span>
                </button>
                <button
                  onClick={() => setCommissionsSubTab('history')}
                  className={`btn btn-sm ${commissionsSubTab === 'history' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ height: '32px', fontSize: '0.8rem' }}
                >
                  <FileText size={14} />
                  <span>Histórico de Transacciones</span>
                </button>
              </div>
            </div>

            {/* Month Navigator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => changeMonth(-1)}
                className="btn btn-secondary btn-sm"
                title="Mes Anterior"
                style={{ width: '36px', height: '36px', padding: 0, justifyContent: 'center' }}
              >
                <ChevronLeft size={16} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-card-secondary)', padding: '4px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <Calendar size={16} color="var(--accent-primary)" />
                <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                  {formatMonthLabel(selectedMonth)}
                </span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'transparent',
                    width: '20px',
                    cursor: 'pointer',
                    marginLeft: '-10px'
                  }}
                  title="Seleccionar mes"
                />
              </div>

              <button
                onClick={() => changeMonth(1)}
                className="btn btn-secondary btn-sm"
                title="Mes Siguiente"
                style={{ width: '36px', height: '36px', padding: 0, justifyContent: 'center' }}
              >
                <ChevronRight size={16} />
              </button>

              <button
                onClick={() => setSelectedMonth(getCurrentMonthStr())}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.75rem', height: '36px' }}
              >
                Mes Actual
              </button>
            </div>
          </div>

          {commissionsSubTab === 'monthly' ? (
            <>
              {/* Monthly KPI Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                <div className="card" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Total Cobrado por Vendedores
                      </span>
                      <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                        RD$ {(monthlySummary?.totals?.total_collected || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </h3>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Base de recaudación del mes
                      </p>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(56, 189, 248, 0.15)', borderRadius: '10px' }}>
                      <Wallet size={20} color="#38bdf8" />
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Vendedores que Califican (≥70%)
                      </span>
                      <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)', marginTop: '4px' }}>
                        {monthlySummary?.totals?.eligible_count || 0} / {monthlySummary?.totals?.total_salespeople || 0}
                      </h3>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {monthlySummary?.totals?.unqualified_count || 0} no alcanzan umbral
                      </p>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '10px' }}>
                      <CheckCircle2 size={20} color="var(--success)" />
                    </div>
                  </div>
                </div>

                <div className="card" style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
                        Comisiones Liquidables (≥70%)
                      </span>
                      <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa', marginTop: '4px' }}>
                        RD$ {(monthlySummary?.totals?.total_eligible_commissions || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </h3>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Monto habilitado para pago
                      </p>
                    </div>
                    <div style={{ padding: '10px', background: 'rgba(167, 139, 250, 0.15)', borderRadius: '10px' }}>
                      <Percent size={20} color="#a78bfa" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Notice Banner about the 70% rule */}
              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Sparkles size={20} color="#3b82f6" />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    <strong>Criterio de Liquidación:</strong> Las comisiones se generan en base a los fondos recaudados (ventas contado + cobros CxC). Si el vendedor alcanza el <strong>70%</strong> o más de su meta, se desbloquea el pago de comisiones sobre lo cobrado.
                  </span>
                </div>

                {!isVendedor && (monthlySummary?.totals?.eligible_count || 0) > 0 && (
                  <button
                    onClick={handlePayAllQualified}
                    className="btn btn-primary btn-sm"
                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                  >
                    <DollarSign size={15} />
                    <span>Liquidar Todos Calificados ({monthlySummary?.totals?.eligible_count})</span>
                  </button>
                )}
              </div>

              {/* Monthly Settlement Table */}
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th>Meta de Cobro</th>
                      <th>Cobrado en el Mes</th>
                      <th style={{ width: '220px' }}>% Cumplimiento (Mín. 70%)</th>
                      <th>Tasa %</th>
                      <th>Comisión Liquidable</th>
                      <th>Estado</th>
                      <th style={{ textAlign: 'right' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingSummary ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '30px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '18px', height: '18px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                            <span>Calculando liquidaciones del período...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredMonthlyList.length === 0 ? (
                      <tr>
                        <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No hay vendedores para mostrar en este período.
                        </td>
                      </tr>
                    ) : (
                      paginatedMonthlyList.map(sp => {
                        const qualifies = sp.qualifies;
                        const isPaid = sp.is_paid;
                        const compliance = sp.compliance_percentage;
                        const progressColor = compliance >= 100 ? '#10b981' : compliance >= 70 ? '#3b82f6' : '#f59e0b';

                        return (
                          <tr key={sp.salesperson_id} style={{ background: isPaid ? 'rgba(16, 185, 129, 0.04)' : 'transparent' }}>
                            <td>
                              <strong style={{ color: 'var(--text-primary)' }}>{sp.name}</strong>
                              <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                {sp.code} • {sp.zone || 'General'}
                              </span>
                            </td>

                            <td style={{ fontWeight: 600 }}>
                              RD$ {sp.monthly_goal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>

                            <td>
                              <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                                RD$ {sp.total_collected.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Contado: RD$ {sp.total_cash_collected.toLocaleString('es-DO')} | CxC: RD$ {sp.total_cxc_collected.toLocaleString('es-DO')}
                              </span>
                            </td>

                            <td>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                                <strong style={{ color: progressColor }}>{compliance.toFixed(1)}%</strong>
                                <span style={{ color: 'var(--text-muted)' }}>Mín. 70.0%</span>
                              </div>

                              {/* Progress bar with 70% threshold marker */}
                              <div style={{ position: 'relative', width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }}>
                                <div style={{
                                  width: `${Math.min(100, compliance)}%`,
                                  height: '100%',
                                  background: progressColor,
                                  borderRadius: '4px'
                                }} />
                                {/* 70% threshold indicator tick */}
                                <div
                                  style={{
                                    position: 'absolute',
                                    left: '70%',
                                    top: '-3px',
                                    bottom: '-3px',
                                    width: '2px',
                                    background: '#ffffff',
                                    boxShadow: '0 0 4px rgba(255,255,255,0.8)',
                                    zIndex: 2
                                  }}
                                  title="Umbral de Activación (70%)"
                                />
                              </div>

                              <div style={{ fontSize: '0.68rem', marginTop: '4px' }}>
                                {qualifies ? (
                                  <span style={{ color: '#10b981', fontWeight: 600 }}>
                                    ✓ Umbral alcanzado (+{(compliance - 70).toFixed(1)}%)
                                  </span>
                                ) : (
                                  <span style={{ color: '#f59e0b' }}>
                                    Falta RD$ {sp.amount_to_threshold.toLocaleString('es-DO')} ({sp.percentage_to_threshold.toFixed(1)}%) para activar
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={{ fontWeight: 700, color: '#a78bfa' }}>
                              {sp.commission_rate.toFixed(1)}%
                            </td>

                            <td>
                              {qualifies ? (
                                <div>
                                  <span style={{ fontSize: '1rem', fontWeight: 900, color: isPaid ? 'var(--success)' : '#a78bfa' }}>
                                    RD$ {sp.commission_amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              ) : (
                                <div>
                                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                    RD$ 0.00
                                  </span>
                                  <span style={{ display: 'block', fontSize: '0.68rem', color: '#f59e0b' }}>
                                    No alcanza 70%
                                  </span>
                                </div>
                              )}
                            </td>

                            <td>
                              {isPaid ? (
                                <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <Check size={12} /> Liquidada
                                </span>
                              ) : qualifies ? (
                                <span className="badge badge-primary" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
                                  Califica (Pendiente)
                                </span>
                              ) : (
                                <span className="badge badge-warning" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' }}>
                                  Bajo Umbral (&lt;70%)
                                </span>
                              )}
                            </td>

                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  onClick={() => setBreakdownSp(sp)}
                                  className="btn btn-secondary btn-sm"
                                  title="Ver desglose de cobros"
                                  style={{ padding: '4px 8px' }}
                                >
                                  <Eye size={14} />
                                  <span>Cobros</span>
                                </button>

                                {!isVendedor && qualifies && !isPaid && (
                                  <button
                                    onClick={() => handlePayMonthlySingle(sp)}
                                    disabled={liquidatingId === sp.salesperson_id}
                                    className="btn btn-primary btn-sm"
                                    style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '4px 10px' }}
                                  >
                                    <DollarSign size={14} />
                                    <span>Liquidar</span>
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
                <Pagination
                  currentPage={monthlyPage}
                  totalItems={filteredMonthlyList.length}
                  pageSize={monthlyPageSize}
                  onPageChange={setMonthlyPage}
                  onPageSizeChange={(s) => { setMonthlyPageSize(s); setMonthlyPage(1); }}
                  itemLabel="vendedores"
                />
              </div>
            </>
          ) : (
            /* Historical Individual Invoices View */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                      <th>Documento / Recibo</th>
                      <th>Fecha</th>
                      <th>Monto Base</th>
                      <th>% Comisión</th>
                      <th>Monto Comisión</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCommissions.length === 0 ? (
                      <tr>
                        <td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                          No hay transacciones registradas.
                        </td>
                      </tr>
                    ) : (
                      paginatedCommissions.map(c => {
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
                              {c.invoice_number || c.sale_number || `Comisión #${c.id}`}
                            </td>
                            <td>{new Date(c.created_at).toLocaleDateString('es-DO')}</td>
                            <td>RD$ {Number(c.base_amount || c.sale_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontWeight: 700, color: '#a78bfa' }}>{Number(c.commission_rate || 5).toFixed(1)}%</td>
                            <td style={{ fontWeight: 800, color: isPending ? '#f59e0b' : 'var(--success)' }}>
                              RD$ {Number(c.commission_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>
                            <td>
                              <span className="badge" style={{ fontSize: '0.7rem' }}>
                                {c.calculation_type === 'monthly_collected' ? 'Mensual (70%)' : c.calculation_type || 'Estándar'}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${isPending ? 'badge-warning' : 'badge-success'}`}>
                                {isPending ? 'Pendiente' : 'Liquidada'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                <Pagination
                  currentPage={commPage}
                  totalItems={filteredCommissions.length}
                  pageSize={commPageSize}
                  onPageChange={setCommPage}
                  onPageSizeChange={(s) => { setCommPageSize(s); setCommPage(1); }}
                  itemLabel="transacciones"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* BREAKDOWN OF MONTHLY COLLECTIONS MODAL */}
      {breakdownSp && (
        <div className="modal-overlay" onClick={() => setBreakdownSp(null)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Desglose de Cobros: {breakdownSp.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Período: <strong style={{ color: 'var(--accent-primary)' }}>{formatMonthLabel(selectedMonth)}</strong> • Meta: RD$ {breakdownSp.monthly_goal.toLocaleString('es-DO')} • Recaudado: RD$ {breakdownSp.total_collected.toLocaleString('es-DO')} ({breakdownSp.compliance_percentage.toFixed(1)}%)
                </p>
              </div>

              <button onClick={() => setBreakdownSp(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Ventas de Contado Cobradas */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wallet size={16} color="#38bdf8" />
                  <span>Ventas de Contado Inmediatas ({breakdownSp.cash_details?.length || 0})</span>
                  <span style={{ fontSize: '0.8rem', color: '#38bdf8', marginLeft: 'auto' }}>
                    Total: RD$ {breakdownSp.total_cash_collected.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </h4>

                <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>NCF</th>
                        <th>Cliente</th>
                        <th>Fecha</th>
                        <th>Subtotal</th>
                        <th>Total Cobrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!breakdownSp.cash_details || breakdownSp.cash_details.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay ventas de contado en este mes.</td></tr>
                      ) : (
                        breakdownSp.cash_details.map(s => (
                          <tr key={s.id}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{s.sale_number}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{s.ncf || '-'}</td>
                            <td>{s.customer_name}</td>
                            <td>{new Date(s.created_at).toLocaleDateString('es-DO')}</td>
                            <td>RD$ {Number(s.subtotal).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                            <td style={{ fontWeight: 700, color: '#38bdf8' }}>
                              RD$ {Number(s.amount_paid || s.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Cobros y Abonos CxC */}
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Receipt size={16} color="#10b981" />
                  <span>Cobros y Abonos a Cuentas por Cobrar ({breakdownSp.cxc_details?.length || 0})</span>
                  <span style={{ fontSize: '0.8rem', color: '#10b981', marginLeft: 'auto' }}>
                    Total: RD$ {breakdownSp.total_cxc_collected.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </span>
                </h4>

                <div className="table-container" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>No. Recibo</th>
                        <th>Fecha Cobro</th>
                        <th>Cliente</th>
                        <th>Factura Vinculada</th>
                        <th>Método</th>
                        <th>Monto Cobrado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!breakdownSp.cxc_details || breakdownSp.cxc_details.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No hay abonos de CxC registrados en este mes.</td></tr>
                      ) : (
                        breakdownSp.cxc_details.map((a, idx) => (
                          <tr key={a.allocation_id || idx}>
                            <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{a.payment_number}</td>
                            <td>{new Date(a.payment_date).toLocaleDateString('es-DO')}</td>
                            <td>{a.customer_name}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{a.sale_number || a.invoice_number || '-'}</td>
                            <td><span className="badge" style={{ textTransform: 'capitalize' }}>{a.payment_method}</span></td>
                            <td style={{ fontWeight: 700, color: '#10b981' }}>
                              RD$ {Number(a.amount_applied).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
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
                  <label className="label-control">Meta Mensual de Cobro (RD$)</label>
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
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Comprobante de Liquidación de Comisión</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Recibo Oficial No. <strong style={{ color: 'var(--text-primary)' }}>{generatedReceipt.receipt_number}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Vendedor:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{generatedReceipt.salesperson_name} ({generatedReceipt.salesperson_code})</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Período Liquidado:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{generatedReceipt.month}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Meta Mensual:</span>
                <span>RD$ {Number(generatedReceipt.monthly_goal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total Recaudado / Cobrado:</span>
                <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                  RD$ {Number(generatedReceipt.total_collected || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })} ({Number(generatedReceipt.compliance_percentage || 0).toFixed(1)}%)
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Tasa de Comisión:</span>
                <span style={{ fontWeight: 700, color: '#a78bfa' }}>{Number(generatedReceipt.commission_rate || 5).toFixed(1)}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fecha de Pago:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{generatedReceipt.date}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '6px' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Total Comisión Liquidada:</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--success)' }}>
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
