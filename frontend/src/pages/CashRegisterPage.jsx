import React, { useState, useEffect } from 'react';
import {
  Wallet, DollarSign, ArrowDownLeft, ArrowUpRight,
  Lock, Unlock, AlertCircle, History, CheckCircle, X, ArrowRightLeft
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function CashRegisterPage({ user, activeBranch, activeSession, onRefreshUser }) {
  const toast = useToast();
  const [registers, setRegisters] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);

  // Open Form
  const [openData, setOpenData] = useState({
    cash_register_id: '',
    initial_cash: '5000'
  });

  // Movement Form
  const [movementData, setMovementData] = useState({
    type: 'deposit', // 'deposit' | 'withdrawal' | 'expense'
    amount: '',
    reason: ''
  });

  // Close Form
  const [closeData, setCloseData] = useState({
    counted_cash: '',
    total_card: '0',
    total_transfer: '0',
    close_notes: ''
  });

  useEffect(() => {
    loadData();
  }, [activeBranch]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [regRes, histRes, sessRes] = await Promise.all([
        api.get('/cash/registers', { branch_id: activeBranch?.id }),
        api.get('/cash/sessions-history', { branch_id: activeBranch?.id }),
        api.get('/cash/active-session')
      ]);

      if (regRes.success) setRegisters(regRes.data);
      if (histRes.success) setSessionHistory(histRes.data);
      if (sessRes.success && sessRes.has_open_session) {
        setSessionDetail(sessRes.session);
        setCloseData({
          counted_cash: String(sessRes.session.current_cash || ''),
          total_card: '0',
          total_transfer: '0',
          close_notes: ''
        });
      } else {
        setSessionDetail(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/cash/open', openData);
      if (res.success) {
        toast.success('Caja aperturada exitosamente.');
        setShowOpenModal(false);
        loadData();
        if (onRefreshUser) onRefreshUser();
      }
    } catch (err) {
      toast.error(err.message || 'Error abriendo caja.');
    }
  };

  const handleMovementSubmit = async (e) => {
    e.preventDefault();
    if (!sessionDetail) return;
    try {
      const res = await api.post('/cash/movement', {
        session_id: sessionDetail.id,
        ...movementData
      });
      if (res.success) {
        toast.success('Movimiento de caja registrado exitosamente.');
        setShowMovementModal(false);
        setMovementData({ type: 'deposit', amount: '', reason: '' });
        loadData();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCloseSubmit = async (e) => {
    e.preventDefault();
    if (!sessionDetail) return;
    try {
      const res = await api.post('/cash/close', {
        session_id: sessionDetail.id,
        ...closeData
      });
      if (res.success) {
        toast.success(`Caja cerrada exitosamente. Descuadre: RD$ ${Number(res.summary?.cash_difference || 0).toFixed(2)}`);
        setShowCloseModal(false);
        loadData();
        if (onRefreshUser) onRefreshUser();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Control de Caja & Arqueo de Turnos</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Aperturas, cierres, control de diferencias y movimientos de efectivo</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {!sessionDetail ? (
            <button
              onClick={() => {
                setOpenData({ cash_register_id: registers[0]?.id || '', initial_cash: '5000' });
                setShowOpenModal(true);
              }}
              className="btn btn-primary"
            >
              <Unlock size={16} />
              <span>Abrir Turno de Caja</span>
            </button>
          ) : (
            <>
              <button onClick={() => setShowMovementModal(true)} className="btn btn-secondary">
                <ArrowRightLeft size={16} />
                <span>Movimiento de Caja</span>
              </button>
              <button onClick={() => setShowCloseModal(true)} className="btn btn-danger">
                <Lock size={16} />
                <span>Cerrar Turno (Arqueo)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ACTIVE SESSION CARD */}
      {sessionDetail ? (
        <div className="card" style={{ background: 'var(--bg-banner)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ padding: '8px', background: 'rgba(16, 185, 129, 0.2)', borderRadius: '8px' }}>
                <Wallet size={20} color="var(--success)" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {sessionDetail.register_name} ({sessionDetail.register_code})
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Aperturado: {new Date(sessionDetail.opened_at).toLocaleString('es-DO')} • Cajero: <strong>{sessionDetail.cashier_name}</strong>
                </p>
              </div>
            </div>
            <span className="badge badge-success" style={{ fontSize: '0.8rem', padding: '4px 10px' }}>
              Turno Activo
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Fondo Inicial</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                RD$ {Number(sessionDetail.initial_cash).toFixed(2)}
              </p>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Efectivo Actual en Caja</p>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#38bdf8', marginTop: '4px' }}>
                RD$ {Number(sessionDetail.current_cash || sessionDetail.initial_cash).toFixed(2)}
              </p>
            </div>

            <div style={{ padding: '12px', background: 'var(--bg-subtle)', borderRadius: '10px' }}>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Movimientos en Turno</p>
              <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                {sessionDetail.movements?.length || 0} operaciones
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: '24px', textAlign: 'center', border: '1px dashed #334155' }}>
          <AlertCircle size={32} color="var(--warning)" style={{ margin: '0 auto 8px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>No tienes ninguna sesión de caja abierta</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '400px', margin: '4px auto 16px' }}>
            Para registrar ventas en efectivo en el POS o recibir cobros, debes aperturar un turno con un monto inicial.
          </p>
          <button
            onClick={() => {
              setOpenData({ cash_register_id: registers[0]?.id || '', initial_cash: '5000' });
              setShowOpenModal(true);
            }}
            className="btn btn-primary"
          >
            Abrir Caja Ahora
          </button>
        </div>
      )}

      {/* SESSIONS HISTORY */}
      <div className="card" style={{ padding: '18px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '14px' }}>
          Historial de Cierres & Arqueos de Caja
        </h3>
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Caja</th>
                <th>Cajero</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Inicial</th>
                <th>Esperado</th>
                <th>Contado</th>
                <th>Diferencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sessionHistory.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>No hay cierres registrados.</td></tr>
              ) : (
                sessionHistory.map(s => (
                  <tr key={s.id}>
                    <td>{s.register_name}</td>
                    <td>{s.cashier_name}</td>
                    <td style={{ fontSize: '0.75rem' }}>{new Date(s.opened_at).toLocaleString('es-DO')}</td>
                    <td style={{ fontSize: '0.75rem' }}>{s.closed_at ? new Date(s.closed_at).toLocaleString('es-DO') : 'En curso'}</td>
                    <td>RD$ {Number(s.initial_cash).toFixed(2)}</td>
                    <td>RD$ {Number(s.expected_cash || 0).toFixed(2)}</td>
                    <td>RD$ {Number(s.counted_cash || 0).toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: Number(s.cash_difference) === 0 ? 'var(--success)' : 'var(--danger)' }}>
                      RD$ {Number(s.cash_difference || 0).toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'open' ? 'badge-success' : 'badge-info'}`}>
                        {s.status === 'open' ? 'Abierta' : 'Cerrada'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: APERTURA */}
      {showOpenModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Apertura de Turno de Caja
            </h3>
            <form onSubmit={handleOpenSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Caja Registradora *</label>
                <select
                  required
                  className="select-control"
                  value={openData.cash_register_id}
                  onChange={(e) => setOpenData({ ...openData, cash_register_id: e.target.value })}
                >
                  {registers.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                </select>
              </div>

              <div>
                <label className="label-control">Monto Inicial en Efectivo (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-control"
                  value={openData.initial_cash}
                  onChange={(e) => setOpenData({ ...openData, initial_cash: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowOpenModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Abrir Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MOVIMIENTO DE CAJA */}
      {showMovementModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Registrar Movimiento de Caja
            </h3>
            <form onSubmit={handleMovementSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Tipo de Movimiento</label>
                <select
                  className="select-control"
                  value={movementData.type}
                  onChange={(e) => setMovementData({ ...movementData, type: e.target.value })}
                >
                  <option value="deposit">Ingreso / Depósito Manual (+)</option>
                  <option value="withdrawal">Retiro de Efectivo (-)</option>
                  <option value="expense">Gasto Menor (-)</option>
                </select>
              </div>

              <div>
                <label className="label-control">Monto (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-control"
                  value={movementData.amount}
                  onChange={(e) => setMovementData({ ...movementData, amount: e.target.value })}
                />
              </div>

              <div>
                <label className="label-control">Motivo *</label>
                <textarea
                  required
                  rows="2"
                  className="input-control"
                  placeholder="Justificación del movimiento"
                  value={movementData.reason}
                  onChange={(e) => setMovementData({ ...movementData, reason: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowMovementModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Registrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CIERRE Y ARQUEO */}
      {showCloseModal && sessionDetail && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Arqueo & Cierre de Caja
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Efectivo esperado por el sistema: <strong>RD$ {Number(sessionDetail.current_cash || 0).toFixed(2)}</strong>
            </p>

            <form onSubmit={handleCloseSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Efectivo Contado Físicamente (RD$) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="input-control"
                  style={{ fontSize: '1.2rem', fontWeight: 700 }}
                  value={closeData.counted_cash}
                  onChange={(e) => setCloseData({ ...closeData, counted_cash: e.target.value })}
                />
              </div>

              {/* Difference calculation preview */}
              {closeData.counted_cash && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: Number(closeData.counted_cash) - Number(sessionDetail.current_cash) === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${Number(closeData.counted_cash) - Number(sessionDetail.current_cash) === 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Diferencia:</span>
                  <span style={{
                    fontSize: '1.1rem', fontWeight: 800,
                    color: Number(closeData.counted_cash) - Number(sessionDetail.current_cash) === 0 ? 'var(--success)' : 'var(--danger)'
                  }}>
                    RD$ {(Number(closeData.counted_cash) - Number(sessionDetail.current_cash)).toFixed(2)}
                  </span>
                </div>
              )}

              <div>
                <label className="label-control">Observaciones del Cierre</label>
                <textarea
                  rows="2"
                  className="input-control"
                  placeholder="Obligatorio si existe diferencia o descuadre..."
                  value={closeData.close_notes}
                  onChange={(e) => setCloseData({ ...closeData, close_notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowCloseModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-danger">
                  Confirmar Cierre de Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
