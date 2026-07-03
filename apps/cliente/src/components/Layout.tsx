import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, PlusCircle, Ticket, LogOut } from 'lucide-react';
import { signOut } from '../lib/supabase';

export default function Layout() {
    const location = useLocation();

    const handleLogout = async () => {
        await signOut();
        window.location.href = '/login';
    };

    const navItems = [
        { path: '/', icon: Home, label: 'Início' },
        { path: '/nova-aposta', icon: PlusCircle, label: 'Apostar' },
        { path: '/minhas-apostas', icon: Ticket, label: 'Apostas' },
    ];

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <header style={{
                borderBottom: '2px solid var(--secondary)',
                padding: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#fff'
            }}>
                <Link to="/" style={{ fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    🍀 LuckyClover
                </Link>

                <button
                    onClick={handleLogout}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--muted-foreground)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem',
                        cursor: 'pointer'
                    }}
                >
                    <LogOut size={16} />
                    Sair
                </button>
            </header>

            {/* Main Content */}
            <main className="container" style={{ flex: 1, padding: '1.5rem 1rem', paddingBottom: '5rem' }}>
                <Outlet />
            </main>

            {/* Bottom Navigation */}
            <nav style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: '#fff',
                borderTop: '2px solid var(--secondary)',
                display: 'flex',
                justifyContent: 'space-around',
                padding: '0.75rem 0',
                zIndex: 100
            }}>
                {navItems.map(item => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.25rem',
                                color: isActive ? 'var(--primary)' : 'var(--muted-foreground)',
                                fontSize: '0.7rem',
                                fontWeight: isActive ? 700 : 500,
                                textDecoration: 'none'
                            }}
                        >
                            <item.icon size={22} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
