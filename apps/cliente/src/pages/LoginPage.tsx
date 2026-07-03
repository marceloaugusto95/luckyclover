import { useState, useEffect } from 'react';
import { signIn, signUp, formatCpf, validateCpf, SignUpData, supabase } from '../lib/supabase';
import { X, Phone, MessageCircle } from 'lucide-react';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [cpf, setCpf] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [pixKey, setPixKey] = useState('');
    const [cidade, setCidade] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [supportPhone, setSupportPhone] = useState('5581900000000');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [showPolicy, setShowPolicy] = useState(false);

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

    const handlePhoneChange = (value: string) => {
        const clean = value.replace(/\D/g, '');
        if (clean.length <= 2) {
            setPhone(clean);
        } else if (clean.length <= 7) {
            setPhone(`(${clean.slice(0, 2)}) ${clean.slice(2)}`);
        } else {
            setPhone(`(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!validateCpf(cpf)) {
            setError('CPF inválido. Digite os 11 dígitos.');
            return;
        }

        if (!isLogin && !acceptedTerms) {
            setError('Você precisa aceitar a Política de Privacidade para se cadastrar.');
            return;
        }

        setLoading(true);

        try {
            if (isLogin) {
                const { error } = await signIn(cpf, password);
                if (error) throw error;
            } else {
                const signUpData: SignUpData = {
                    cpf,
                    password,
                    fullName: name,
                    phone: phone.replace(/\D/g, ''),
                    pixKey,
                    cidade
                };
                const { error } = await signUp(signUpData);
                if (error) throw error;
            }
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
            background: 'linear-gradient(135deg, #e8f5e9 0%, #fff 100%)'
        }}>
            {/* Logo */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <img src="/clover.svg" alt="LuckyClover" style={{ width: '200px', height: '200px' }} />
            </div>

            {/* 18+ Warning */}
            <div style={{
                background: '#fff3e0',
                border: '1px solid #ffb74d',
                borderRadius: '8px',
                padding: '0.6rem 1rem',
                marginBottom: '1rem',
                textAlign: 'center',
                maxWidth: '400px',
                width: '100%'
            }}>
                <span style={{ fontSize: '0.85rem', color: '#e65100', fontWeight: 600 }}>
                    ⚠️ Você precisa ter 18 anos ou mais para apostar.
                </span>
            </div>

            {/* Form Card */}
            <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                    {isLogin ? 'Entrar' : 'Criar Conta'}
                </h2>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {!isLogin && (
                        <div>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                Nome Completo
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Seu nome completo"
                                required={!isLogin}
                            />
                        </div>
                    )}

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

                    {!isLogin && (
                        <>
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                    Telefone
                                </label>
                                <input
                                    type="tel"
                                    className="input"
                                    value={phone}
                                    onChange={(e) => handlePhoneChange(e.target.value)}
                                    placeholder="(00) 00000-0000"
                                    maxLength={15}
                                    required
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                    Chave PIX
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={pixKey}
                                    onChange={(e) => setPixKey(e.target.value)}
                                    placeholder="CPF, telefone, e-mail ou chave aleatória"
                                    required
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                    Cidade
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={cidade}
                                    onChange={(e) => setCidade(e.target.value)}
                                    placeholder="Sua cidade"
                                    required
                                />
                            </div>
                        </>
                    )}

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
                            minLength={6}
                        />
                        {isLogin && (
                            <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.35rem' }}>
                                🔓 Demo: qualquer senha é aceita.
                            </p>
                        )}
                    </div>

                    {!isLogin && (
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.8rem', color: '#555', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={acceptedTerms}
                                onChange={(e) => setAcceptedTerms(e.target.checked)}
                                style={{ marginTop: '0.15rem', flexShrink: 0 }}
                            />
                            <span>
                                Declaro ter 18 anos ou mais e concordo com o uso dos meus dados pessoais
                                para participação nos sorteios, processamento de pagamentos e contato,
                                conforme a{' '}
                                <button
                                    type="button"
                                    onClick={() => setShowPolicy(true)}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}
                                >
                                    Política de Privacidade
                                </button>.
                            </span>
                        </label>
                    )}

                    {error && (
                        <p style={{ color: '#e53935', fontSize: '0.875rem', textAlign: 'center' }}>
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={loading || (!isLogin && !acceptedTerms)}
                    >
                        {loading ? 'Carregando...' : (isLogin ? 'Entrar' : 'Criar Conta')}
                    </button>

                    {isLogin && (
                        <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                            <a
                                href="#"
                                onClick={(e) => { e.preventDefault(); setShowContactModal(true); }}
                                style={{ fontSize: '0.8rem', color: '#d35400ff', textDecoration: 'none' }}
                            >
                                Esqueceu a senha? Entre em contato
                            </a>
                        </div>
                    )}
                </form>

                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                    <button
                        onClick={() => setIsLogin(!isLogin)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 600
                        }}
                    >
                        {isLogin ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entre'}
                    </button>
                </div>
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

            <PrivacyPolicyModal isOpen={showPolicy} onClose={() => setShowPolicy(false)} />
        </div>
    );
}
