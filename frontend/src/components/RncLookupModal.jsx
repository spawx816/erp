import React, { useState } from 'react';
import {
  Search, ShieldCheck, ShieldAlert, Building2, User,
  Check, Copy, ExternalLink, X, RefreshCw, FileText
} from 'lucide-react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';

export default function RncLookupModal({ isOpen, onClose, onSelectCompany }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('rnc'); // 'rnc' | 'name'
  const [rncInput, setRncInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [nameResults, setNameResults] = useState([]);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleLookupRnc = async (e) => {
    if (e) e.preventDefault();
    const clean = rncInput.replace(/[^0-9]/g, '').trim();
    if (!clean || (clean.length !== 9 && clean.length !== 11)) {
      addToast('El RNC debe contener 9 dígitos o la Cédula 11 dígitos.', 'warning');
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await api.get(`/fiscal/rnc/consulta/${clean}`);
      if (res.success && res.data) {
        setResult(res.data);
        addToast(`RNC Consultado: ${res.data.legal_name || res.data.commercial_name}`, 'success');
      } else {
        addToast(res.message || 'RNC no encontrado en DGII.', 'warning');
      }
    } catch (err) {
      addToast(err.message || 'Error al consultar RNC en la DGII.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchByName = async (e) => {
    if (e) e.preventDefault();
    if (!nameInput.trim() || nameInput.trim().length < 3) {
      addToast('Ingrese al menos 3 caracteres para buscar por nombre.', 'warning');
      return;
    }

    setLoading(true);
    setNameResults([]);
    try {
      const res = await api.get('/fiscal/rnc/buscar-nombre', { buscar: nameInput.trim() });
      if (res.success && Array.isArray(res.results)) {
        setNameResults(res.results);
        if (res.results.length === 0) {
          addToast('No se encontraron contribuyentes con ese nombre.', 'info');
        } else {
          addToast(`Se encontraron ${res.results.length} contribuyentes en DGII.`, 'success');
        }
      } else {
        addToast(res.message || 'Error en búsqueda por nombre.', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Error consultando DGII por nombre.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromResult = (item) => {
    const clean = item.cedula_rnc?.replace(/[^0-9]/g, '') || '';
    setRncInput(clean);
    setActiveTab('rnc');
    handleLookupDirect(clean);
  };

  const handleLookupDirect = async (cleanRnc) => {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.get(`/fiscal/rnc/consulta/${cleanRnc}`);
      if (res.success && res.data) {
        setResult(res.data);
      }
    } catch (err) {
      addToast('Error al obtener detalle del RNC.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    addToast('Copiado al portapapeles.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '640px', padding: '24px', background: 'var(--bg-header)', border: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={20} color="#3b82f6" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Consulta Oficial RNC / Cédula DGII</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Validación de contribuyentes en tiempo real (Megaplus / DGII)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary btn-sm" style={{ padding: '6px' }}>
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setActiveTab('rnc')}
            className={`btn btn-sm ${activeTab === 'rnc' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
          >
            <ShieldCheck size={14} />
            <span>Por RNC / Cédula</span>
          </button>
          <button
            onClick={() => setActiveTab('name')}
            className={`btn btn-sm ${activeTab === 'name' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
          >
            <Search size={14} />
            <span>Por Razón Social / Nombre</span>
          </button>
        </div>

        {/* Tab 1: Search by RNC / Cedula */}
        {activeTab === 'rnc' && (
          <div>
            <form onSubmit={handleLookupRnc} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ingrese RNC (9 dígitos) o Cédula (11 dígitos)... ej: 101010632"
                  value={rncInput}
                  onChange={(e) => setRncInput(e.target.value)}
                  style={{ height: '42px', fontSize: '0.92rem', fontWeight: 600, paddingLeft: '14px' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ height: '42px', padding: '0 20px', gap: '6px' }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                <span>Consultar</span>
              </button>
            </form>

            {/* Quick Suggestions Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ejemplos:</span>
              <button
                type="button"
                onClick={() => { setRncInput('101010632'); handleLookupDirect('101010632'); }}
                className="badge badge-primary"
                style={{ cursor: 'pointer', border: 'none', fontSize: '0.7rem' }}
              >
                Banco Popular (101-01063-2)
              </button>
              <button
                type="button"
                onClick={() => { setRncInput('101001577'); handleLookupDirect('101001577'); }}
                className="badge badge-secondary"
                style={{ cursor: 'pointer', border: 'none', fontSize: '0.7rem' }}
              >
                Claro Dominicana
              </button>
            </div>

            {/* Result Card */}
            {result && (
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      {result.person_type === 'juridica' ? 'Persona Jurídica' : 'Persona Física'}
                    </span>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {result.legal_name || result.commercial_name}
                    </h4>
                    {result.commercial_name && result.commercial_name !== result.legal_name && (
                      <p style={{ fontSize: '0.82rem', color: '#93c5fd', marginTop: '2px' }}>
                        Nombre Comercial: {result.commercial_name}
                      </p>
                    )}
                  </div>

                  <span
                    className={`badge ${result.status === 'ACTIVO' ? 'badge-success' : 'badge-danger'}`}
                    style={{ fontSize: '0.75rem', padding: '4px 10px', fontWeight: 700 }}
                  >
                    {result.status}
                  </span>
                </div>

                {/* Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '0.8rem', background: 'var(--bg-card)', padding: '12px', borderRadius: '8px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>RNC / Cédula</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                      <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{result.formatted_rnc}</strong>
                      <button
                        onClick={() => handleCopy(result.formatted_rnc)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#60a5fa' }}
                        title="Copiar RNC"
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Facturador Electrónico (e-CF)</span>
                    <p style={{ fontWeight: 700, color: result.electronic_billing === 'SI' ? '#10b981' : '#f59e0b', marginTop: '2px' }}>
                      {result.electronic_billing === 'SI' ? '✅ Habilitado (e-CF)' : '❌ No Habilitado'}
                    </p>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Régimen de Pagos</span>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {result.payment_regime || 'NORMAL'}
                    </p>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Administración Local</span>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {result.local_administration || 'DGII Sede Central'}
                    </p>
                  </div>

                  {result.economic_activity && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Actividad Económica</span>
                      <p style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {result.economic_activity}
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {onSelectCompany && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCompany(result);
                        onClose();
                      }}
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                    >
                      <Check size={16} />
                      <span>Usar en Formulario</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Search by Business Name */}
        {activeTab === 'name' && (
          <div>
            <form onSubmit={handleSearchByName} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                className="input-control"
                placeholder="Nombre o Razón Social (ej: Cerveceria, Popular, Farmacia)..."
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                style={{ height: '42px', fontSize: '0.92rem', paddingLeft: '14px' }}
              />
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary"
                style={{ height: '42px', padding: '0 20px', gap: '6px' }}
              >
                {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                <span>Buscar</span>
              </button>
            </form>

            {/* Results Table */}
            <div className="table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {nameResults.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '24px 0' }}>
                  {loading ? 'Consultando padrón DGII...' : 'Ingrese un término para buscar contribuyentes en el padrón DGII.'}
                </p>
              ) : (
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>RNC / Cédula</th>
                      <th>Razón Social</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nameResults.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60a5fa' }}>
                          {item.cedula_rnc}
                        </td>
                        <td>
                          <strong>{item.nombre_razon_social}</strong>
                          {item.nombre_comercial && item.nombre_comercial !== item.nombre_razon_social && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              {item.nombre_comercial}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${item.estado === 'ACTIVO' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem' }}>
                            {item.estado}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleSelectFromResult(item)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                          >
                            Ver Ficha
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
