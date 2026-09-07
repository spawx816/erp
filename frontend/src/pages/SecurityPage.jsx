import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Users, Lock, Key, Plus, Search,
  History, CheckCircle, AlertCircle, X
} from 'lucide-react';
import api from '../services/api';

export default function SecurityPage({ activeBranch, initialTab = 'users' }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'users' | 'roles' | 'audit'

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [usersList, setUsersList] = useState([]);
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  // New User Modal
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    role_id: '',
    branch_id: '',
    phone: '',
    id_card: '',
    job_title: '',
    max_discount_percentage: '5'
  });

  useEffect(() => {
    loadSecurityData();
  }, [activeTab]);

  const loadSecurityData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const [uRes, rRes, bRes] = await Promise.all([
          api.get('/admin/users'),
          api.get('/admin/roles'),
          api.get('/admin/branches-warehouses')
        ]);
        if (uRes.success) setUsersList(uRes.data);
        if (rRes.success) setRoles(rRes.roles);
        if (bRes.success) setBranches(bRes.branches);
      } else if (activeTab === 'roles') {
        const res = await api.get('/admin/roles');
        if (res.success) {
          setRoles(res.roles);
          setAllPermissions(res.all_permissions);
        }
      } else if (activeTab === 'audit') {
        const res = await api.get('/admin/audit-logs');
        if (res.success) setAuditLogs(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/users', userForm);
      if (res.success) {
        alert('Usuario creado exitosamente.');
        setShowUserModal(false);
        loadSecurityData();
      }
    } catch (err) {
      alert(err.message || 'Error creando usuario.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>Usuarios, Roles & Auditoría Inalterable</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Control de acceso RBAC granular y registro inmutable de transacciones</p>
        </div>

        {activeTab === 'users' && (
          <button
            onClick={() => {
              setUserForm({
                username: '',
                first_name: '',
                last_name: '',
                email: '',
                password: '',
                role_id: roles[0]?.id || '',
                branch_id: branches[0]?.id || '',
                phone: '',
                id_card: '',
                job_title: '',
                max_discount_percentage: '5'
              });
              setShowUserModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus size={16} />
            <span>Nuevo Usuario</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('users')}
          className={`btn btn-sm ${activeTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Usuarios del Sistema ({usersList.length})
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          className={`btn btn-sm ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Matriz de Roles & Permisos (RBAC)
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`btn btn-sm ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Bitácora de Auditoría (Audit Log)
        </button>
      </div>

      {/* TAB 1: USERS */}
      {activeTab === 'users' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre Completo</th>
                <th>Rol Asignado</th>
                <th>Sucursal</th>
                <th>Descuento Máx.</th>
                <th>Correo / Teléfono</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#60a5fa' }}>{u.username}</td>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.first_name} {u.last_name}</div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{u.job_title || 'Colaborador'}</span>
                  </td>
                  <td>
                    <span className="badge badge-info">{u.role_name}</span>
                  </td>
                  <td>{u.branch_name || 'Todas'}</td>
                  <td style={{ fontWeight: 700, color: '#f59e0b' }}>{u.max_discount_percentage}%</td>
                  <td>
                    <div style={{ fontSize: '0.8rem' }}>{u.email}</div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.phone || '-'}</span>
                  </td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {u.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: ROLES & PERMISSIONS */}
      {activeTab === 'roles' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
          {roles.map(r => (
            <div key={r.id} className="card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>{r.name}</h4>
                <span className="badge badge-info">{r.slug}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                {r.description || 'Rol de usuario del sistema'}
              </p>
              <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Permisos activos:</span>
                <strong style={{ color: 'var(--success)' }}>{r.permissions_count || 0} asignados</strong>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Módulo</th>
                <th>Acción</th>
                <th>Detalle Transaccional</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map(log => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    {new Date(log.created_at).toLocaleString('es-DO')}
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{log.username || 'Sistema'}</span>
                  </td>
                  <td>
                    <span className="badge badge-info">{log.module}</span>
                  </td>
                  <td>
                    <span className="badge badge-warning">{log.action}</span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {log.description}
                  </td>
                  <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{log.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE USER MODAL */}
      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px' }}>Nuevo Usuario</h3>
            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Nombre *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={userForm.first_name}
                    onChange={(e) => setUserForm({ ...userForm, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Apellido *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={userForm.last_name}
                    onChange={(e) => setUserForm({ ...userForm, last_name: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Usuario (Username) *</label>
                  <input
                    type="text"
                    required
                    className="input-control"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Contraseña *</label>
                  <input
                    type="password"
                    required
                    className="input-control"
                    placeholder="Mínimo 6 caracteres"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    className="input-control"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label-control">Teléfono</label>
                  <input
                    type="text"
                    className="input-control"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label className="label-control">Rol *</label>
                  <select
                    required
                    className="select-control"
                    value={userForm.role_id}
                    onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })}
                  >
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-control">Sucursal</label>
                  <select
                    className="select-control"
                    value={userForm.branch_id}
                    onChange={(e) => setUserForm({ ...userForm, branch_id: e.target.value })}
                  >
                    <option value="">Todas las sucursales</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="label-control">Descuento Máximo Autorizado en POS (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="input-control"
                  value={userForm.max_discount_percentage}
                  onChange={(e) => setUserForm({ ...userForm, max_discount_percentage: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowUserModal(false)} className="btn btn-secondary">
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
