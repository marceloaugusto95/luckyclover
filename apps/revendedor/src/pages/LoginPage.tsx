import { useState, useEffect } from 'react';
import { signIn, formatCpf, validateCpf, supabase } from '../lib/supabase';
import { X, Phone, MessageCircle } from 'lucide-react';

export default function LoginPage() {
    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [supportPhone, setSupportPhone] = useState('5581900000000');

    useEffect(() => {
        const fetchSupportPhone = async () => {
            const { data } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'support_phone')
                .single();
            if (data && data.value && data.value.number) {
                setSupportPhone(data.value.number);
            }
        };
        fetchSupportPhone();
    }, []);

    const handleCpfChange = (value: string) => {
        setCpf(formatCpf(value));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!validateCpf(cpf)) {
            setError('CPF inválido. Digite os 11 dígitos.');
            return;
        }

        setLoading(true);

        try {
            const { error } = await signIn(cpf, password);
            if (error) throw error;
            // Use window.location to ensure fresh state after auth
            window.location.href = '/';
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Erro ao autenticar');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            background: 'linear-gradient(135deg, #fff3e0 0%, #fff 100%)'
        }}>
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <img src="/clover.svg" alt="LuckyClover" style={{ width: '200px', height: '200px' }} />
                <p style={{ color: 'var(--secondary)', fontWeight: 700, marginTop: '0.5rem' }}>
                    Painel do Revendedor
                </p>
            </div>

            {/* 18+ Warning */}
            <div style={{
                background: '#fff3e0',
                border: '1px solid #ffb74d',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                marginBottom: '1rem',
                textAlign: 'center',
                maxWidth: '360px',
                width: '100%'
            }}>
                <span style={{ fontSize: '0.85rem', color: '#e65100', fontWeight: 600 }}>
                    ⚠️ Você precisa ter 18 anos ou mais para apostar.
                </span>
            </div>

            <div className="card" style={{ width: '100%', maxWidth: '360px' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                    Entrar
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                            CPF
                        </label>
                        <input
                            type="text"
                            className="input"
                            value={cpf}
                            onChange={(e) => handleCpfChange(e.target.value)}
                            placeholder="000.000.000-00"
                            maxLength={14}
                            required
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                            Senha
                        </label>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <p style={{ color: '#e53935', fontSize: '0.875rem', textAlign: 'center' }}>
                            {error}
                        </p>
                    )}

                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
                        {loading ? 'Entrando...' : 'Entrar'}
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                        <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); setShowContactModal(true); }}
                            style={{ fontSize: '0.9rem', color: '#d35400ff', textDecoration: 'none' }}
                        >
                            Esqueceu a senha? Entre em contato.
                        </a>
                    </div>
                </form>

                <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                    Conta de revendedor é criada pelo administrador
                </p>
            </div>
            {/* Contact Modal */}
            {showContactModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }} onClick={() => setShowContactModal(false)}>
                    <div
                        className="card"
                        style={{ width: '100%', maxWidth: '320px', position: 'relative', textAlign: 'center' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowContactModal(false)}
                            style={{
                                position: 'absolute',
                                top: '0.5rem',
                                right: '0.5rem',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#999'
                            }}
                        >
                            <X size={20} />
                        </button>

                        <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                background: '#e8f5e9',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--primary)'
                            }}>
                                <MessageCircle size={24} />
                            </div>
                        </div>

                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Recuperar Senha</h3>

                        <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1.5rem' }}>
                            Ligue ou entre contato pelo Whatsapp para redefinir sua senha.
                        </p>

                        <div style={{
                            background: '#f5f5f5',
                            padding: '1rem',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            fontWeight: 700,
                            color: '#333'
                        }}>
                            <Phone size={18} />
                            <span>+{supportPhone}</span>
                        </div>

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '1.5rem' }}
                            onClick={() => window.open(`https://wa.me/${supportPhone}`, '_blank')}
                        >
                            Abrir no WhatsApp
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
