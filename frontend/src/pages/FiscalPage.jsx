import React, { useState, useEffect } from 'react';
import { FileText, Plus, AlertTriangle, CheckCircle2, Shield, X, Building2, Search, ExternalLink } from 'lucide-react';
import api from '../services/api';
import RncLookupModal from '../components/RncLookupModal';

export default function FiscalPage({ activeBranch }) {
  const [sequences, setSequences] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRncModal, setShowRncModal] = useState(false);

  // Quick Inline RNC State
  const [inlineRnc, setInlineRnc] = useState('');
  const [inlineResult, setInlineResult] = useState(null);
  const [loadingRnc, setLoadingRnc] = useState(false);
  const [rncError, setRncError] = useState('');

  // New Sequence Modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    branch_id: '',
    fiscal_type_code: 'B01',
    prefix: 'B01',
    series: 'B',
    current_number: '1',
    final_number: '5000',
    expiration_date: '2027-12-31',
    warning_threshold: '50'
  });

  useEffect(() => {
    loadFiscalData();
  }, [activeBranch]);

  const loadFiscalData = async () => {
    setLoading(true);
    try {
      const [sRes, dtRes] = await Promise.all([
        api.get('/fiscal/sequences', { branch_id: activeBranch?.id }),
        api.get('/fiscal/document-types')
      ]);
      if (sRes.success) setSequences(sRes.data);
      if (dtRes.success) setDocTypes(dtRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLookup = async (e) => {
    e.preventDefault();
    const clean = inlineRnc.replace(/[^0-9]/g, '').trim();
    if (!clean || (clean.length !== 9 && clean.length !== 11)) {
      setRncError('El RNC debe tener 9 dígitos o la Cédula 11 dígitos.');
      return;
    }
    setLoadingRnc(true);
    setRncError('');
    setInlineResult(null);
    try {
      const res = await api.get(`/fiscal/rnc/consulta/${clean}`);
      if (res.success && res.data) {
        setInlineResult(res.data);
      } else {
        setRncError(res.message || 'RNC no registrado en DGII.');
      }
    } catch (err) {
      setRncError(err.message || 'Error consultando DGII.');
    } finally {
      setLoadingRnc(false);
    }
  };

  const handleCreateSequence = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/fiscal/sequences', {
        ...formData,
        branch_id: activeBranch?.id
      });
      if (res.success) {
        alert('Secuencia fiscal configurada exitosamente.');
        setShowModal(false);
        loadFiscalData();
      }
    } catch (err) {
      alert(err.message || 'Error guardando secuencia fiscal.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Comprobantes Fiscales Dominicanos (NCF)</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Administración de series autorizadas por la DGII, control de vencimiento y secuencias automáticas
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowRncModal(true)}
            className="btn btn-secondary"
            style={{ borderColor: 'rgba(59, 130, 246, 0.4)', color: '#60a5fa', gap: '6px' }}
          >
            <Building2 size={16} />
            <span>Consultar RNC / Cédula</span>
          </button>

          <button
            onClick={() => {
              setFormData({
                branch_id: activeBranch?.id || '',
                fiscal_type_code: 'B01',
                prefix: 'B01',
                series: 'B',
                current_number: '1',
                final_number: '5000',
                expiration_date: '2027-12-31',
                warning_threshold: '50'
              });
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus size={16} />
            <span>Configurar Serie NCF</span>
          </button>
        </div>
      </div>

      {/* RNC DGII Consultation Card */}
      <div style={{
        background: 'var(--bg-banner)',
        borderRadius: '14px',
        border: '1px solid rgba(59, 130, 246, 0.3)',
        padding: '18px 22px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Building2 size={20} color="#60a5fa" />
            <h4 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Consulta RNC / Cédula DGII en Vivo
            </h4>
            <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.68rem', fontWeight: 700 }}>
              API Megaplus Conectada
            </span>
          </div>

          <a
            href="https://rnc.megaplus.com.do/apidocs/"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.74rem', color: '#60a5fa', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <span>Documentación API</span>
            <ExternalLink size={12} />
          </a>
        </div>

        <form onSubmit={handleQuickLookup} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <input
              type="text"
              className="input-control"
              placeholder="Ingrese RNC (9 dígitos) o Cédula (11 dígitos)... ej: 101010632"
              value={inlineRnc}
              onChange={(e) => { setInlineRnc(e.target.value); setRncError(''); }}
              style={{ height: '40px', fontWeight: 600 }}
            />
            {rncError && (
              <p style={{ fontSize: '0.72rem', color: '#ef4444', marginTop: '4px' }}>{rncError}</p>
            )}
          </div>
          <button type="submit" disabled={loadingRnc} className="btn btn-primary" style={{ height: '40px', padding: '0 18px', gap: '6px' }}>
            <Search size={15} />
            <span>{loadingRnc ? 'Consultando...' : 'Consultar DGII'}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowRncModal(true)}
            className="btn btn-secondary"
            style={{ height: '40px' }}
          >
            Búsqueda Avanzada
          </button>
        </form>

        {/* Inline Result */}
        {inlineResult && (
          <div style={{ marginTop: '14px', padding: '14px', background: 'var(--bg-header)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '0.8rem' }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Razón Social:</span>
              <p style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.92rem' }}>{inlineResult.legal_name || inlineResult.commercial_name}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RNC Formateado:</span>
              <p style={{ fontWeight: 700, color: '#60a5fa', fontFamily: 'var(--font-mono)' }}>{inlineResult.formatted_rnc}</p>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Estado DGII:</span>
              <span className={`badge ${inlineResult.status === 'ACTIVO' ? 'badge-success' : 'badge-danger'}`} style={{ display: 'inline-block', marginTop: '2px' }}>
                {inlineResult.status}
              </span>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Facturador Electrónico:</span>
              <p style={{ fontWeight: 700, color: inlineResult.electronic_billing === 'SI' ? '#10b981' : '#f59e0b' }}>
                {inlineResult.electronic_billing === 'SI' ? '✅ Habilitado (e-CF)' : '❌ No Habilitado'}
              </p>
            </div>
            {inlineResult.economic_activity && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Actividad:</span>
                <p style={{ color: 'var(--text-secondary)' }}>{inlineResult.economic_activity}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DGII Compliance Banner */}
      <div style={{ padding: '16px 20px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', alignItems: 'center', gap: '14px' }}>
        <Shield size={28} color="var(--accent-primary)" />
        <div>
          <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>Reglas de Cumplimiento DGII Integradas</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Las secuencias numéricas son consumidas atómicamente en cada facturación. Nunca se reutilizan números ya registrados. Se genera alerta automática antes de agotar la serie.
          </p>
        </div>
      </div>

      {/* Sequences Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {sequences.map(seq => {
          const used = Number(seq.current_number) - 1;
          const total = Number(seq.final_number);
          const percentUsed = Math.min(100, (used / total) * 100);
          const isNearDepletion = total - used <= Number(seq.warning_threshold);

          return (
            <div key={seq.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span className="badge badge-info" style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>
                  {seq.prefix} ({seq.fiscal_type_code})
                </span>
                <span className={`badge ${seq.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                  {seq.status === 'active' ? 'Activo' : 'Vencido'}
                </span>
              </div>

              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {seq.document_type_name || `Comprobante ${seq.fiscal_type_code}`}
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Sucursal: {seq.branch_name}
              </p>

              {/* Range Information */}
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Consumidos:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{used} / {total}</strong>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', background: 'var(--bg-subtle)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${percentUsed}%`,
                      height: '100%',
                      background: isNearDepletion ? 'var(--danger)' : 'var(--accent-gradient)',
                      borderRadius: '9999px'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  <span>Vencimiento: {seq.expiration_date || 'Sin vencimiento'}</span>
                  <span>Próximo: {seq.prefix}{String(seq.current_number).padStart(8, '0')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE SEQUENCE MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>
              Nueva Secuencia Fiscal NCF
            </h3>
            <form onSubmit={handleCreateSequence} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Tipo de Comprobante *</label>
                <select
                  required
                  className="select-control"
                  value={formData.fiscal_type_code}
                  onChange={(e) => setFormData({
                    ...formData,
                    fiscal_type_code: e.target.value,
                    prefix: e.target.value
                  })}
                >
                  {docTypes.map(d => (
                    <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Prefijo *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={formData.prefix}
                    onChange={(e) => setFormData({ ...formData, prefix: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Número Inicial</label>
                  <input
                    type="number"
                    required
                    className="input-control"
                    value={formData.current_number}
                    onChange={(e) => setFormData({ ...formData, current_number: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Número Final Autorizado *</label>
                  <input
                    type="number"
                    required
                    className="input-control"
                    value={formData.final_number}
                    onChange={(e) => setFormData({ ...formData, final_number: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Fecha de Vencimiento</label>
                  <input
                    type="date"
                    className="input-control"
                    value={formData.expiration_date}
                    onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Secuencia
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
      />
    </div>
  );
}
