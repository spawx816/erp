import React, { useState, useEffect } from 'react';
import {
  CalendarDays, Plus, DollarSign, CheckCircle2,
  AlertTriangle, Clock, Calendar, Check,
  CreditCard, User, Tag, ArrowRight, X
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function RecurringExpensesPage() {
  const { addToast } = useToast();
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  // Pay Modal State
  const [payModalItem, setPayModalItem] = useState(null);
  const [payForm, setPayForm] = useState({
    payment_method: 'transfer',
    voucher_number: '',
    notes: ''
  });
  const [paying, setPaying] = useState(false);

  // New Expense Modal State
  const [showNewModal, setShowNewModal] = useState(false);
  const [newForm, setNewForm] = useState({
    concept: '',
    estimated_amount: '',
    frequency: 'monthly',
    due_day: '15',
    next_due_date: new Date().toISOString().split('T')[0],
    responsible_person: '',
    category_id: '',
    alert_days_before: '7'
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recRes, catRes] = await Promise.all([
        api.get('/finance/recurring-expenses'),
        api.get('/finance/expense-categories')
      ]);

      if (recRes.success) setExpenses(recRes.data);
      if (catRes.success) setCategories(catRes.data);
    } catch (err) {
      console.error('Failed to load recurring expenses:', err);
      addToast('Error al cargar pagos fijos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPay = (item) => {
    setPayModalItem(item);
    setPayForm({
      payment_method: 'transfer',
      voucher_number: '',
      notes: `Pago cuota: ${item.concept}`
    });
  };

  const handleConfirmPay = async (e) => {
    e.preventDefault();
    if (!payModalItem) return;
    setPaying(true);
    try {
      const res = await api.post(`/finance/recurring-expenses/${payModalItem.id}/pay`, payForm);
      if (res.success) {
        addToast(`Pago de "${payModalItem.concept}" registrado exitosamente.`, 'success');
        setPayModalItem(null);
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error registrando pago.', 'error');
    } finally {
      setPaying(false);
    }
  };

  const handleCreateRecurring = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/finance/recurring-expenses', newForm);
      if (res.success) {
        addToast('Obligación recurrente agendada exitosamente.', 'success');
        setShowNewModal(false);
        setNewForm({
          concept: '',
          estimated_amount: '',
          frequency: 'monthly',
          due_day: '15',
          next_due_date: new Date().toISOString().split('T')[0],
          responsible_person: '',
          category_id: '',
          alert_days_before: '7'
        });
        loadData();
      }
    } catch (err) {
      addToast(err.message || 'Error creando obligación.', 'error');
    }
  };

  // KPIs
  const totalMonthlyCommitment = expenses.reduce((sum, e) => sum + Number(e.estimated_amount || 0), 0);
  const overdueCount = expenses.filter(e => e.status === 'overdue').length;
  const upcomingCount = expenses.filter(e => e.status === 'upcoming').length;

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
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(245, 158, 11, 0.35)'
          }}>
            <CalendarDays size={28} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Calendario de Pagos Fijos & Obligaciones
              </h2>
              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                Sección 26
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Programación de gastos fijos mensuales (Alquiler, Nómina, Luz, Internet, Seguros, TSS) con alertas automáticas de vencimiento
            </p>
          </div>
        </div>

        <button onClick={() => setShowNewModal(true)} className="btn btn-primary">
          <Plus size={16} />
          <span>Nueva Obligación</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Compromiso Mensual Fijo
          </span>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            RD$ {totalMonthlyCommitment.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {expenses.length} obligaciones recurrentes activas
          </p>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Obligaciones Vencidas
          </span>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: overdueCount > 0 ? 'var(--danger)' : 'var(--success)', marginTop: '4px' }}>
            {overdueCount}
          </h3>
          <p style={{ fontSize: '0.72rem', color: overdueCount > 0 ? 'var(--danger)' : 'var(--success)', marginTop: '2px' }}>
            {overdueCount > 0 ? 'Requiere pago prioritario inmediato' : 'Todo al día sin atrasos'}
          </p>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            Próximos a Vencer (7 días)
          </span>
          <h3 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
            {upcomingCount}
          </h3>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Dentro de la ventana de alerta anticipada
          </p>
        </div>
      </div>

      {/* Main List */}
      <div className="table-container">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Concepto / Obligación</th>
              <th>Categoría</th>
              <th>Frecuencia</th>
              <th>Monto Estimado</th>
              <th>Próximo Vencimiento</th>
              <th>Días Alerta</th>
              <th>Estado</th>
              <th>Último Pago</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px' }}>Cargando pagos fijos...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay obligaciones recurrentes registradas.</td></tr>
            ) : (
              expenses.map(item => {
                const isOverdue = item.status === 'overdue';
                const isUpcoming = item.status === 'upcoming';

                const badgeClass = isOverdue ? 'badge-danger' : isUpcoming ? 'badge-warning' : 'badge-success';
                const badgeText = isOverdue ? 'Vencido' : isUpcoming ? 'Próximo a Vencer' : 'Al Día';

                return (
                  <tr key={item.id} style={{ background: isOverdue ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{item.concept}</div>
                      {item.responsible_person && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          Resp: {item.responsible_person}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--bg-subtle-2)', color: '#94a3b8' }}>
                        {item.category_name || 'General'}
                      </span>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>
                      {item.frequency === 'monthly' ? 'Mensual' : item.frequency === 'biweekly' ? 'Quincenal' : item.frequency} (Día {item.due_day})
                    </td>
                    <td style={{ fontWeight: 800, color: '#60a5fa' }}>
                      RD$ {Number(item.estimated_amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ fontWeight: 700, color: isOverdue ? 'var(--danger)' : isUpcoming ? 'var(--warning)' : '#fff' }}>
                      {item.next_due_date}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {item.alert_days_before || 7} días antes
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>
                        {badgeText}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {item.last_paid_date || 'No registrado'}
                    </td>
                    <td>
                      <button
                        onClick={() => handleOpenPay(item)}
                        className="btn btn-primary btn-sm"
                        style={{ padding: '6px 12px' }}
                      >
                        <Check size={14} />
                        <span>Pagar Cuota</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAY MODAL */}
      {payModalItem && (
        <div className="modal-overlay" onClick={() => setPayModalItem(null)}>
          <div className="modal-content" style={{ maxWidth: '460px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Pagar Obligación Recurrente</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{payModalItem.concept}</p>
              </div>
              <button onClick={() => setPayModalItem(null)} className="btn btn-secondary btn-sm">
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '14px', background: 'var(--bg-main)', borderRadius: '10px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Monto a Liquidar:</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10b981' }}>
                RD$ {Number(payModalItem.estimated_amount).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <form onSubmit={handleConfirmPay} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Método de Pago</label>
                <select
                  className="select-control"
                  value={payForm.payment_method}
                  onChange={(e) => setPayForm({ ...payForm, payment_method: e.target.value })}
                >
                  <option value="transfer">Transferencia Bancaria</option>
                  <option value="cash">Efectivo (Caja Chica)</option>
                  <option value="card">Tarjeta de Crédito Corporativa</option>
                  <option value="check">Cheque</option>
                </select>
              </div>

              <div>
                <label className="label-control">No. Comprobante / Referencia Bancaria</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: TRANS-987213 / CHQ-1044"
                  value={payForm.voucher_number}
                  onChange={(e) => setPayForm({ ...payForm, voucher_number: e.target.value })}
                />
              </div>

              <div>
                <label className="label-control">Notas u Observaciones</label>
                <input
                  type="text"
                  className="input-control"
                  value={payForm.notes}
                  onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setPayModalItem(null)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={paying} className="btn btn-primary" style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  {paying ? 'Procesando...' : 'Confirmar y Pagar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW RECURRING MODAL */}
      {showNewModal && (
        <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Nueva Obligación Recurrente</h3>
            <form onSubmit={handleCreateRecurring} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Concepto / Obligación *</label>
                <input
                  type="text"
                  required
                  className="input-control"
                  placeholder="Ej: Alquiler Local Principal"
                  value={newForm.concept}
                  onChange={(e) => setNewForm({ ...newForm, concept: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Monto Estimado (RD$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="input-control"
                    placeholder="25000.00"
                    value={newForm.estimated_amount}
                    onChange={(e) => setNewForm({ ...newForm, estimated_amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Categoría</label>
                  <select
                    className="select-control"
                    value={newForm.category_id}
                    onChange={(e) => setNewForm({ ...newForm, category_id: e.target.value })}
                  >
                    <option value="">Seleccionar...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Día de Pago (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    className="input-control"
                    value={newForm.due_day}
                    onChange={(e) => setNewForm({ ...newForm, due_day: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Próxima Fecha de Vencimiento *</label>
                  <input
                    type="date"
                    required
                    className="input-control"
                    value={newForm.next_due_date}
                    onChange={(e) => setNewForm({ ...newForm, next_due_date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Persona / Proveedor Responsable</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ej: Propietario / Edeeste"
                    value={newForm.responsible_person}
                    onChange={(e) => setNewForm({ ...newForm, responsible_person: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Días de Anticipación Alerta</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    className="input-control"
                    value={newForm.alert_days_before}
                    onChange={(e) => setNewForm({ ...newForm, alert_days_before: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowNewModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Guardar Obligación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
