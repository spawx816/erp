import React, { useState, useEffect } from 'react';
import {
  Settings, Building2, Shield, Printer, Database,
  Download, Save, RefreshCw, CheckCircle2, AlertCircle,
  Sun, Moon, Palette, Check, Warehouse, Plus, MapPin, X
} from 'lucide-react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function SettingsPage() {
  const { theme, setTheme, isLight } = useTheme();
  const [company, setCompany] = useState(null);
  const [settings, setSettings] = useState({});
  const [backups, setBackups] = useState([]);
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Branch & Warehouse Modals
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: '', code: '', phone: '', email: '', address: '', city: '' });
  const [warehouseForm, setWarehouseForm] = useState({ branch_id: '', name: '', code: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    loadSettings();
    loadBackups();
    loadBranchesAndWarehouses();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings');
      if (res.success) {
        setCompany(res.company);
        setSettings(res.settings);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadBackups = async () => {
    try {
      const res = await api.get('/admin/backups');
      if (res.success) setBackups(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadBranchesAndWarehouses = async () => {
    try {
      const res = await api.get('/admin/branches-warehouses');
      if (res.success) {
        setBranches(res.branches || []);
        setWarehouses(res.warehouses || []);
        if (res.branches && res.branches.length > 0) {
          setWarehouseForm(prev => ({ ...prev, branch_id: res.branches[0].id }));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCompany = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/settings', {
        ...company,
        ...settings
      });
      if (res.success) {
        alert('Configuración guardada exitosamente.');
        loadSettings();
      }
    } catch (err) {
      alert(err.message || 'Error actualizando configuración.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await api.post('/admin/backups');
      if (res.success) {
        alert(`Respaldo creado: ${res.backup.filename}`);
        loadBackups();
      }
    } catch (err) {
      alert(err.message || 'Error creando respaldo.');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!branchForm.name || !branchForm.code) {
      alert('Nombre y código de sucursal requeridos.');
      return;
    }
    setSavingLocation(true);
    try {
      const res = await api.post('/admin/branches', branchForm);
      if (res.success) {
        alert('Sucursal creada exitosamente.');
        setShowBranchModal(false);
        setBranchForm({ name: '', code: '', phone: '', email: '', address: '', city: '' });
        loadBranchesAndWarehouses();
      }
    } catch (err) {
      alert(err.message || 'Error creando sucursal.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleCreateWarehouse = async (e) => {
    e.preventDefault();
    if (!warehouseForm.branch_id || !warehouseForm.name || !warehouseForm.code) {
      alert('Seleccione sucursal, nombre y código de almacén.');
      return;
    }
    setSavingLocation(true);
    try {
      const res = await api.post('/admin/warehouses', warehouseForm);
      if (res.success) {
        alert('Almacén creado exitosamente.');
        setShowWarehouseModal(false);
        setWarehouseForm({ branch_id: branches[0]?.id || '', name: '', code: '' });
        loadBranchesAndWarehouses();
      }
    } catch (err) {
      alert(err.message || 'Error creando almacén.');
    } finally {
      setSavingLocation(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando configuración...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Configuración General del Sistema</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Datos de la empresa, gestión de sucursales & almacenes, tema visual, políticas y copias de seguridad
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
        {/* Company Profile Card */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Building2 size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Datos de la Empresa</h3>
          </div>

          <form onSubmit={handleSaveCompany} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label className="label-control">Nombre Comercial</label>
              <input
                type="text"
                className="input-control"
                value={company?.name || ''}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
              />
            </div>

            <div>
              <label className="label-control">Razón Social Legal</label>
              <input
                type="text"
                className="input-control"
                value={company?.legal_name || ''}
                onChange={(e) => setCompany({ ...company, legal_name: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="label-control">RNC / Identificación</label>
                <input
                  type="text"
                  className="input-control"
                  value={company?.tax_id || ''}
                  onChange={(e) => setCompany({ ...company, tax_id: e.target.value })}
                />
              </div>
              <div>
                <label className="label-control">Teléfono</label>
                <input
                  type="text"
                  className="input-control"
                  value={company?.phone || ''}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="label-control">Dirección</label>
              <input
                type="text"
                className="input-control"
                value={company?.address || ''}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
              />
            </div>

            {/* Business Rules */}
            <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderRadius: '10px', border: '1px solid var(--border-color)', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={company?.allow_negative_inventory === 1}
                  onChange={(e) => setCompany({ ...company, allow_negative_inventory: e.target.checked ? 1 : 0 })}
                />
                <div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Permitir Ventas con Inventario Negativo</span>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Por defecto desactivado para garantizar integridad de stock.</p>
                </div>
              </label>
            </div>

            <div>
              <label className="label-control">Pie de Página en Tickets / Facturas</label>
              <input
                type="text"
                className="input-control"
                placeholder="¡Gracias por su compra!..."
                value={settings?.receipt_footer || '¡Gracias por su compra! No se aceptan devoluciones sin factura.'}
                onChange={(e) => setSettings({ ...settings, receipt_footer: e.target.value })}
              />
            </div>

            <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: '8px' }}>
              <Save size={16} />
              <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
            </button>
          </form>
        </div>

        {/* Column Right: Warehouses & Branches Card */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Warehouse size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Sucursales & Almacenes</h3>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowBranchModal(true)} className="btn btn-secondary btn-sm">
                <Plus size={14} />
                <span>+ Sucursal</span>
              </button>
              <button onClick={() => setShowWarehouseModal(true)} className="btn btn-primary btn-sm">
                <Plus size={14} />
                <span>+ Almacén</span>
              </button>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Gestión de ubicaciones físicas, puntos de venta y centros de distribución de inventario.
          </p>

          {/* List of Warehouses */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
              Almacenes Activos ({warehouses.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {warehouses.map(w => (
                <div
                  key={w.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Warehouse size={16} color="var(--accent-primary)" />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{w.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        Código: <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{w.code}</span> • Sucursal: <strong>{w.branch_name}</strong>
                      </div>
                    </div>
                  </div>
                  {w.is_default === 1 && (
                    <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Principal</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* List of Branches */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.04em' }}>
              Sucursales Registradas ({branches.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {branches.map(b => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MapPin size={16} color="var(--accent-primary)" />
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{b.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {b.code} {b.city ? `• ${b.city}` : ''} {b.phone ? `• Tel: ${b.phone}` : ''}
                      </div>
                    </div>
                  </div>
                  {b.is_main === 1 && (
                    <span className="badge badge-info" style={{ fontSize: '0.68rem' }}>Sede Central</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Theme Selector Card */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Palette size={20} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Apariencia & Tema Visual</h3>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Selecciona el tema de interfaz que mejor se adapte a tu entorno de trabajo.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div
              onClick={() => setTheme('light')}
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${isLight ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: isLight ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-subtle)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              {isLight && (
                <div style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={12} color="#fff" />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Sun size={20} color="#d97706" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Modo Claro</span>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: 0 }}>
                Fondo claro, alto contraste y lectura optimizada para ambientes diurnos.
              </p>
            </div>

            <div
              onClick={() => setTheme('dark')}
              style={{
                padding: '16px',
                borderRadius: '12px',
                border: `2px solid ${!isLight ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: !isLight ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-subtle)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
            >
              {!isLight && (
                <div style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={12} color="#fff" />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <Moon size={20} color="#60a5fa" />
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Modo Oscuro</span>
              </div>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: 0 }}>
                Gama Slate & Sapphire oscura para menor fatiga visual.
              </p>
            </div>
          </div>
        </div>

        {/* Backups Card */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Database size={20} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Copias de Seguridad (Backups)</h3>
            </div>
            <button onClick={handleCreateBackup} disabled={creatingBackup} className="btn btn-primary btn-sm">
              <Download size={14} />
              <span>{creatingBackup ? 'Creando...' : 'Generar Respaldo Ahora'}</span>
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
            Respaldos completos de la base de datos relacional con todos los datos transaccionales, auditoría y secuencias NCF.
          </p>

          <div className="table-container" style={{ maxHeight: '180px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Archivo</th>
                  <th>Fecha</th>
                  <th>Tamaño</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {backups.length === 0 ? (
                  <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>No hay respaldos registrados.</td></tr>
                ) : (
                  backups.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{b.filename}</td>
                      <td style={{ fontSize: '0.75rem' }}>{new Date(b.created_at).toLocaleString('es-DO')}</td>
                      <td>{(b.size_bytes / 1024).toFixed(1)} KB</td>
                      <td><span className="badge badge-success">Completado</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--bg-subtle)', borderRadius: '10px', border: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Procedimiento de Restauración:</p>
            <p>1. Detenga el servicio de backend.</p>
            <p>2. Copie el archivo deseado desde <code>data/backups/</code> a <code>data/sgc_erp.sqlite</code>.</p>
            <p>3. Reinicie el servidor de backend. Todos los datos quedarán restaurados a ese punto en el tiempo.</p>
          </div>
        </div>
      </div>

      {/* CREATE WAREHOUSE MODAL */}
      {showWarehouseModal && (
        <div className="modal-overlay" onClick={() => setShowWarehouseModal(false)}>
          <div className="modal-content" style={{ maxWidth: '460px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Warehouse size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Crear Nuevo Almacén</h3>
              </div>
              <button onClick={() => setShowWarehouseModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateWarehouse} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="label-control">Sucursal Asignada *</label>
                <select
                  className="select-control"
                  value={warehouseForm.branch_id}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, branch_id: e.target.value })}
                  required
                >
                  <option value="">Seleccione Sucursal...</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label-control">Nombre del Almacén *</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: Almacén Tintes & Químicos"
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label-control">Código Único de Almacén *</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: ALM-03"
                  value={warehouseForm.code}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowWarehouseModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingLocation} className="btn btn-primary" style={{ flex: 1 }}>
                  <Plus size={16} />
                  <span>{savingLocation ? 'Creando...' : 'Crear Almacén'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE BRANCH MODAL */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building2 size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Crear Nueva Sucursal</h3>
              </div>
              <button onClick={() => setShowBranchModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateBranch} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="label-control">Nombre de la Sucursal *</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Ej: Sucursal Bávaro / Punta Cana"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Código Sucursal *</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ej: SUC-03"
                    value={branchForm.code}
                    onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div>
                  <label className="label-control">Ciudad</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="Ej: Higüey"
                    value={branchForm.city}
                    onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Teléfono</label>
                  <input
                    type="text"
                    className="input-control"
                    placeholder="809-555-0100"
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Correo Electrónico</label>
                  <input
                    type="email"
                    className="input-control"
                    placeholder="sucursal3@cambri.com.do"
                    value={branchForm.email}
                    onChange={(e) => setBranchForm({ ...branchForm, email: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label-control">Dirección</label>
                <input
                  type="text"
                  className="input-control"
                  placeholder="Av. España No. 45"
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowBranchModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingLocation} className="btn btn-primary" style={{ flex: 1 }}>
                  <Plus size={16} />
                  <span>{savingLocation ? 'Creando...' : 'Crear Sucursal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
