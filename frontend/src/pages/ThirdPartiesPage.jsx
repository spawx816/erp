import React, { useState, useEffect } from 'react';
import {
  Users, Building, Plus, Search, Eye, Phone, Mail,
  MapPin, DollarSign, Clock, Package, X, CheckCircle,
  LayoutGrid, Table, ShieldAlert, ShieldCheck, AlertCircle,
  FileText, Send, Calendar, Percent, UserCheck, Building2,
  Printer, Lock, Unlock, ArrowRight, RefreshCw, AlertTriangle,
  ShoppingCart, CreditCard, HandCoins, Receipt, Activity,
  TrendingUp, MessageCircle, ExternalLink, Copy, CheckCircle2,
  Wallet, Award, PhoneCall, Sparkles, Navigation, Check
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import RncLookupModal from '../components/RncLookupModal';

export default function ThirdPartiesPage({ initialMode = 'customers', onNavigate }) {
  const { addToast } = useToast();
  // modes: 'customers' | 'statement' | 'credit-risk' | 'suppliers'
  const [activeTab, setActiveTab] = useState(
    initialMode === 'suppliers' ? 'suppliers' :
    initialMode === 'customer-statement' ? 'statement' :
    initialMode === 'credit-risk' ? 'credit-risk' : 'customers'
  );

  useEffect(() => {
    if (initialMode === 'suppliers') setActiveTab('suppliers');
    else if (initialMode === 'customer-statement') setActiveTab('statement');
    else if (initialMode === 'credit-risk') setActiveTab('credit-risk');
    else if (initialMode === 'customers') setActiveTab('customers');
  }, [initialMode]);
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [salespeople, setSalespeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterRisk, setFilterRisk] = useState('ALL');

  // Customer Statement State
  const [statementCustomerId, setStatementCustomerId] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Customer 360 Drawer State
  const [customer360, setCustomer360] = useState(null);
  const [loading360, setLoading360] = useState(false);
  const [active360Tab, setActive360Tab] = useState('general'); // 9 tabs: general, conditions, sales, cxc, payments, stats, notes, geo, statement

  // New Note in 360
  const [newNoteText, setNewNoteText] = useState('');
  const [newPromiseDate, setNewPromiseDate] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // New Customer Modal
  const [showCustModal, setShowCustModal] = useState(false);
  const [custForm, setCustForm] = useState({
    person_type: 'juridica',
    first_name: '',
    last_name: '',
    company_name: '',
    tax_id: '',
    id_card: '',
    phone: '',
    email: '',
    address: '',
    city: 'Santo Domingo',
    salesperson_id: '',
    credit_limit: '75000',
    credit_days: '30',
    discount_percent: '0',
    latitude: 18.4861,
    longitude: -69.9312
  });

  // New Supplier Modal
  const [showSuppModal, setShowSuppModal] = useState(false);
  const [suppForm, setSuppForm] = useState({
    company_name: '',
    trade_name: '',
    tax_id: '',
    phone: '',
    email: '',
    address: '',
    city: 'Santo Domingo',
    contact_person: '',
    credit_limit: '200000',
    credit_days: '45'
  });

  // RNC DGII Lookup State
  const [showRncModal, setShowRncModal] = useState(false);
  const [consultingDgii, setConsultingDgii] = useState(false);
  const [dgiiVerified, setDgiiVerified] = useState(null);
  const [suppDgiiVerified, setSuppDgiiVerified] = useState(null);

  useEffect(() => {
    if (initialMode === 'suppliers') setActiveTab('suppliers');
    else if (initialMode === 'customer-statement') setActiveTab('statement');
    else if (initialMode === 'credit-risk') setActiveTab('credit-risk');
    else setActiveTab('customers');
  }, [initialMode]);

  useEffect(() => {
    loadInitial();
  }, [activeTab, search, filterRisk]);

  useEffect(() => {
    if (activeTab === 'statement') {
      const targetId = statementCustomerId || (customers.length > 0 ? customers[0].id : null);
      if (targetId && targetId !== statementCustomerId) {
        setStatementCustomerId(targetId);
        loadStatement(targetId);
      }
    }
  }, [activeTab, customers]);

  const loadInitial = async () => {
    setLoading(true);
    try {
      const [custRes, suppRes, spRes] = await Promise.all([
        api.get('/third-parties/customers', {
          search,
          risk_score: filterRisk !== 'ALL' ? filterRisk : undefined
        }),
        api.get('/third-parties/suppliers', { search }),
        api.get('/third-parties/salespeople')
      ]);

      if (custRes.success) {
        setCustomers(custRes.data);
        if (activeTab === 'statement' && !statementCustomerId && custRes.data?.length > 0) {
          setStatementCustomerId(custRes.data[0].id);
          loadStatement(custRes.data[0].id);
        }
      }
      if (suppRes.success) setSuppliers(suppRes.data);
      if (spRes.success) setSalespeople(spRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStatement = (id) => {
    setStatementCustomerId(id);
    setActiveTab('statement');
    loadStatement(id);
  };

  const loadStatement = async (id) => {
    if (!id) return;
    setLoadingStatement(true);
    try {
      const res = await api.get(`/third-parties/customers/${id}/statement`);
      if (res.success) {
        setStatementData(res.data);
      }
    } catch (err) {
      console.error(err);
      addToast('Error al cargar estado de cuenta.', 'error');
    } finally {
      setLoadingStatement(false);
    }
  };

  const handleToggleCreditBlock = async (id) => {
    try {
      const res = await api.post(`/third-parties/customers/${id}/toggle-block`);
      if (res.success) {
        addToast(res.message, res.is_credit_blocked === 1 ? 'warning' : 'success');
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_credit_blocked: res.is_credit_blocked } : c));
        if (customer360?.customer?.id === id) {
          setCustomer360(prev => ({
            ...prev,
            customer: { ...prev.customer, is_credit_blocked: res.is_credit_blocked }
          }));
        }
      }
    } catch (err) {
      addToast(err.message || 'Error al cambiar estado de crédito.', 'error');
    }
  };

  const handleOpenCustomer360 = async (id) => {
    setLoading360(true);
    try {
      const res = await api.get(`/third-parties/customers/${id}/360`);
      if (res.success) {
        setCustomer360(res.data);
        setActive360Tab('general');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading360(false);
    }
  };

  const handleAddCollectionNote = async (e) => {
    e.preventDefault();
    if (!customer360 || !newNoteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await api.post(`/third-parties/customers/${customer360.customer.id}/collection-notes`, {
        note: newNoteText,
        promised_payment_date: newPromiseDate || null
      });
      if (res.success) {
        addToast('Nota de cobranza agregada.', 'success');
        setNewNoteText('');
        setNewPromiseDate('');
        handleOpenCustomer360(customer360.customer.id);
      }
    } catch (err) {
      addToast(err.message || 'Error agregando nota.', 'error');
    } finally {
      setAddingNote(false);
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/third-parties/customers', custForm);
      if (res.success) {
        addToast('Cliente registrado exitosamente.', 'success');
        setShowCustModal(false);
        loadInitial();
      }
    } catch (err) {
      addToast(err.message || 'Error al guardar cliente.', 'error');
    }
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/third-parties/suppliers', suppForm);
      if (res.success) {
        addToast('Proveedor registrado exitosamente.', 'success');
        setShowSuppModal(false);
        loadInitial();
      }
    } catch (err) {
      addToast(err.message || 'Error al guardar proveedor.', 'error');
    }
  };

  const handleConsultDgiiForCustomer = async () => {
    const raw = custForm.tax_id || custForm.id_card;
    const clean = String(raw).replace(/[^0-9]/g, '').trim();
    if (!clean || (clean.length !== 9 && clean.length !== 11)) {
      addToast('Ingrese un RNC (9 dígitos) o Cédula (11 dígitos) para consultar en DGII.', 'warning');
      return;
    }

    setConsultingDgii(true);
    try {
      const res = await api.get(`/fiscal/rnc/consulta/${clean}`);
      if (res.success && res.data) {
        setDgiiVerified(res.data);
        setCustForm(prev => ({
          ...prev,
          company_name: res.data.legal_name || res.data.commercial_name || prev.company_name,
          tax_id: res.data.formatted_rnc,
          person_type: res.data.person_type
        }));
        addToast(`Datos DGII verificados: ${res.data.legal_name}`, 'success');
      } else {
        addToast(res.message || 'RNC no encontrado en DGII.', 'warning');
      }
    } catch (err) {
      addToast(err.message || 'Error consultando DGII.', 'error');
    } finally {
      setConsultingDgii(false);
    }
  };

  const handleConsultDgiiForSupplier = async () => {
    const raw = suppForm.tax_id;
    const clean = String(raw).replace(/[^0-9]/g, '').trim();
    if (!clean || (clean.length !== 9 && clean.length !== 11)) {
      addToast('Ingrese un RNC (9 dígitos) o Cédula (11 dígitos) para el proveedor.', 'warning');
      return;
    }

    setConsultingDgii(true);
    try {
      const res = await api.get(`/fiscal/rnc/consulta/${clean}`);
      if (res.success && res.data) {
        setSuppDgiiVerified(res.data);
        setSuppForm(prev => ({
          ...prev,
          company_name: res.data.legal_name || prev.company_name,
          trade_name: res.data.commercial_name || prev.trade_name,
          tax_id: res.data.formatted_rnc
        }));
        addToast(`Proveedor verificado en DGII: ${res.data.legal_name}`, 'success');
      } else {
        addToast(res.message || 'RNC no encontrado en DGII.', 'warning');
      }
    } catch (err) {
      addToast(err.message || 'Error consultando DGII.', 'error');
    } finally {
      setConsultingDgii(false);
    }
  };

  const handleSelectFromRncModal = (item) => {
    if (activeTab === 'customers') {
      setCustForm({
        person_type: item.person_type,
        first_name: '',
        last_name: '',
        company_name: item.legal_name || item.commercial_name,
        tax_id: item.formatted_rnc,
        id_card: '',
        phone: '',
        email: '',
        address: item.economic_activity || '',
        city: 'Santo Domingo',
        salesperson_id: salespeople[0]?.id || '',
        credit_limit: '75000',
        credit_days: '30',
        discount_percent: '0',
        latitude: 18.4861,
        longitude: -69.9312
      });
      setDgiiVerified(item);
      setShowCustModal(true);
    } else {
      setSuppForm({
        company_name: item.legal_name,
        trade_name: item.commercial_name,
        tax_id: item.formatted_rnc,
        phone: '',
        email: '',
        address: '',
        city: 'Santo Domingo',
        contact_person: '',
        credit_limit: '200000',
        credit_days: '45'
      });
      setSuppDgiiVerified(item);
      setShowSuppModal(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Gestión de Clientes, Crédito & Cuentas
            </h2>
            <span className="badge" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' }}>
              Secciones 38 - 41
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Ficha 360°, límites y riesgo de crédito, estados de cuenta históricos y cobranza
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowRncModal(true)}
            className="btn btn-secondary"
            style={{ borderColor: 'rgba(59, 130, 246, 0.4)', color: '#60a5fa', gap: '6px' }}
          >
            <Building2 size={16} />
            <span>Consultar RNC DGII</span>
          </button>

          {activeTab === 'suppliers' ? (
            <button onClick={() => { setSuppDgiiVerified(null); setShowSuppModal(true); }} className="btn btn-primary">
              <Plus size={16} />
              <span>Nuevo Proveedor</span>
            </button>
          ) : (
            <button onClick={() => { setDgiiVerified(null); setShowCustModal(true); }} className="btn btn-primary">
              <Plus size={16} />
              <span>Nuevo Cliente</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & View Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('customers')}
            className={`btn btn-sm ${activeTab === 'customers' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Users size={15} />
            <span>Directorio de Clientes ({customers.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('statement');
              if (!statementCustomerId && customers.length > 0) {
                setStatementCustomerId(customers[0].id);
                loadStatement(customers[0].id);
              }
            }}
            className={`btn btn-sm ${activeTab === 'statement' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <FileText size={15} />
            <span>Estados de Cuenta</span>
          </button>

          <button
            onClick={() => setActiveTab('credit-risk')}
            className={`btn btn-sm ${activeTab === 'credit-risk' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <ShieldAlert size={15} />
            <span>Crédito & Riesgo</span>
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`btn btn-sm ${activeTab === 'suppliers' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Building size={15} />
            <span>Proveedores / Suplidores ({suppliers.length})</span>
          </button>
        </div>

        {/* View Mode Switcher for Customers */}
        {activeTab === 'customers' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Risk Filter */}
            <select
              className="select-control"
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              style={{ width: '170px', height: '34px', fontSize: '0.78rem' }}
            >
              <option value="ALL">Todos los Riesgos</option>
              <option value="low">Riesgo Bajo (Al Día)</option>
              <option value="medium">Riesgo Medio</option>
              <option value="high">Riesgo Alto</option>
              <option value="critical">Riesgo Crítico (Mora)</option>
            </select>

            <div style={{ display: 'flex', background: 'var(--bg-main)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setViewMode('cards')}
                className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px' }}
                title="Vista Tarjetas"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`btn btn-sm ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px' }}
                title="Vista Tabla"
              >
                <Table size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search Input */}
      {activeTab !== 'statement' && (
        <div className="card" style={{ padding: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              className="input-control"
              placeholder={activeTab === 'suppliers' ? "Buscar proveedor por razón social o RNC..." : "Buscar cliente por nombre, RNC, cédula, teléfono, vendedor o ciudad..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '38px', height: '40px' }}
            />
          </div>
        </div>
      )}

      {/* CUSTOMERS VIEW: CARDS (SECTION #38) */}
      {activeTab === 'customers' && viewMode === 'cards' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '16px' }}>
          {loading ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>Cargando clientes...</div>
          ) : customers.length === 0 ? (
            <div className="card" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No se encontraron clientes para los filtros seleccionados.
            </div>
          ) : (
            customers.map(c => {
              const limitAmt = Number(c.credit_limit || 0);
              const balance = Number(c.current_balance || 0);
              const usedPct = limitAmt > 0 ? Math.min(100, Math.round((balance / limitAmt) * 100)) : 0;
              const overdueCount = Number(c.overdue_invoices_count || 0);

              // Semaphore Colors
              const barColor = usedPct >= 85 || overdueCount > 0 ? '#ef4444' : usedPct >= 60 ? '#f59e0b' : '#10b981';
              const riskBadgeClass = c.risk_score === 'critical' ? 'badge-danger' : c.risk_score === 'high' ? 'badge-warning' : 'badge-success';
              const riskLabel = c.risk_score === 'critical' ? 'Riesgo Crítico' : c.risk_score === 'high' ? 'Riesgo Alto' : c.risk_score === 'medium' ? 'Riesgo Medio' : 'Riesgo Bajo';

              return (
                <div
                  key={c.id}
                  className="card"
                  style={{
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    border: '1px solid var(--border-color)',
                    transition: 'all 0.18s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.4)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  {/* Top: Avatar & Name */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '10px',
                        background: 'var(--bg-subtle-2)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1rem',
                        color: '#38bdf8'
                      }}>
                        {(c.company_name || c.first_name || 'C').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: '1.2' }}>
                          {c.company_name || `${c.first_name} ${c.last_name}`}
                        </h4>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {c.tax_id || c.id_card || 'Consumidor Final'} • {c.city || 'Santo Domingo'}
                        </span>
                      </div>
                    </div>

                    <span className={`badge ${riskBadgeClass}`} style={{ fontSize: '0.65rem' }}>
                      {riskLabel}
                    </span>
                  </div>

                  {/* Salesperson Assigned */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '6px', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Vendedor:</span>
                    <span style={{ fontWeight: 700, color: '#60a5fa' }}>{c.salesperson_name || 'Carlos Mendoza'}</span>
                  </div>

                  {/* Credit Utilization Bar (Section #38) */}
                  <div style={{ background: 'var(--bg-card)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Utilización de Crédito</span>
                      <span style={{ fontWeight: 800, color: barColor }}>{usedPct}% ({balance > 0 ? `RD$ ${balance.toLocaleString('es-DO')}` : 'Sin deuda'})</span>
                    </div>

                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle-2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${usedPct}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      <span>Disponible: RD$ {Number(c.credit_available || 0).toLocaleString('es-DO')}</span>
                      <span>Límite: RD$ {limitAmt.toLocaleString('es-DO')}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenStatement(c.id)}
                      className="btn btn-secondary btn-sm"
                      style={{ justifyContent: 'center', fontSize: '0.78rem', gap: '5px' }}
                    >
                      <FileText size={14} />
                      <span>Estado</span>
                    </button>
                    <button
                      onClick={() => handleOpenCustomer360(c.id)}
                      className="btn btn-primary btn-sm"
                      style={{ justifyContent: 'center', fontSize: '0.78rem', gap: '5px' }}
                    >
                      <Eye size={14} />
                      <span>Ficha 360°</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* CUSTOMERS VIEW: TABLE */}
      {activeTab === 'customers' && viewMode === 'table' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Cliente / Razón Social</th>
                <th>RNC / Cédula</th>
                <th>Vendedor Asignado</th>
                <th>Ciudad</th>
                <th>Límite Crédito</th>
                <th>Saldo Pendiente</th>
                <th>Estado Crédito</th>
                <th>Riesgo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando clientes...</td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se encontraron clientes.</td></tr>
              ) : (
                customers.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.company_name || `${c.first_name} ${c.last_name}`}</div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.code}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{c.tax_id || c.id_card || 'Consumidor Final'}</td>
                    <td style={{ fontWeight: 600, color: '#60a5fa' }}>{c.salesperson_name || 'Carlos Mendoza'}</td>
                    <td>{c.city || 'Santo Domingo'}</td>
                    <td>RD$ {Number(c.credit_limit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                    <td style={{ fontWeight: 800, color: Number(c.current_balance) > 0 ? '#38bdf8' : 'var(--text-muted)' }}>
                      RD$ {Number(c.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      {c.is_credit_blocked === 1 ? (
                        <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Lock size={12} /> Bloqueado
                        </span>
                      ) : (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <ShieldCheck size={12} /> Activo
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${c.risk_score === 'critical' ? 'badge-danger' : c.risk_score === 'high' ? 'badge-warning' : 'badge-success'}`}>
                        {c.risk_score === 'critical' ? 'Crítico' : c.risk_score === 'high' ? 'Alto' : 'Bajo'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleOpenStatement(c.id)} className="btn btn-secondary btn-sm" title="Ver Estado de Cuenta">
                          <FileText size={14} />
                          <span>Estado</span>
                        </button>
                        <button onClick={() => handleOpenCustomer360(c.id)} className="btn btn-primary btn-sm" title="Ver Ficha 360°">
                          <Eye size={14} />
                          <span>360°</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CUSTOMER STATEMENT VIEW */}
      {activeTab === 'statement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Customer Selector & Quick Info Bar */}
          <div className="card" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 320px' }}>
              <Users size={18} color="var(--primary)" />
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>Seleccionar Cliente:</label>
              <select
                className="select-control"
                value={statementCustomerId || ''}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setStatementCustomerId(id);
                  loadStatement(id);
                }}
                style={{ flex: 1, minWidth: '220px', height: '38px', fontWeight: 600 }}
              >
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.company_name || `${c.first_name} ${c.last_name}`} — RNC: {c.tax_id || c.id_card || 'Final'} (RD$ {Number(c.current_balance || 0).toLocaleString('es-DO')})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => window.print()}
                className="btn btn-secondary btn-sm"
                style={{ gap: '6px' }}
              >
                <Printer size={15} />
                <span>Imprimir Estado</span>
              </button>
              {statementCustomerId && (
                <button
                  onClick={() => handleOpenCustomer360(statementCustomerId)}
                  className="btn btn-secondary btn-sm"
                  style={{ gap: '6px' }}
                >
                  <Eye size={15} />
                  <span>Ver Ficha 360°</span>
                </button>
              )}
            </div>
          </div>

          {loadingStatement ? (
            <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Cargando estado de cuenta del cliente...
            </div>
          ) : !statementData || !statementData.customer ? (
            <div className="card" style={{ padding: '50px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Seleccione un cliente para consultar su estado de cuenta.
            </div>
          ) : (
            <>
              {/* Customer Header Details Banner */}
              <div className="card" style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{
                      width: '54px',
                      height: '54px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #1e3a8a, #0284c7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1.3rem',
                      color: 'var(--text-primary)'
                    }}>
                      {(statementData.customer.company_name || statementData.customer.first_name || 'C').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {statementData.customer.company_name || `${statementData.customer.first_name} ${statementData.customer.last_name}`}
                        </h3>
                        {statementData.customer.is_credit_blocked === 1 ? (
                          <span className="badge badge-danger"><Lock size={12} /> Crédito Bloqueado</span>
                        ) : (
                          <span className="badge badge-success"><ShieldCheck size={12} /> Crédito Activo</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        <span><strong>RNC/Cédula:</strong> {statementData.customer.tax_id || statementData.customer.id_card || 'Consumidor Final'}</span>
                        <span><strong>Tel:</strong> {statementData.customer.phone || 'No reg.'}</span>
                        <span><strong>Ciudad:</strong> {statementData.customer.city || 'Santo Domingo'}</span>
                        <span><strong>Vendedor:</strong> {statementData.customer.salesperson_name || 'Carlos Mendoza'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '24px', textAlign: 'right' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Límite Aprobado</span>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        RD$ {Number(statementData.customer.credit_limit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Días Crédito</span>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#60a5fa' }}>
                        {statementData.customer.credit_days || 30} días
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 Summary KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                <div className="card" style={{ padding: '18px', borderLeft: '4px solid #3b82f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Débitos (Facturado)</span>
                    <FileText size={18} color="#3b82f6" />
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '8px' }}>
                    RD$ {Number(statementData.summary?.total_debits || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cargos por compras y facturas a crédito</span>
                </div>

                <div className="card" style={{ padding: '18px', borderLeft: '4px solid #10b981' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Créditos (Abonos & NC)</span>
                    <CheckCircle size={18} color="#10b981" />
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', marginTop: '8px' }}>
                    RD$ {Number(statementData.summary?.total_credits || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Pagos recibidos y notas de crédito aplicadas</span>
                </div>

                <div className="card" style={{ padding: '18px', borderLeft: `4px solid ${Number(statementData.summary?.current_balance || 0) > 0 ? '#ef4444' : '#10b981'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Balance Pendiente Actual</span>
                    <DollarSign size={18} color={Number(statementData.summary?.current_balance || 0) > 0 ? '#ef4444' : '#10b981'} />
                  </div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: Number(statementData.summary?.current_balance || 0) > 0 ? '#ef4444' : '#10b981', marginTop: '8px' }}>
                    RD$ {Number(statementData.summary?.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Monto exigible a la fecha</span>
                </div>
              </div>

              {/* Account Statement Ledger Table */}
              <div className="table-container">
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    Libro Mayor y Movimientos Históricos
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {statementData.ledger?.length || 0} movimientos registrados
                  </span>
                </div>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo Transacción</th>
                      <th>Documento</th>
                      <th>NCF DGII</th>
                      <th style={{ textAlign: 'right' }}>Débito (+)</th>
                      <th style={{ textAlign: 'right' }}>Crédito (-)</th>
                      <th style={{ textAlign: 'right' }}>Balance Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!statementData.ledger || statementData.ledger.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                          No hay transacciones ni facturas registradas en el estado de cuenta de este cliente.
                        </td>
                      </tr>
                    ) : (
                      statementData.ledger.map((row, idx) => (
                        <tr key={idx}>
                          <td style={{ fontSize: '0.82rem' }}>{row.date ? new Date(row.date).toLocaleDateString('es-DO') : '-'}</td>
                          <td>
                            <span className={`badge ${row.doc_type === 'PAYMENT' ? 'badge-success' : row.doc_type === 'CREDIT_NOTE' ? 'badge-warning' : 'badge-primary'}`}>
                              {row.doc_type === 'PAYMENT' ? 'Pago / Recibo' : row.doc_type === 'CREDIT_NOTE' ? 'Nota de Crédito' : 'Factura Venta'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.document}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#93c5fd' }}>{row.ncf || '-'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.debit > 0 ? '#fff' : 'var(--text-muted)' }}>
                            {row.debit > 0 ? `RD$ ${Number(row.debit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: row.credit > 0 ? '#10b981' : 'var(--text-muted)' }}>
                            {row.credit > 0 ? `RD$ ${Number(row.credit).toLocaleString('es-DO', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: Number(row.balance) > 0 ? '#38bdf8' : '#10b981' }}>
                            RD$ {Number(row.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* CREDIT & RISK MANAGEMENT VIEW */}
      {activeTab === 'credit-risk' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* 4 Risk KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {(() => {
              const lowRisk = customers.filter(c => c.risk_score === 'low' || !c.risk_score);
              const medRisk = customers.filter(c => c.risk_score === 'medium');
              const highRisk = customers.filter(c => c.risk_score === 'high');
              const critRisk = customers.filter(c => c.risk_score === 'critical' || c.is_credit_blocked === 1);

              return (
                <>
                  <div className="card" style={{ padding: '16px', borderLeft: '4px solid #10b981' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Riesgo Bajo (Al Día)</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#10b981', marginTop: '6px' }}>
                      {lowRisk.length} Clientes
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Excelente historial crediticio</span>
                  </div>

                  <div className="card" style={{ padding: '16px', borderLeft: '4px solid #38bdf8' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Riesgo Medio</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
                      {medRisk.length} Clientes
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Rotación de cartera regular</span>
                  </div>

                  <div className="card" style={{ padding: '16px', borderLeft: '4px solid #f59e0b' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Riesgo Alto</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b', marginTop: '6px' }}>
                      {highRisk.length} Clientes
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Límite de crédito cercano al tope</span>
                  </div>

                  <div className="card" style={{ padding: '16px', borderLeft: '4px solid #ef4444' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Riesgo Crítico / Bloqueados</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', marginTop: '6px' }}>
                      {critRisk.length} Clientes
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>En mora o crédito restringido</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Table of Credit Risk & Control */}
          <div className="table-container">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Gestión de Crédito, Riesgo y Bloqueo de Facturación
                </h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Active o bloquee líneas de crédito para impedir ventas a crédito a clientes con mora
                </p>
              </div>
              <span className="badge badge-primary">{customers.length} Clientes Monitoreados</span>
            </div>

            <table className="custom-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>RNC / Cédula</th>
                  <th>Límite Crédito</th>
                  <th>Saldo Pendiente</th>
                  <th style={{ minWidth: '180px' }}>% Utilizado</th>
                  <th>Días Crédito</th>
                  <th>Estado Línea</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const limit = Number(c.credit_limit || 0);
                  const balance = Number(c.current_balance || 0);
                  const usedPct = limit > 0 ? Math.min(100, Math.round((balance / limit) * 100)) : 0;
                  const isBlocked = c.is_credit_blocked === 1;
                  const barColor = isBlocked || usedPct >= 90 ? '#ef4444' : usedPct >= 65 ? '#f59e0b' : '#10b981';

                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.company_name || `${c.first_name} ${c.last_name}`}</div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.city || 'Santo Domingo'}</span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{c.tax_id || c.id_card || 'Consumidor Final'}</td>
                      <td>RD$ {limit.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                      <td style={{ fontWeight: 800, color: balance > 0 ? '#38bdf8' : 'var(--text-muted)' }}>
                        RD$ {balance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 700, color: barColor }}>{usedPct}%</span>
                          <span style={{ color: 'var(--text-muted)' }}>Disp: RD$ {Number(c.credit_available || 0).toLocaleString('es-DO')}</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--bg-subtle-2)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${usedPct}%`, height: '100%', background: barColor, borderRadius: '3px' }} />
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.credit_days || 30} días</td>
                      <td>
                        {isBlocked ? (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Lock size={12} /> Bloqueado
                          </span>
                        ) : (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={12} /> Habilitado
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleToggleCreditBlock(c.id)}
                            className={`btn btn-sm ${isBlocked ? 'btn-success' : 'btn-danger'}`}
                            style={{ padding: '4px 8px', fontSize: '0.72rem', gap: '4px' }}
                            title={isBlocked ? 'Habilitar línea de crédito' : 'Bloquear línea de crédito'}
                          >
                            {isBlocked ? <Unlock size={13} /> : <Lock size={13} />}
                            <span>{isBlocked ? 'Desbloquear' : 'Bloquear'}</span>
                          </button>
                          <button
                            onClick={() => handleOpenStatement(c.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            title="Ver Estado de Cuenta"
                          >
                            <FileText size={13} />
                          </button>
                          <button
                            onClick={() => handleOpenCustomer360(c.id)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                            title="Ficha 360°"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUPPLIERS TABLE */}
      {activeTab === 'suppliers' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Razón Social / Comercial</th>
                <th>RNC</th>
                <th>Contacto</th>
                <th>Teléfono / Correo</th>
                <th>Compras Registradas</th>
                <th>Saldo Pendiente</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>Cargando proveedores...</td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No se encontraron proveedores.</td></tr>
              ) : (
                suppliers.map(s => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.company_name}</div>
                      {s.trade_name && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.trade_name}</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.tax_id}</td>
                    <td>{s.contact_person || '-'}</td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{s.phone}</div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.email}</span>
                    </td>
                    <td>{s.total_purchases || 0}</td>
                    <td style={{ fontWeight: 800, color: Number(s.pending_balance) > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
                      RD$ {Number(s.pending_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SECTION #40: CUSTOMER 360° MODAL (REDESIGNED EXECUTIVE UI) */}
      {customer360 && (
        <div className="modal-overlay" onClick={() => setCustomer360(null)}>
          <div
            className="modal-content modal-content-xl"
            style={{
              padding: '24px',
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'var(--bg-card)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* HERO HEADER */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '18px',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                {/* Left: Customer Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    fontSize: '1.4rem',
                    color: '#fff',
                    boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
                    flexShrink: 0
                  }}>
                    {(customer360.customer.company_name || customer360.customer.first_name || 'CL').slice(0, 2).toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
                        {customer360.customer.company_name || `${customer360.customer.first_name || ''} ${customer360.customer.last_name || ''}`.trim()}
                      </h3>
                      <span className="badge" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2))', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                        <Sparkles size={11} style={{ marginRight: '4px' }} />
                        Ficha 360°
                      </span>
                      {customer360.customer.is_credit_blocked === 1 ? (
                        <span className="badge badge-danger">
                          <Lock size={11} style={{ marginRight: '4px' }} />
                          Crédito Bloqueado
                        </span>
                      ) : (
                        <span className="badge badge-success">
                          <ShieldCheck size={11} style={{ marginRight: '4px' }} />
                          Crédito Activo
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <strong style={{ color: 'var(--text-muted)' }}>RNC/Cédula:</strong>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>
                          {customer360.customer.tax_id || customer360.customer.id_card || 'Consumidor Final'}
                        </span>
                        {(customer360.customer.tax_id || customer360.customer.id_card) && (
                          <button
                            type="button"
                            title="Copiar Documento"
                            onClick={() => {
                              navigator.clipboard.writeText(customer360.customer.tax_id || customer360.customer.id_card);
                              addToast('RNC/Cédula copiado al portapapeles', 'info');
                            }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                          >
                            <Copy size={12} />
                          </button>
                        )}
                      </span>

                      <span>•</span>

                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <UserCheck size={13} color="#60a5fa" />
                        <span>Vendedor: <strong style={{ color: '#60a5fa' }}>{customer360.customer.salesperson_name || 'Sin Asignar'}</strong></span>
                      </span>

                      <span>•</span>

                      <span>
                        Riesgo: <strong style={{
                          color: (customer360.customer.risk_score || 'A') === 'A' ? '#10b981' :
                                 (customer360.customer.risk_score === 'B') ? '#3b82f6' :
                                 (customer360.customer.risk_score === 'C') ? '#f59e0b' : '#ef4444'
                        }}>
                          Categoría {customer360.customer.risk_score || 'A'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Quick Action Buttons & Close */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {onNavigate && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomer360(null);
                        onNavigate('pos');
                      }}
                      className="btn btn-sm btn-primary"
                      style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                    >
                      <ShoppingCart size={14} />
                      <span>Facturar en POS</span>
                    </button>
                  )}

                  {onNavigate && Number(customer360.kpis?.pending_balance || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomer360(null);
                        onNavigate('collections');
                      }}
                      className="btn btn-sm btn-primary"
                      style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                      <HandCoins size={14} />
                      <span>Cobrar Deuda</span>
                    </button>
                  )}

                  {customer360.customer.phone && (
                    <a
                      href={`https://wa.me/1${customer360.customer.phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm"
                      style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', border: '1px solid rgba(34, 197, 94, 0.3)' }}
                      title="Chatear por WhatsApp"
                    >
                      <MessageCircle size={14} />
                      <span>WhatsApp</span>
                    </a>
                  )}

                  {customer360.customer.phone && (
                    <a
                      href={`tel:${customer360.customer.phone}`}
                      className="btn btn-sm btn-secondary"
                      title="Llamar Cliente"
                    >
                      <PhoneCall size={14} />
                    </a>
                  )}

                  <button
                    onClick={() => setCustomer360(null)}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '6px 8px', borderRadius: '8px' }}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* TOP 4 KEY METRIC CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '16px' }}>
                {/* Balance Pendiente */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Balance Pendiente
                    </span>
                    <DollarSign size={14} color={Number(customer360.kpis?.pending_balance || 0) > 0 ? '#f59e0b' : '#10b981'} />
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: Number(customer360.kpis?.pending_balance || 0) > 0 ? '#f59e0b' : '#10b981' }}>
                    RD$ {Number(customer360.kpis?.pending_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: Number(customer360.kpis?.overdue_balance || 0) > 0 ? '#ef4444' : 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {Number(customer360.kpis?.overdue_balance || 0) > 0 ? (
                      <>⚠️ RD$ {Number(customer360.kpis?.overdue_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })} vencido ({customer360.kpis?.overdue_invoices_count || 0} facturas)</>
                    ) : (
                      <>✅ Sin facturas vencidas</>
                    )}
                  </div>
                </div>

                {/* Línea de Crédito & Utilización */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Línea de Crédito
                    </span>
                    <CreditCard size={14} color="#60a5fa" />
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    RD$ {Number(customer360.customer.credit_limit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', margin: '6px 0 4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${customer360.customer.credit_used_percent || 0}%`,
                      height: '100%',
                      background: (customer360.customer.credit_used_percent || 0) > 90 ? '#ef4444' : (customer360.customer.credit_used_percent || 0) > 60 ? '#f59e0b' : '#3b82f6',
                      borderRadius: '4px',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                    <span>Usado: {customer360.customer.credit_used_percent || 0}%</span>
                    <span style={{ color: '#38bdf8' }}>Disp: RD$ {Number(customer360.customer.credit_available || 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</span>
                  </div>
                </div>

                {/* Total Comprado Histórico */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Compras Históricas
                    </span>
                    <TrendingUp size={14} color="#a78bfa" />
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    RD$ {Number(customer360.kpis?.total_purchased_history || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#a78bfa', marginTop: '2px' }}>
                    Este año: RD$ {Number(customer360.kpis?.purchases_year || 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })} ({customer360.invoices?.length || 0} facturas)
                  </div>
                </div>

                {/* Última Actividad / Frecuencia */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Última Compra
                    </span>
                    <Clock size={14} color="#10b981" />
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {customer360.customer.days_without_purchase !== null && customer360.customer.days_without_purchase !== undefined
                      ? `Hace ${customer360.customer.days_without_purchase} días`
                      : 'Sin Compras'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {customer360.customer.last_purchase_date
                      ? new Date(customer360.customer.last_purchase_date).toLocaleDateString('es-DO')
                      : 'N/A'} • {customer360.customer.credit_days || 30} días de plazo
                  </div>
                </div>
              </div>
            </div>

            {/* REFINED 9-TAB NAVIGATION BAR */}
            <div style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '8px',
              marginBottom: '18px',
              scrollbarWidth: 'thin'
            }}>
              {[
                { id: 'general', label: 'Perfil General', icon: Building2 },
                { id: 'conditions', label: 'Crédito & Riesgo', icon: ShieldAlert },
                { id: 'sales', label: 'Facturas', count: customer360.invoices?.length || 0, icon: Receipt },
                { id: 'cxc', label: 'Cuentas por Cobrar', count: customer360.receivables?.length || 0, icon: Clock, alert: Number(customer360.kpis?.overdue_balance || 0) > 0 },
                { id: 'payments', label: 'Historial de Pagos', count: customer360.payments?.length || 0, icon: HandCoins },
                { id: 'stats', label: 'Métricas & Tendencia', icon: Activity },
                { id: 'notes', label: 'Notas & Cobranza', count: customer360.collection_notes?.length || 0, icon: MessageCircle },
                { id: 'geo', label: 'Ubicación GPS', icon: MapPin },
                { id: 'statement', label: 'Estado de Cuenta', icon: FileText }
              ].map(t => {
                const IconComponent = t.icon;
                const isActive = active360Tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActive360Tab(t.id)}
                    className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 14px',
                      background: isActive ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.04)',
                      borderColor: isActive ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    <IconComponent size={14} color={isActive ? '#fff' : 'var(--text-muted)'} />
                    <span>{t.label}</span>
                    {t.count !== undefined && (
                      <span
                        style={{
                          background: isActive ? 'rgba(255, 255, 255, 0.25)' : t.alert ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                          color: isActive ? '#fff' : t.alert ? '#ef4444' : 'var(--text-secondary)',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: '10px'
                        }}
                      >
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT AREA */}
            <div style={{ minHeight: '340px' }}>
              {/* 1. DATOS GENERALES */}
              {active360Tab === 'general' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {/* Card: Datos de Contacto */}
                  <div className="card" style={{ padding: '18px', background: 'var(--bg-subtle)' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Building2 size={16} color="var(--accent-primary)" />
                      <span>Identificación & Contacto</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Razón Social / Nombre Completo</span>
                        <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {customer360.customer.company_name || `${customer360.customer.first_name || ''} ${customer360.customer.last_name || ''}`}
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Tipo de Persona</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', textTransform: 'capitalize' }}>
                            {customer360.customer.person_type === 'juridica' ? 'Persona Jurídica (Empresa)' : 'Persona Natural / Física'}
                          </p>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RNC / Cédula</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#38bdf8', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                            {customer360.customer.tax_id || customer360.customer.id_card || 'Consumidor Final'}
                          </p>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Teléfono Principal</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                            {customer360.customer.phone || 'No registrado'}
                          </p>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Correo Electrónico</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px', wordBreak: 'break-all' }}>
                            {customer360.customer.email || 'No registrado'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card: Ubicación & Logística */}
                  <div className="card" style={{ padding: '18px', background: 'var(--bg-subtle)' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MapPin size={16} color="#10b981" />
                      <span>Ubicación de Despacho</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Dirección Física</span>
                        <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                          {customer360.customer.address || 'Santo Domingo, República Dominicana'}
                        </p>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ciudad / Municipio</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                            {customer360.customer.city || 'Santo Domingo'}
                          </p>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Zona / Ruta</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                            {customer360.customer.zone || 'Metropolitana'}
                          </p>
                        </div>
                      </div>

                      {customer360.customer.latitude && customer360.customer.longitude && (
                        <div style={{ marginTop: '6px' }}>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${customer360.customer.latitude},${customer360.customer.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-sm btn-secondary"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <ExternalLink size={13} />
                            <span>Ver en Google Maps ({customer360.customer.latitude.toFixed(4)}, {customer360.customer.longitude.toFixed(4)})</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card: Comercial & Vendedor */}
                  <div className="card" style={{ padding: '18px', background: 'var(--bg-subtle)' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Award size={16} color="#f59e0b" />
                      <span>Ejecutivo de Cuenta & Ventas</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Vendedor Asignado</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(96, 165, 250, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa', fontWeight: 700, fontSize: '0.85rem' }}>
                            <UserCheck size={16} />
                          </div>
                          <div>
                            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#60a5fa', margin: 0 }}>
                              {customer360.customer.salesperson_name || 'Carlos Mendoza'}
                            </p>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              Código: {customer360.customer.salesperson_code || 'VEND-001'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Descuento Estándar</span>
                          <p style={{ fontSize: '0.95rem', fontWeight: 700, color: '#a78bfa', marginTop: '2px' }}>
                            {customer360.customer.discount_percent || 0}%
                          </p>
                        </div>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Estado del Cliente</span>
                          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981', marginTop: '2px', textTransform: 'uppercase' }}>
                            {customer360.customer.status || 'Activo'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. CONDICIONES DE CRÉDITO & RIESGO */}
              {active360Tab === 'conditions' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                  {/* Credit Line Status Card */}
                  <div className="card" style={{ padding: '20px', background: 'var(--bg-subtle)' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CreditCard size={18} color="var(--accent-primary)" />
                      <span>Parámetros de la Línea de Crédito</span>
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Límite de Crédito Autorizado:</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          RD$ {Number(customer360.customer.credit_limit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Saldo Utilizado / Por Cobrar:</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: Number(customer360.customer.current_balance || 0) > 0 ? '#f59e0b' : 'var(--text-muted)' }}>
                          RD$ {Number(customer360.customer.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Crédito Disponible Actual:</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>
                          RD$ {Number(customer360.customer.credit_available || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Plazo de Pago (Días):</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#60a5fa' }}>
                          {customer360.customer.credit_days || 30} días
                        </span>
                      </div>

                      {/* Toggle block credit button */}
                      <div style={{ marginTop: '10px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Estado de Bloqueo:</span>
                        <button
                          type="button"
                          onClick={() => handleToggleCreditBlock(customer360.customer.id)}
                          className={`btn btn-sm ${customer360.customer.is_credit_blocked === 1 ? 'btn-danger' : 'btn-secondary'}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {customer360.customer.is_credit_blocked === 1 ? (
                            <><Unlock size={14} /> <span>Desbloquear Crédito</span></>
                          ) : (
                            <><Lock size={14} /> <span>Bloquear Crédito</span></>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Risk Assessment Card */}
                  <div className="card" style={{ padding: '20px', background: 'var(--bg-subtle)' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldAlert size={18} color="#f59e0b" />
                      <span>Evaluación de Riesgo & Puntualidad</span>
                    </h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-main)', padding: '12px', borderRadius: '10px' }}>
                        <div style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '10px',
                          background: (customer360.customer.risk_score || 'A') === 'A' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          fontSize: '1.3rem',
                          color: (customer360.customer.risk_score || 'A') === 'A' ? '#10b981' : '#f59e0b'
                        }}>
                          {customer360.customer.risk_score || 'A'}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Clasificación de Riesgo: {(customer360.customer.risk_score || 'A') === 'A' ? 'Bajo Riesgo (Excelente)' : customer360.customer.risk_score === 'B' ? 'Riesgo Moderado' : 'Alto Riesgo'}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            {(customer360.customer.risk_score || 'A') === 'A'
                              ? 'Cliente con excelente historial de cumplimiento y pagos puntuales.'
                              : 'Monitorear vencimientos de facturas antes de conceder sobregiros.'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Facturas Vencidas</span>
                          <p style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(customer360.kpis?.overdue_invoices_count || 0) > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                            {customer360.kpis?.overdue_invoices_count || 0} facturas
                          </p>
                        </div>
                        <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '8px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Monto en Mora</span>
                          <p style={{ fontSize: '1.1rem', fontWeight: 800, color: Number(customer360.kpis?.overdue_balance || 0) > 0 ? '#ef4444' : '#10b981', marginTop: '2px' }}>
                            RD$ {Number(customer360.kpis?.overdue_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. FACTURAS DE VENTA */}
              {active360Tab === 'sales' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Total de Facturas Emitidas: <strong>{customer360.invoices?.length || 0}</strong>
                    </span>
                  </div>
                  <div className="table-container" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>No. Factura</th>
                          <th>NCF Fiscal</th>
                          <th>Fecha Emisión</th>
                          <th>Tipo Venta</th>
                          <th>Monto Total</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!customer360.invoices || customer360.invoices.length === 0 ? (
                          <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay facturas registradas para este cliente.</td></tr>
                        ) : (
                          customer360.invoices.map(s => (
                            <tr key={s.id}>
                              <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.sale_number}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{s.ncf || '-'}</td>
                              <td>{new Date(s.created_at).toLocaleDateString('es-DO')}</td>
                              <td style={{ textTransform: 'capitalize' }}>
                                <span className={`badge ${s.sale_type === 'credit' ? 'badge-warning' : 'badge-info'}`}>
                                  {s.sale_type === 'credit' ? 'Crédito' : 'Contado'}
                                </span>
                              </td>
                              <td style={{ fontWeight: 800, color: 'var(--text-primary)' }}>RD$ {Number(s.total).toFixed(2)}</td>
                              <td>
                                <span className={`badge ${s.status === 'cancelled' ? 'badge-danger' : 'badge-success'}`}>
                                  {s.status === 'cancelled' ? 'Anulada' : 'Emitida'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 4. CUENTAS POR COBRAR (CxC) */}
              {active360Tab === 'cxc' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Facturas con Saldo Abierto: <strong>{customer360.receivables?.length || 0}</strong> • Saldo Total: <strong style={{ color: '#f59e0b' }}>RD$ {Number(customer360.kpis?.pending_balance || 0).toFixed(2)}</strong>
                    </span>
                  </div>
                  <div className="table-container" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Factura</th>
                          <th>NCF</th>
                          <th>Emisión</th>
                          <th>Vencimiento</th>
                          <th>Monto Original</th>
                          <th>Saldo Pendiente</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!customer360.receivables || customer360.receivables.length === 0 ? (
                          <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--success)' }}>🎉 Este cliente no tiene cuentas pendientes de cobro (Al día).</td></tr>
                        ) : (
                          customer360.receivables.map(ar => (
                            <tr key={ar.id}>
                              <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{ar.invoice_number || ar.sale_number}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{ar.ncf || '-'}</td>
                              <td>{ar.issue_date}</td>
                              <td>{ar.due_date}</td>
                              <td>RD$ {Number(ar.amount).toFixed(2)}</td>
                              <td style={{ fontWeight: 800, color: Number(ar.balance) > 0 ? '#f59e0b' : '#10b981' }}>
                                RD$ {Number(ar.balance).toFixed(2)}
                              </td>
                              <td>
                                <span className={`badge ${ar.status === 'paid' ? 'badge-success' : ar.status === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>
                                  {ar.status === 'paid' ? 'Pagada' : ar.status === 'overdue' ? 'Vencida' : 'Pendiente'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 5. HISTORIAL DE PAGOS */}
              {active360Tab === 'payments' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Total de Pagos Registrados: <strong>{customer360.payments?.length || 0}</strong>
                    </span>
                  </div>
                  <div className="table-container" style={{ maxHeight: '380px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Fecha Pago</th>
                          <th>Monto Pagado</th>
                          <th>Método de Pago</th>
                          <th>No. Comprobante / Recibo</th>
                          <th>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!customer360.payments || customer360.payments.length === 0 ? (
                          <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay pagos registrados aún.</td></tr>
                        ) : (
                          customer360.payments.map(p => (
                            <tr key={p.id}>
                              <td>{p.payment_date}</td>
                              <td style={{ fontWeight: 800, color: '#10b981' }}>RD$ {Number(p.total_amount).toFixed(2)}</td>
                              <td style={{ textTransform: 'capitalize' }}>
                                <span className="badge" style={{ background: 'var(--bg-subtle-2)', color: 'var(--text-primary)' }}>
                                  {p.payment_method === 'cash' ? '💵 Efectivo' : p.payment_method === 'transfer' ? '🏦 Transferencia' : p.payment_method === 'check' ? '🧾 Cheque' : '💳 Tarjeta'}
                                </span>
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{p.receipt_number || p.reference_number || '-'}</td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{p.notes || '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 6. MÉTRICAS & COMPORTAMIENTO (MONTHLY BAR CHART) */}
              {active360Tab === 'stats' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    <div className="card" style={{ padding: '16px', background: 'var(--bg-subtle)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Compras del Año Actual</span>
                      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                        RD$ {Number(customer360.kpis?.purchases_year || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="card" style={{ padding: '16px', background: 'var(--bg-subtle)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Compras del Mes Actual</span>
                      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                        RD$ {Number(customer360.kpis?.purchases_month || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="card" style={{ padding: '16px', background: 'var(--bg-subtle)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Promedio Mensual de Compra</span>
                      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#a78bfa', marginTop: '4px' }}>
                        RD$ {Number(customer360.kpis?.monthly_purchase_avg || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>

                    <div className="card" style={{ padding: '16px', background: 'var(--bg-subtle)' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Último Pago Recibido</span>
                      <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                        RD$ {Number(customer360.kpis?.last_payment_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  {/* Visual 12-Month Bar Chart */}
                  <div className="card" style={{ padding: '20px', background: 'var(--bg-subtle)' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Activity size={18} color="var(--accent-primary)" />
                      <span>Evolución de Compras Mensuales (Últimos 12 Meses)</span>
                    </h4>

                    {(!customer360.monthly_behavior || customer360.monthly_behavior.length === 0) ? (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>No hay registros de compras en los últimos meses.</p>
                    ) : (
                      (() => {
                        const maxAmt = Math.max(...customer360.monthly_behavior.map(m => Number(m.amount) || 0), 1000);
                        return (
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', height: '180px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                            {customer360.monthly_behavior.map((m, idx) => {
                              const heightPct = Math.min(100, Math.max(10, Math.round((Number(m.amount) / maxAmt) * 100)));
                              return (
                                <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '6px' }}>
                                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#38bdf8' }}>
                                    {Number(m.amount) > 0 ? `${(Number(m.amount) / 1000).toFixed(0)}k` : '0'}
                                  </span>
                                  <div
                                    title={`${m.month}: RD$ ${Number(m.amount).toFixed(2)} (${m.invoices_count} facturas)`}
                                    style={{
                                      width: '100%',
                                      height: `${heightPct}%`,
                                      background: 'linear-gradient(180deg, #38bdf8 0%, #2563eb 100%)',
                                      borderRadius: '6px 6px 0 0',
                                      transition: 'height 0.3s ease'
                                    }}
                                  />
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                    {m.month.slice(5)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
              )}

              {/* 7. NOTAS Y SEGUIMIENTOS DE COBRANZA */}
              {active360Tab === 'notes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Add Note Form */}
                  <form onSubmit={handleAddCollectionNote} style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-subtle)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <label className="label-control" style={{ fontWeight: 700 }}>
                      Nueva Nota de Seguimiento o Promesa de Pago
                    </label>
                    <textarea
                      required
                      rows="2"
                      className="input-control"
                      placeholder="Ej: Se contactó a la administradora. Confirma que emitirá cheque el próximo viernes..."
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={15} color="var(--accent-primary)" />
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Fecha de Promesa de Pago:</span>
                        <input
                          type="date"
                          className="input-control"
                          value={newPromiseDate}
                          onChange={(e) => setNewPromiseDate(e.target.value)}
                          style={{ height: '34px', width: '160px', fontSize: '0.8rem' }}
                        />
                      </div>
                      <button type="submit" disabled={addingNote} className="btn btn-primary btn-sm" style={{ padding: '7px 18px' }}>
                        <Send size={14} />
                        <span>{addingNote ? 'Guardando...' : 'Registrar Seguimiento'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Notes Timeline Feed */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(!customer360.collection_notes || customer360.collection_notes.length === 0) ? (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>No hay notas de seguimiento registradas para este cliente.</p>
                    ) : (
                      customer360.collection_notes.map(cn => (
                        <div key={cn.id} style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px', borderLeft: '4px solid #3b82f6' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 700, color: '#60a5fa' }}>{cn.user_name || 'Oficial de Cobranzas'}</span>
                            <span>{new Date(cn.created_at).toLocaleString('es-DO')}</span>
                          </div>
                          <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: '0 0 6px' }}>{cn.note}</p>
                          {cn.promised_payment_date && (
                            <span className="badge badge-warning" style={{ fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={11} />
                              Promesa de Pago para: <strong>{cn.promised_payment_date}</strong>
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* 8. UBICACIÓN GEOGRÁFICA & GPS */}
              {active360Tab === 'geo' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '16px', background: 'var(--bg-subtle)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Coordenadas Registradas</span>
                      <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                        Latitud: {customer360.customer.latitude || '18.4861'} • Longitud: {customer360.customer.longitude || '-69.9312'}
                      </p>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${customer360.customer.latitude || 18.4861},${customer360.customer.longitude || -69.9312}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      <Navigation size={14} />
                      <span>Abrir Ruta en Google Maps</span>
                    </a>
                  </div>

                  <div style={{
                    height: '240px',
                    background: 'radial-gradient(circle at center, rgba(37, 99, 235, 0.1) 0%, rgba(15, 23, 42, 0.8) 100%)',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid var(--border-color)',
                    textAlign: 'center',
                    padding: '20px'
                  }}>
                    <div>
                      <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <MapPin size={28} color="#10b981" />
                      </div>
                      <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        {customer360.customer.company_name || `${customer360.customer.first_name || ''} ${customer360.customer.last_name || ''}`}
                      </p>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                        {customer360.customer.address || 'Santo Domingo, República Dominicana'} ({customer360.customer.city || 'Santo Domingo'})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 9. ESTADO DE CUENTA */}
              {active360Tab === 'statement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                        Resumen de Estado de Cuenta y Facturas Pendientes
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Corte al día: {new Date().toLocaleDateString('es-DO')}
                      </span>
                    </div>
                    <button onClick={() => window.print()} className="btn btn-secondary btn-sm">
                      <Printer size={14} />
                      <span>Imprimir Estado</span>
                    </button>
                  </div>

                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Factura</th>
                          <th>NCF</th>
                          <th>Emisión</th>
                          <th>Vencimiento</th>
                          <th>Total Facturado</th>
                          <th>Saldo Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!customer360.receivables || customer360.receivables.length === 0 ? (
                          <tr><td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--success)' }}>Cliente sin deuda pendiente.</td></tr>
                        ) : (
                          customer360.receivables.map(r => (
                            <tr key={r.id}>
                              <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{r.invoice_number || r.sale_number}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>{r.ncf || '-'}</td>
                              <td>{r.issue_date}</td>
                              <td>{r.due_date}</td>
                              <td>RD$ {Number(r.amount).toFixed(2)}</td>
                              <td style={{ fontWeight: 800, color: '#f59e0b' }}>RD$ {Number(r.balance).toFixed(2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE CUSTOMER MODAL */}
      {showCustModal && (
        <div className="modal-overlay" onClick={() => setShowCustModal(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Nuevo Cliente</h3>
            <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label-control">Tipo de Persona</label>
                <select
                  className="select-control"
                  value={custForm.person_type}
                  onChange={(e) => setCustForm({ ...custForm, person_type: e.target.value })}
                >
                  <option value="juridica">Persona Jurídica (Empresa / Salón)</option>
                  <option value="natural">Persona Física / Natural</option>
                </select>
              </div>

              <div>
                <label className="label-control">Razón Social / Nombre Comercial *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Ej: Salón Estilo & Belleza SRL"
                  value={custForm.company_name}
                  onChange={(e) => setCustForm({ ...custForm, company_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="label-control" style={{ marginBottom: 0 }}>RNC / Cédula *</label>
                    <button
                      type="button"
                      onClick={handleConsultDgiiForCustomer}
                      disabled={consultingDgii}
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        color: '#60a5fa',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Search size={11} />
                      <span>{consultingDgii ? 'Buscando...' : 'Consultar DGII'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="101-01063-2"
                    value={custForm.tax_id}
                    onChange={(e) => {
                      setCustForm({ ...custForm, tax_id: e.target.value });
                      setDgiiVerified(null);
                    }}
                  />
                  {dgiiVerified && (
                    <div style={{ marginTop: '6px', padding: '6px 8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={14} />
                      <span>DGII: <strong>{dgiiVerified.status}</strong> • e-CF: {dgiiVerified.electronic_billing}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label-control">Teléfono</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="809-..."
                    value={custForm.phone}
                    onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">Vendedor Permanente Asignado</label>
                <select
                  className="select-control"
                  value={custForm.salesperson_id}
                  onChange={(e) => setCustForm({ ...custForm, salesperson_id: e.target.value })}
                >
                  <option value="">Seleccionar Vendedor...</option>
                  {salespeople.map(sp => (
                    <option key={sp.id} value={sp.id}>{sp.name} ({sp.code})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Límite de Crédito (RD$)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={custForm.credit_limit}
                    onChange={(e) => setCustForm({ ...custForm, credit_limit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Plazo (Días)</label>
                  <input
                    type="number"
                    className="input-control"
                    value={custForm.credit_days}
                    onChange={(e) => setCustForm({ ...custForm, credit_days: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowCustModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SUPPLIER MODAL */}
      {showSuppModal && (
        <div className="modal-overlay" onClick={() => setShowSuppModal(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Nuevo Proveedor</h3>
            <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label-control">Razón Social *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Nombre de la empresa suplidora"
                  value={suppForm.company_name}
                  onChange={(e) => setSuppForm({ ...suppForm, company_name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="label-control" style={{ marginBottom: 0 }}>RNC *</label>
                    <button
                      type="button"
                      onClick={handleConsultDgiiForSupplier}
                      disabled={consultingDgii}
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        color: '#60a5fa',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Search size={11} />
                      <span>{consultingDgii ? 'Buscando...' : 'Consultar DGII'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="input-control"
                    placeholder="101-00157-7"
                    value={suppForm.tax_id}
                    onChange={(e) => {
                      setSuppForm({ ...suppForm, tax_id: e.target.value });
                      setSuppDgiiVerified(null);
                    }}
                  />
                  {suppDgiiVerified && (
                    <div style={{ marginTop: '6px', padding: '6px 8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldCheck size={14} />
                      <span>DGII: <strong>{suppDgiiVerified.status}</strong> • e-CF: {suppDgiiVerified.electronic_billing}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="label-control">Nombre Comercial</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Marca comercial"
                    value={suppForm.trade_name}
                    onChange={(e) => setSuppForm({ ...suppForm, trade_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Teléfono</label>
                  <input
                    type="text"
                    className="input-control"
                    value={suppForm.phone}
                    onChange={(e) => setSuppForm({ ...suppForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Correo Electrónico</label>
                  <input
                    type="email"
                    className="input-control"
                    value={suppForm.email}
                    onChange={(e) => setSuppForm({ ...suppForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowSuppModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RNC LOOKUP MODAL */}
      <RncLookupModal
        isOpen={showRncModal}
        onClose={() => setShowRncModal(false)}
        onSelectCompany={handleSelectFromRncModal}
      />
    </div>
  );
}
