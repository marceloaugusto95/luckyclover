import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { BarChart3, DollarSign, Store, Users, Menu, X, LogOut, ChevronDown, ChevronRight, Settings, Trophy } from 'lucide-react';
import { signOut } from '../lib/supabase';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clientesExpanded, setClientesExpanded] = useState(true);
    const location = useLocation();

    const handleLogout = async () => {
        await signOut();
    };

    const isActive = (path: string) => location.pathname === path;

    return (
        <div style={{ display: 'flex', minHeight: '100vh' }}>
            {/* Mobile Header */}
            <div className="mobile-header" style={{
                display: 'none',
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                padding: '1rem',
                background: '#fff',
                borderBottom: '2px solid var(--secondary)',
                zIndex: 60,
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>🍀 Admin</span>
                <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                    {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>

            {/* Overlay */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={() => setSidebarOpen(false)}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
                />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} style={{
                width: '240px',
                background: '#fcfcfc',
                borderRight: '1px solid #e0e0e0',
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                zIndex: 50
            }}>
                <div style={{ padding: '1.5rem 1rem', borderBottom: '1px solid #eee' }}>
                    <Link to="/" style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>
                        🍀 LuckyClover
                    </Link>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--secondary)', fontWeight: 600, marginTop: '0.25rem' }}>
                        ADMINISTRADOR
                    </span>
                </div>

                <nav style={{ flex: 1, padding: '1rem 0.5rem' }}>
                    <SidebarLink to="/" icon={<BarChart3 size={18} />} label="Visão Geral" active={isActive('/')} onClick={() => setSidebarOpen(false)} />
                    <SidebarLink to="/concursos" icon={<Trophy size={18} />} label="Concursos" active={isActive('/concursos')} onClick={() => setSidebarOpen(false)} />
                    <SidebarLink to="/revendedores" icon={<Store size={18} />} label="Revendedores" active={isActive('/revendedores')} onClick={() => setSidebarOpen(false)} />

                    {/* Expandable */}
                    <button
                        onClick={() => setClientesExpanded(!clientesExpanded)}
                        style={{
                            width: '100%',
                            padding: '0.6rem 0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            borderRadius: '6px',
                            color: '#333'
                        }}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Users size={18} color="var(--primary)" />
                            Clientes e Apostas
                        </span>
                        {clientesExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    {clientesExpanded && (
                        <div style={{ marginLeft: '1rem', paddingLeft: '0.75rem', borderLeft: '2px solid #e0e0e0' }}>
                            <SidebarLink to="/clientes" icon={<Users size={16} />} label="Visualizar Apostas" active={isActive('/clientes')} onClick={() => setSidebarOpen(false)} sub />
                            <SidebarLink to="/clientes/cadastrados" icon={<Users size={16} />} label="Clientes Cadastrados" active={isActive('/clientes/cadastrados')} onClick={() => setSidebarOpen(false)} sub />
                            <SidebarLink to="/clientes/precos" icon={<DollarSign size={16} />} label="Configurar Preços" active={isActive('/clientes/precos')} onClick={() => setSidebarOpen(false)} sub />
                        </div>
                    )}

                    <SidebarLink to="/configuracoes" icon={<Settings size={18} />} label="Configurações" active={isActive('/configuracoes')} onClick={() => setSidebarOpen(false)} />
                </nav>

                <div style={{ padding: '1rem', borderTop: '1px solid #eee' }}>
                    <button onClick={handleLogout} style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.6rem',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--muted-foreground)',
                        fontSize: '0.875rem'
                    }}>
                        <LogOut size={16} /> Sair
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main style={{ flex: 1, padding: '1.5rem', background: '#fff', overflow: 'auto' }}>
                <Outlet />
            </main>

            <style>{`
                @media (max-width: 768px) {
                    .mobile-header { display: flex !important; }
                    .sidebar {
                        position: fixed;
                        top: 0;
                        left: 0;
                        bottom: 0;
                        transform: translateX(-100%);
                        transition: transform 0.3s ease;
                    }
                    .sidebar.open { transform: translateX(0); }
                    main { margin-top: 60px; }
                }
            `}</style>
        </div>
    );
}

function SidebarLink({ to, icon, label, active, onClick, sub }: {
    to: string;
    icon: React.ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
    sub?: boolean;
}) {
    return (
        <Link
            to={to}
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: sub ? '0.5rem 0.6rem' : '0.6rem 0.75rem',
                borderRadius: '6px',
                fontSize: sub ? '0.85rem' : '0.9rem',
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--primary)' : '#333',
                background: active ? 'rgba(46, 125, 50, 0.1)' : 'transparent',
                textDecoration: 'none',
                marginBottom: '0.25rem'
            }}
        >
            <span style={{ color: 'var(--primary)' }}>{icon}</span>
            {label}
        </Link>
    );
}
