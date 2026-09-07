import React, { useState, useEffect } from 'react';
import {
  Users, Building, Plus, Search, Eye, Phone, Mail,
  MapPin, DollarSign, Clock, Package, X, CheckCircle,
  LayoutGrid, Table, ShieldAlert, ShieldCheck, AlertCircle,
  FileText, Send, Calendar, Percent, UserCheck, Building2,
  Printer, Lock, Unlock, ArrowRight, RefreshCw, AlertTriangle
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

      {/* SECTION #40: CUSTOMER 360° MODAL (9 TABS) */}
      {customer360 && (
        <div className="modal-overlay" onClick={() => setCustomer360(null)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--text-primary)'
                }}>
                  {(customer360.customer.company_name || customer360.customer.first_name).slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {customer360.customer.company_name || `${customer360.customer.first_name} ${customer360.customer.last_name}`}
                    </h3>
                    <span className="badge badge-success">Ficha 360°</span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    RNC/Cédula: {customer360.customer.tax_id || customer360.customer.id_card} • Vendedor: {customer360.customer.salesperson_name || 'Carlos Mendoza'}
                  </p>
                </div>
              </div>

              <button onClick={() => setCustomer360(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            {/* 9 Tabs Bar */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '18px' }}>
              {[
                { id: 'general', label: '1. Datos Generales' },
                { id: 'conditions', label: '2. Condiciones Comerciales' },
                { id: 'sales', label: `3. Facturas (${customer360.invoices?.length || 0})` },
                { id: 'cxc', label: `4. CxC (${customer360.receivables?.length || 0})` },
                { id: 'payments', label: `5. Pagos (${customer360.payments?.length || 0})` },
                { id: 'stats', label: '6. Comportamiento' },
                { id: 'notes', label: `7. Notas Cobranza (${customer360.collection_notes?.length || 0})` },
                { id: 'geo', label: '8. Ubicación GPS' },
                { id: 'statement', label: '9. Estado de Cuenta' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActive360Tab(t.id)}
                  className={`btn btn-sm ${active360Tab === t.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: '8px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB CONTENT */}
            {/* 1. Datos Generales */}
            {active360Tab === 'general' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Razón Social / Nombre</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {customer360.customer.company_name || `${customer360.customer.first_name} ${customer360.customer.last_name}`}
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>RNC / Cédula</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {customer360.customer.tax_id || customer360.customer.id_card || 'Consumidor Final'}
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Teléfono</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {customer360.customer.phone || 'No registrado'}
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Correo Electrónico</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {customer360.customer.email || 'No registrado'}
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Dirección Física</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {customer360.customer.address || 'Santo Domingo, República Dominicana'}
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ciudad</span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {customer360.customer.city || 'Santo Domingo'}
                  </p>
                </div>
              </div>
            )}

            {/* 2. Condiciones Comerciales */}
            {active360Tab === 'conditions' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Vendedor Permanente Asignado</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#60a5fa', marginTop: '2px' }}>
                    {customer360.customer.salesperson_name || 'Carlos Mendoza'} ({customer360.customer.salesperson_code || 'VEND-001'})
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Límite de Crédito Autorizado</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                    RD$ {Number(customer360.customer.credit_limit || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Días de Crédito (Plazo)</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                    {customer360.customer.credit_days || 30} días
                  </p>
                </div>

                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Descuento Fijo Comercial</span>
                  <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#a78bfa', marginTop: '2px' }}>
                    {customer360.customer.discount_percent || 0}%
                  </p>
                </div>
              </div>
            )}

            {/* 3. Facturas */}
            {active360Tab === 'sales' && (
              <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Factura</th>
                      <th>NCF</th>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Total</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer360.invoices?.map(s => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.sale_number}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{s.ncf}</td>
                        <td>{new Date(s.created_at).toLocaleDateString('es-DO')}</td>
                        <td>{s.sale_type}</td>
                        <td style={{ fontWeight: 700, color: '#60a5fa' }}>RD$ {Number(s.total).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${s.status === 'cancelled' ? 'badge-danger' : 'badge-success'}`}>{s.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 4. Cuentas por Cobrar */}
            {active360Tab === 'cxc' && (
              <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Factura / NCF</th>
                      <th>Emisión</th>
                      <th>Vencimiento</th>
                      <th>Monto Total</th>
                      <th>Balance Pendiente</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer360.receivables?.map(ar => (
                      <tr key={ar.id}>
                        <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{ar.invoice_number || ar.ncf}</td>
                        <td>{ar.issue_date}</td>
                        <td>{ar.due_date}</td>
                        <td>RD$ {Number(ar.amount).toFixed(2)}</td>
                        <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(ar.balance).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${ar.status === 'paid' ? 'badge-success' : ar.status === 'overdue' ? 'badge-danger' : 'badge-warning'}`}>{ar.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 5. Historial de Pagos */}
            {active360Tab === 'payments' && (
              <div className="table-container" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Fecha de Pago</th>
                      <th>Monto Pagado</th>
                      <th>Método</th>
                      <th>Comprobante</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer360.payments?.map(p => (
                      <tr key={p.id}>
                        <td>{p.payment_date}</td>
                        <td style={{ fontWeight: 800, color: 'var(--success)' }}>RD$ {Number(p.total_amount).toFixed(2)}</td>
                        <td style={{ textTransform: 'capitalize' }}>{p.payment_method}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{p.receipt_number || '-'}</td>
                        <td>{p.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* 6. Comportamiento & Estadísticas */}
            {active360Tab === 'stats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Comprado Histórico</span>
                    <p style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      RD$ {Number(customer360.kpis?.total_purchased_history || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Compras del Año Actual</span>
                    <p style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8' }}>
                      RD$ {Number(customer360.kpis?.purchases_year || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Saldo Deudor Actual</span>
                    <p style={{ fontSize: '1.3rem', fontWeight: 800, color: customer360.kpis?.pending_balance > 0 ? '#f59e0b' : 'var(--success)' }}>
                      RD$ {Number(customer360.kpis?.pending_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Monthly history */}
                <div className="card" style={{ padding: '16px' }}>
                  <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>
                    Historial de Compras por Mes
                  </h5>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '120px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    {customer360.monthly_behavior?.map((m, idx) => (
                      <div key={idx} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '4px' }}>
                        <div style={{ width: '100%', height: '60%', background: '#3b82f6', borderRadius: '4px 4px 0 0' }} />
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{m.month.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 7. Notas y Seguimientos de Cobranza */}
            {active360Tab === 'notes' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Form to add note */}
                <form onSubmit={handleAddCollectionNote} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg-subtle)', padding: '14px', borderRadius: '10px' }}>
                  <label className="label-control">Nueva Nota de Cobranza / Promesa de Pago</label>
                  <textarea
                    required
                    rows="2"
                    className="input-control"
                    placeholder="Ej: Cliente promete abonar RD$ 25,000 mediante transferencia el próximo viernes..."
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fecha Compromiso:</span>
                      <input
                        type="date"
                        className="input-control"
                        value={newPromiseDate}
                        onChange={(e) => setNewPromiseDate(e.target.value)}
                        style={{ height: '32px', width: '150px', fontSize: '0.78rem' }}
                      />
                    </div>
                    <button type="submit" disabled={addingNote} className="btn btn-primary btn-sm">
                      <Send size={14} />
                      <span>{addingNote ? 'Guardando...' : 'Registrar Nota'}</span>
                    </button>
                  </div>
                </form>

                {/* Notes Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {customer360.collection_notes?.map(cn => (
                    <div key={cn.id} style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: '8px', borderLeft: '3px solid #3b82f6' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        <span>{cn.user_name || 'Agente de Cobros'}</span>
                        <span>{new Date(cn.created_at).toLocaleString('es-DO')}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>{cn.note}</p>
                      {cn.promised_payment_date && (
                        <span className="badge badge-warning" style={{ fontSize: '0.68rem', marginTop: '6px' }}>
                          Promesa de Pago: {cn.promised_payment_date}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 8. Ubicación Geográfica */}
            {active360Tab === 'geo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ padding: '14px', background: 'var(--bg-subtle)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Coordenadas GPS</span>
                    <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                      Latitud: {customer360.customer.latitude || '18.4861'} • Longitud: {customer360.customer.longitude || '-69.9312'}
                    </p>
                  </div>
                  <span className="badge badge-success">GPS Verificado</span>
                </div>
                <div style={{ height: '220px', background: 'var(--bg-main)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-color)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <MapPin size={32} color="#10b981" style={{ margin: '0 auto 6px' }} />
                    <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {customer360.customer.company_name}
                    </p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {customer360.customer.address || 'Santo Domingo'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 9. Estado de Cuenta */}
            {active360Tab === 'statement' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Resumen de Balance y Cartera</span>
                  <button onClick={() => window.print()} className="btn btn-secondary btn-sm">
                    Imprimir Estado
                  </button>
                </div>
                <div className="table-container">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Emisión</th>
                        <th>Vencimiento</th>
                        <th>Total</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer360.receivables?.map(r => (
                        <tr key={r.id}>
                          <td>{r.invoice_number || r.ncf}</td>
                          <td>{r.issue_date}</td>
                          <td>{r.due_date}</td>
                          <td>RD$ {Number(r.amount).toFixed(2)}</td>
                          <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(r.balance).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
