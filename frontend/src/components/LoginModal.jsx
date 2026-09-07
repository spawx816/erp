import React, { useState } from 'react';
import { ShoppingCart, Shield, User, Lock, AlertCircle, Sparkles, Sun, Moon } from 'lucide-react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

export default function LoginModal({ onLoginSuccess }) {
  const { theme, toggleTheme, isLight } = useTheme();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', { username, password });
      if (res.success) {
        localStorage.setItem('sgc_token', res.token);
        localStorage.setItem('sgc_user', JSON.stringify(res.user));
        localStorage.setItem('sgc_branch_id', String(res.user.active_branch_id));
        onLoginSuccess(res.user);
      }
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoUsername) => {
    setUsername(demoUsername);
    setPassword('Admin123!');
    setTimeout(() => {
      setLoading(true);
      setError('');
      api.post('/auth/login', { username: demoUsername, password: 'Admin123!' })
        .then(res => {
          if (res.success) {
            localStorage.setItem('sgc_token', res.token);
            localStorage.setItem('sgc_user', JSON.stringify(res.user));
            localStorage.setItem('sgc_branch_id', String(res.user.active_branch_id));
            onLoginSuccess(res.user);
          }
        })
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }, 50);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: isLight ? 'radial-gradient(circle at center, #f8fafc 0%, #e2e8f0 100%)' : 'radial-gradient(circle at center, #111827 0%, #070b14 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px', zIndex: 1000
    }}>
      <div style={{
        width: '100%', maxWidth: '440px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '20px',
        boxShadow: 'var(--shadow-modal)',
        padding: '36px',
        position: 'relative'
      }}>
        {/* Top Right Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isLight ? 'Cambiar a Modo Oscuro' : 'Cambiar a Modo Claro'}
          style={{
            position: 'absolute',
            top: '18px',
            right: '18px',
            background: 'var(--bg-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: '6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)'
          }}
        >
          {isLight ? <Sun size={16} color="#d97706" /> : <Moon size={16} color="#60a5fa" />}
        </button>

        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '56px', height: '56px', margin: '0 auto 16px',
            background: 'var(--accent-gradient)',
            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--accent-glow)'
          }}>
            <ShoppingCart size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Nexus ERP</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Sistema de Gestión Comercial & Facturación Fiscal
          </p>
          <div style={{ display: 'inline-block', marginTop: '8px', padding: '3px 10px', background: isLight ? 'rgba(37, 99, 235, 0.08)' : 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '9999px', fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
            Comercial Cambri SRL • RNC 131-98765-4
          </div>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px', padding: '10px 14px', marginBottom: '20px',
            display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--danger)', fontSize: '0.85rem'
          }}>
            <AlertCircle size={16} color="var(--danger)" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="label-control">Usuario o Correo</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px' }} />
              <input
                type="text"
                className="input-control"
                style={{ paddingLeft: '38px' }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                required
              />
            </div>
          </div>

          <div>
            <label className="label-control">Contraseña</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px' }} />
              <input
                type="password"
                className="input-control"
                style={{ paddingLeft: '38px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', height: '44px', marginTop: '6px' }}
          >
            {loading ? 'Accediendo...' : 'Iniciar Sesión'}
          </button>
        </form>

        {/* Quick Demo Switcher */}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', justifyContent: 'center' }}>
            <Sparkles size={14} color="var(--accent-primary)" />
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Acceso Rápido Demo (1-Click)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('admin')}
              style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
            >
              👑 <strong>Super Admin</strong>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('gerente')}
              style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
            >
              📊 <strong>Gerente</strong>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('cajero')}
              style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
            >
              💳 <strong>Cajero (POS)</strong>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('vendedor')}
              style={{ justifyContent: 'flex-start', fontSize: '0.75rem' }}
            >
              🏷️ <strong>Vendedor</strong>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleQuickLogin('almacen')}
              style={{ gridColumn: 'span 2', justifyContent: 'center', fontSize: '0.75rem' }}
            >
              📦 <strong>Encargado de Almacén</strong>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
