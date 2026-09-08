import React, { useState, useEffect } from 'react';
import {
  DollarSign, Clock, Users, ArrowUpRight, ArrowDownLeft,
  Plus, Calendar, CheckCircle2, AlertCircle, X, Receipt,
  HandCoins, History, CalendarClock, CreditCard, ChevronRight,
  Printer, ArrowRight, Check, AlertTriangle, ShieldAlert
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function FinancePage({ activeBranch, initialTab = 'cxc' }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab); // 'cxc' | 'aging' | 'cxp' | 'expenses'

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [receivables, setReceivables] = useState([]);
  const [agingData, setAgingData] = useState(null);
  const [payables, setPayables] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Multi-invoice payment modal (Section #13)
  const [showMultiPayModal, setShowMultiPayModal] = useState(false);
  const [selectedCustomerForPay, setSelectedCustomerForPay] = useState(null);
  const [customerInvoices, setCustomerInvoices] = useState([]);
  const [paymentTotalAmount, setPaymentTotalAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [paymentRef, setPaymentRef] = useState('');
  const [allocations, setAllocations] = useState({}); // { [receivable_id]: amount }
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Drilldown modal for aging table
  const [drilldownCustomer, setDrilldownCustomer] = useState(null);

  // Expense Modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseData, setExpenseData] = useState({
    category_id: '',
    amount: '',
    payment_method: 'cash',
    beneficiary: '',
    voucher_number: '',
    notes: ''
  });

  // Receipt Modal
  const [completedPaymentReceipt, setCompletedPaymentReceipt] = useState(null);

  useEffect(() => {
    loadData();
  }, [activeTab, activeBranch]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'cxc') {
        const res = await api.get('/finance/receivables');
        if (res.success) setReceivables(res.data);
      } else if (activeTab === 'aging') {
        const res = await api.get('/finance/receivables/aging-table');
        if (res.success) setAgingData(res.data);
      } else if (activeTab === 'cxp') {
        const res = await api.get('/finance/payables');
        if (res.success) setPayables(res.data);
      } else if (activeTab === 'expenses') {
        const [expRes, catRes] = await Promise.all([
          api.get('/finance/expenses'),
          api.get('/finance/expense-categories')
        ]);
        if (expRes.success) setExpenses(expRes.data);
        if (catRes.success) setExpenseCategories(catRes.data);
      }

      const custRes = await api.get('/third-parties/customers');
      if (custRes.success) setCustomers(custRes.data);
    } catch (err) {
      console.error(err);
      addToast('Error al cargar datos financieros.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenMultiPay = async (customer = null) => {
    setSelectedCustomerForPay(customer);
    setPaymentTotalAmount('');
    setAllocations({});
    setCustomerInvoices([]);
    setShowMultiPayModal(true);

    if (customer && customer.id) {
      loadCustomerInvoices(customer.id);
    }
  };

  const loadCustomerInvoices = async (customerId) => {
    try {
      const res = await api.get(`/third-parties/customers/${customerId}/360`);
      if (res.success) {
        const openRecs = res.data.receivables?.filter(r => r.status !== 'paid' && Number(r.balance) > 0) || [];
        setCustomerInvoices(openRecs);
      }
    } catch (err) {
      addToast('Error al cargar facturas pendientes del cliente.', 'error');
    }
  };

  // Automatic FIFO distribution across invoices
  const handleAutoDistributeFIFO = () => {
    const total = parseFloat(paymentTotalAmount || 0);
    if (total <= 0) return;

    let remaining = total;
    const newAlloc = {};

    // Sort invoices oldest first
    const sorted = [...customerInvoices].sort((a, b) => new Date(a.issue_date) - new Date(b.issue_date));

    sorted.forEach(inv => {
      if (remaining <= 0) return;
      const bal = Number(inv.balance);
      const apply = Math.min(remaining, bal);
      newAlloc[inv.id] = apply;
      remaining -= apply;
    });

    setAllocations(newAlloc);
    addToast(`Monto de RD$ ${total.toFixed(2)} distribuido automáticamente en ${Object.keys(newAlloc).length} facturas (FIFO).`, 'info');
  };

  const handleManualAllocationChange = (invId, val) => {
    const amt = parseFloat(val) || 0;
    const updated = { ...allocations, [invId]: amt };
    setAllocations(updated);

    // Update total
    const newTotal = Object.values(updated).reduce((sum, v) => sum + Number(v || 0), 0);
    setPaymentTotalAmount(newTotal > 0 ? String(newTotal) : '');
  };

  const handleSubmitMultiPay = async (e) => {
    e.preventDefault();
    const total = parseFloat(paymentTotalAmount || 0);
    if (!selectedCustomerForPay || total <= 0) {
      addToast('Ingresa un monto de cobro válido.', 'warning');
      return;
    }

    setSubmittingPayment(true);
    try {
      const allocArray = Object.entries(allocations)
        .filter(([_, amt]) => Number(amt) > 0)
        .map(([recId, amt]) => ({
          receivable_id: parseInt(recId, 10),
          amount_applied: Number(amt)
        }));

      const res = await api.post('/finance/receivables/pay', {
        customer_id: selectedCustomerForPay.id,
        total_amount: total,
        payment_method: paymentMethod,
        reference_number: paymentRef,
        allocations: allocArray.length > 0 ? allocArray : undefined
      });

      if (res.success) {
        addToast('Cobro registrado exitosamente.', 'success');
        setCompletedPaymentReceipt({
          receipt_number: `RC-${Date.now().toString().slice(-6)}`,
          customer_name: selectedCustomerForPay.company_name || `${selectedCustomerForPay.first_name} ${selectedCustomerForPay.last_name}`,
          amount: total,
          payment_method: paymentMethod,
          date: new Date().toLocaleDateString('es-DO'),
          applied_count: allocArray.length || customerInvoices.length
        });

        setShowMultiPayModal(false);
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error registrando cobro.', 'error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/finance/expenses', expenseData);
      if (res.success) {
        addToast('Gasto registrado exitosamente.', 'success');
        setShowExpenseModal(false);
        setExpenseData({
          category_id: '',
          amount: '',
          payment_method: 'cash',
          beneficiary: '',
          voucher_number: '',
          notes: ''
        });
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error registrando gasto.', 'error');
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
            background: 'linear-gradient(135deg, #10b981, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)'
          }}>
            <DollarSign size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Cobros & Finanzas Corporativas
              </h2>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}>
                Sección 13 & 14
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Distribución de pagos multi-factura, tabla de antigüedad (0-30 a +120 días), cuentas por pagar y control de egresos
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleOpenMultiPay(null)}
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            <HandCoins size={16} />
            <span>Registrar Cobro Multi-Factura</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('cxc')}
          className={`btn btn-sm ${activeTab === 'cxc' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Clock size={15} />
          <span>Cuentas por Cobrar (Facturas)</span>
        </button>
        <button
          onClick={() => setActiveTab('aging')}
          className={`btn btn-sm ${activeTab === 'aging' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <AlertCircle size={15} />
          <span>Antigüedad de Saldos (Semáforo 0-120+)</span>
        </button>
        <button
          onClick={() => setActiveTab('cxp')}
          className={`btn btn-sm ${activeTab === 'cxp' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <CreditCard size={15} />
          <span>Cuentas por Pagar (CxP Proveedores)</span>
        </button>
        <button
          onClick={() => setActiveTab('expenses')}
          className={`btn btn-sm ${activeTab === 'expenses' ? 'btn-primary' : 'btn-secondary'}`}
        >
          <Receipt size={15} />
          <span>Control de Gastos Operativos</span>
        </button>
      </div>

      {/* TAB 1: CXC FACTURAS */}
      {activeTab === 'cxc' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Factura / NCF</th>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Fecha Emisión</th>
                  <th>Vencimiento</th>
                  <th>Monto Total</th>
                  <th>Balance Deudor</th>
                  <th>Días Atraso</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando cuentas por cobrar...</td></tr>
                ) : receivables.length === 0 ? (
                  <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay facturas con saldo pendiente.</td></tr>
                ) : (
                  receivables.map(r => {
                    const isOverdue = Number(r.days_overdue) > 0;
                    return (
                      <tr key={r.id} style={{ background: isOverdue ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{r.invoice_number || `FAC-${r.sale_id}`}</span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{r.ncf}</span>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.customer_name}</td>
                        <td style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{r.salesperson_name || 'Carlos Mendoza'}</td>
                        <td>{r.issue_date}</td>
                        <td style={{ color: isOverdue ? 'var(--danger)' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>{r.due_date}</td>
                        <td>RD$ {Number(r.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</td>
                        <td style={{ fontWeight: 800, color: '#38bdf8' }}>
                          RD$ {Number(r.balance).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </td>
                        <td>
                          <span className={`badge ${isOverdue ? 'badge-danger' : 'badge-success'}`}>
                            {isOverdue ? `${r.days_overdue} días mora` : 'Al día'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => {
                              const foundCust = customers.find(c => c.id === r.customer_id);
                              if (foundCust) handleOpenMultiPay(foundCust);
                            }}
                            className="btn btn-primary btn-sm"
                          >
                            <HandCoins size={14} />
                            <span>Cobrar</span>
                          </button>
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

      {/* TAB 2: ANTIGÜEDAD DE SALDOS AGRUPADA (SECTION #14) */}
      {activeTab === 'aging' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Top Semaphores Totals Bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
            <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Cartera</span>
              <p style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.grand_total || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981' }}>0-30 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_0_30 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(59, 130, 246, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>31-60 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_31_60 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b' }}>61-90 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_61_90 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(234, 88, 12, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ea580c', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c' }}>91-120 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ea580c', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_91_120 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
            <div className="card" style={{ padding: '14px', textAlign: 'center', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', margin: '0 auto 4px' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>+120 Días</span>
              <p style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                RD$ {((agingData?.totals?.days_over_120 || 0) / 1000).toFixed(1)}k
              </p>
            </div>
          </div>

          {/* Grouped Table */}
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>0-30 Días</th>
                  <th>31-60 Días</th>
                  <th>61-90 Días</th>
                  <th>91-120 Días</th>
                  <th>+120 Días</th>
                  <th>Total Deuda</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                      Cargando matriz de antigüedad de saldos...
                    </td>
                  </tr>
                ) : (!agingData?.customers?.length && !agingData?.rows?.length) ? (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No hay clientes con saldos o cuentas por cobrar pendientes.
                    </td>
                  </tr>
                ) : (
                  (agingData?.customers || agingData?.rows || []).map(c => (
                    <tr key={c.customer_id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.customer_name}</div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{c.code}</span>
                      </td>
                      <td style={{ color: '#60a5fa', fontSize: '0.8rem' }}>{c.salesperson_name}</td>
                      <td style={{ color: c.days_0_30 > 0 ? '#10b981' : 'var(--text-muted)', fontWeight: c.days_0_30 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_0_30).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_31_60 > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: c.days_31_60 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_31_60).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_61_90 > 0 ? '#f59e0b' : 'var(--text-muted)', fontWeight: c.days_61_90 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_61_90).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_91_120 > 0 ? '#ea580c' : 'var(--text-muted)', fontWeight: c.days_91_120 > 0 ? 600 : 400 }}>
                        RD$ {Number(c.days_91_120).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ color: c.days_over_120 > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: c.days_over_120 > 0 ? 800 : 400 }}>
                        RD$ {Number(c.days_over_120).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ fontWeight: 900, color: '#38bdf8' }}>
                        RD$ {Number(c.total).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </td>
                      <td>
                        <button
                          onClick={() => setDrilldownCustomer(c)}
                          className="btn btn-secondary btn-sm"
                        >
                          Ver {c.invoices?.length || 0} Facturas
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CXP PROVEEDORES */}
      {activeTab === 'cxp' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>No. Factura Proveedor</th>
                <th>Proveedor</th>
                <th>Fecha Factura</th>
                <th>Vencimiento</th>
                <th>Total Facturado</th>
                <th>Saldo Pendiente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>Cargando cuentas por pagar...</td></tr>
              ) : payables.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay facturas de compras pendientes.</td></tr>
              ) : (
                payables.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{p.invoice_number || `COMP-${p.purchase_id}`}</td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.supplier_name}</td>
                    <td>{p.issue_date}</td>
                    <td>{p.due_date}</td>
                    <td>RD$ {Number(p.amount).toFixed(2)}</td>
                    <td style={{ fontWeight: 800, color: '#f59e0b' }}>RD$ {Number(p.balance).toFixed(2)}</td>
                    <td>
                      <span className={`badge ${p.status === 'paid' ? 'badge-success' : 'badge-warning'}`}>{p.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: GASTOS */}
      {activeTab === 'expenses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowExpenseModal(true)} className="btn btn-primary">
              <Plus size={16} />
              <span>Registrar Gasto</span>
            </button>
          </div>

          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Beneficiario</th>
                  <th>Monto</th>
                  <th>Método</th>
                  <th>Comprobante</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px' }}>Cargando gastos...</td></tr>
                ) : expenses.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay gastos registrados.</td></tr>
                ) : (
                  expenses.map(e => (
                    <tr key={e.id}>
                      <td>{e.expense_date}</td>
                      <td>
                        <span className="badge" style={{ background: 'var(--bg-subtle-2)', color: '#94a3b8' }}>
                          {e.category_name}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.beneficiary || '-'}</td>
                      <td style={{ fontWeight: 800, color: '#f59e0b' }}>RD$ {Number(e.amount).toFixed(2)}</td>
                      <td style={{ textTransform: 'capitalize' }}>{e.payment_method}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{e.voucher_number || '-'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{e.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MULTI-INVOICE PAYMENT MODAL (SECTION #13) */}
      {showMultiPayModal && (
        <div className="modal-overlay" onClick={() => setShowMultiPayModal(false)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Cobro & Distribución Multi-Factura
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {selectedCustomerForPay ? (
                    <>Cliente seleccionado: <strong style={{ color: '#10b981' }}>{selectedCustomerForPay.company_name || `${selectedCustomerForPay.first_name} ${selectedCustomerForPay.last_name}`}</strong></>
                  ) : (
                    'Selecciona un cliente para cargar y distribuir pagos entre sus facturas pendientes.'
                  )}
                </p>
              </div>
              <button onClick={() => setShowMultiPayModal(false)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitMultiPay} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Customer Selector */}
              <div style={{ background: 'var(--bg-subtle-2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <label className="label-control" style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Seleccionar Cliente a Cobrar *</span>
                  {selectedCustomerForPay && (
                    <span style={{ color: '#38bdf8' }}>
                      Balance Pendiente: RD$ {Number(selectedCustomerForPay.current_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </label>
                <select
                  className="select-control"
                  value={selectedCustomerForPay ? selectedCustomerForPay.id : ''}
                  onChange={(e) => {
                    const custId = e.target.value;
                    const cust = customers.find(c => String(c.id) === String(custId));
                    setSelectedCustomerForPay(cust || null);
                    setAllocations({});
                    if (cust) {
                      loadCustomerInvoices(cust.id);
                    } else {
                      setCustomerInvoices([]);
                    }
                  }}
                  style={{ height: '42px', fontWeight: 600 }}
                  required
                >
                  <option value="">-- Selecciona un Cliente con Deuda --</option>
                  {customers.map(c => {
                    const name = c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.identification_number;
                    const bal = Number(c.current_balance || 0);
                    return (
                      <option key={c.id} value={c.id}>
                        {name} ({c.identification_number || 'S/N'}) {bal > 0 ? `— Deuda: RD$ ${bal.toFixed(2)}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Payment Info Header */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'var(--bg-subtle)', padding: '16px', borderRadius: '12px' }}>
                <div>
                  <label className="label-control">Monto Total a Cobrar (RD$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-control"
                    placeholder="0.00"
                    value={paymentTotalAmount}
                    onChange={(e) => setPaymentTotalAmount(e.target.value)}
                    style={{ fontSize: '1.2rem', fontWeight: 800 }}
                  />
                </div>

                <div>
                  <label className="label-control">Método de Pago</label>
                  <select
                    className="select-control"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    style={{ height: '42px' }}
                  >
                    <option value="transfer">Transferencia Bancaria</option>
                    <option value="cash">Efectivo (Caja)</option>
                    <option value="check">Cheque</option>
                    <option value="card">Tarjeta de Crédito</option>
                  </select>
                </div>

                <div>
                  <label className="label-control">No. Referencia / Comprobante</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ej: TRANS-19283"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    style={{ height: '42px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    disabled={!selectedCustomerForPay || customerInvoices.length === 0}
                    onClick={handleAutoDistributeFIFO}
                    className="btn btn-secondary"
                    style={{ height: '42px', width: '100%', justifyContent: 'center' }}
                  >
                    <ArrowRight size={14} />
                    <span>Distribuir FIFO Automático</span>
                  </button>
                </div>
              </div>

              {/* Invoices List to Allocate */}
              <div>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Facturas Pendientes de Cobro ({customerInvoices.length})
                </h4>
                <div className="table-container" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Factura</th>
                        <th>Emisión</th>
                        <th>Vencimiento</th>
                        <th>Total</th>
                        <th>Saldo Pendiente</th>
                        <th style={{ width: '180px' }}>Monto a Aplicar (RD$)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!selectedCustomerForPay ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Selecciona un cliente arriba para ver sus facturas pendientes.</td></tr>
                      ) : customerInvoices.length === 0 ? (
                        <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>El cliente no tiene facturas pendientes de cobro.</td></tr>
                      ) : (
                        customerInvoices.map(inv => (
                          <tr key={inv.id}>
                            <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number || inv.sale_number}</td>
                            <td>{inv.issue_date}</td>
                            <td>{inv.due_date}</td>
                            <td>RD$ {Number(inv.amount).toFixed(2)}</td>
                            <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(inv.balance).toFixed(2)}</td>
                            <td>
                              <input
                                type="number"
                                step="0.01"
                                max={inv.balance}
                                placeholder="0.00"
                                className="input-control"
                                value={allocations[inv.id] || ''}
                                onChange={(e) => handleManualAllocationChange(inv.id, e.target.value)}
                                style={{ height: '32px', textAlign: 'right', fontWeight: 700 }}
                              />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '14px' }}>
                <button type="button" onClick={() => setShowMultiPayModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment || !selectedCustomerForPay || customerInvoices.length === 0}
                  className="btn btn-primary"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '8px 24px' }}
                >
                  {submittingPayment ? 'Procesando...' : 'Confirmar Cobro & Generar Recibo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DRILLDOWN MODAL FOR AGING TABLE */}
      {drilldownCustomer && (
        <div className="modal-overlay" onClick={() => setDrilldownCustomer(null)}>
          <div className="modal-content modal-content-xl" style={{ padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Detalle de Facturas: {drilldownCustomer.customer_name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Vendedor: {drilldownCustomer.salesperson_name} • Balance Total: RD$ {Number(drilldownCustomer.total).toFixed(2)}
                </p>
              </div>
              <button onClick={() => setDrilldownCustomer(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Factura</th>
                    <th>NCF</th>
                    <th>Emisión</th>
                    <th>Vencimiento</th>
                    <th>Monto Total</th>
                    <th>Balance Pendiente</th>
                    <th>Días Atraso</th>
                    <th>Tramo de Antigüedad</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownCustomer.invoices?.map(inv => (
                    <tr key={inv.receivable_id}>
                      <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{inv.invoice_number}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{inv.ncf}</td>
                      <td>{inv.issue_date}</td>
                      <td>{inv.due_date}</td>
                      <td>RD$ {Number(inv.amount).toFixed(2)}</td>
                      <td style={{ fontWeight: 800, color: '#38bdf8' }}>RD$ {Number(inv.balance).toFixed(2)}</td>
                      <td>{inv.days_overdue} días</td>
                      <td>
                        <span className="badge badge-warning">{inv.bracket} Días</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button onClick={() => setDrilldownCustomer(null)} className="btn btn-secondary">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT RECEIPT MODAL */}
      {completedPaymentReceipt && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '460px', padding: '24px' }}>
            <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <CheckCircle2 size={26} color="var(--success)" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Recibo Oficial de Cobro</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                No. <strong style={{ color: 'var(--text-primary)' }}>{completedPaymentReceipt.receipt_number}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Cliente:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{completedPaymentReceipt.customer_name}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Fecha:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{completedPaymentReceipt.date}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Método:</span>
                <span style={{ textTransform: 'capitalize', color: '#60a5fa' }}>{completedPaymentReceipt.payment_method}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Total Cobrado:</span>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--success)' }}>
                  RD$ {Number(completedPaymentReceipt.amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => window.print()} className="btn btn-secondary" style={{ flex: 1 }}>
                <Printer size={16} />
                <span>Imprimir</span>
              </button>
              <button onClick={() => setCompletedPaymentReceipt(null)} className="btn btn-primary" style={{ flex: 1 }}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Registrar Gasto</h3>
            <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label-control">Categoría de Gasto *</label>
                <select
                  required
                  className="select-control"
                  value={expenseData.category_id}
                  onChange={(e) => setExpenseData({ ...expenseData, category_id: e.target.value })}
                >
                  <option value="">Seleccionar Categoría...</option>
                  {expenseCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-control">Monto (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-control"
                  placeholder="0.00"
                  value={expenseData.amount}
                  onChange={(e) => setExpenseData({ ...expenseData, amount: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Método de Pago</label>
                  <select
                    className="select-control"
                    value={expenseData.payment_method}
                    onChange={(e) => setExpenseData({ ...expenseData, payment_method: e.target.value })}
                  >
                    <option value="cash">Efectivo (Caja Chica)</option>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="label-control">Beneficiario</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Proveedor / Empleado"
                    value={expenseData.beneficiary}
                    onChange={(e) => setExpenseData({ ...expenseData, beneficiary: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">No. Comprobante / Factura</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="B11-..."
                  value={expenseData.voucher_number}
                  onChange={(e) => setExpenseData({ ...expenseData, voucher_number: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowExpenseModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
