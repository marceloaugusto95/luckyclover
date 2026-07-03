import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PlusCircle } from 'lucide-react';
import { getMegaSenaResult, MegaSenaResult } from '../lib/mega-sena';
import { getUserBets, Bet, getPrizeEstimates, PrizeEstimate, supabase } from '../lib/supabase';
import AuditSection from '../components/AuditSection';

export default function HomePage() {
    const [result, setResult] = useState<MegaSenaResult | null>(null);
    const [recentBets, setRecentBets] = useState<Bet[]>([]);
    const [prizeEstimate, setPrizeEstimate] = useState<PrizeEstimate | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        const megaResult = await getMegaSenaResult();
        setResult(megaResult);

        const bets = await getUserBets();
        setRecentBets(bets.slice(0, 3));

        // Fetch internal prize estimates for the NEXT contest
        const estimates = await getPrizeEstimates(megaResult.proximoConcurso);
        setPrizeEstimate(estimates);

        setLoading(false);
    };

    useEffect(() => {
        let isMounted = true;
        let subscribed = false;

        fetchData();

        // Subscribe to contests changes
        const channel = supabase
            .channel('concursos_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'concursos' },
                () => {
                    if (isMounted) {
                        console.log('Contest update detected, refreshing data...');
                        fetchData();
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    subscribed = true;
                }
            });

        return () => {
            isMounted = false;
            // Only remove channel if it was successfully subscribed
            if (subscribed && channel) {
                supabase.removeChannel(channel);
            }
        };
    }, []);

    if (loading || !result) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="animate-spin" style={{
                    width: 32,
                    height: 32,
                    border: '3px solid var(--muted)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    margin: '0 auto'
                }} />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            {/* Welcome + CTA */}
            <div>
                <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Olá!</h1>
                <p style={{ color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                    Faça sua aposta e concorra a prêmios!
                </p>
                <Link to="/nova-aposta" className="btn btn-primary" style={{ width: '100%', gap: '0.5rem' }}>
                    <PlusCircle size={20} />
                    Nova Aposta
                </Link>
            </div>

            {/* Audit Section */}
            {result && <AuditSection latestConcurso={result.concurso} />}

            {/* Prize Estimate Card (Current/Next Contest) */}
            <section className="card" style={{ background: 'linear-gradient(135deg, #1a472a 0%, #2e7d32 100%)', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.25rem', color: 'white', fontWeight: 800 }}>
                            Prêmio Estimado
                        </h2>
                        <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                            Concurso #{result.proximoConcurso} • {result.dataProximoConcurso}
                        </p>
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1.5rem', borderRadius: '0.5rem', backdropFilter: 'blur(5px)' }}>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '1rem', marginBottom: '0.5rem', fontWeight: 600, color: '#FFD700' }}>SENA</p>
                        <p style={{ fontSize: '2.5rem', fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                            {prizeEstimate
                                ? (prizeEstimate.sena || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : 'R$ 0,00'}
                        </p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: 600 }}>QUINA</p>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                {prizeEstimate
                                    ? (prizeEstimate.quina || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : 'R$ 0,00'}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Mega Sena Result Card (Last Contest) */}
            <section className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                    <div>
                        <h2 style={{ fontSize: '1.125rem', color: 'var(--primary)', fontWeight: 700 }}>
                            Resultado Anterior #{result.concurso}
                        </h2>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{result.data}</p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', margin: '1.5rem 0' }}>
                    {result.dezenas.map((num, idx) => (
                        <div key={`result-${num}-${idx}`} style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'var(--primary)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}>
                            {num}
                        </div>
                    ))}
                </div>
            </section>


            {/* Recent Bets */}
            {
                recentBets.length > 0 && (
                    <section>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h2 style={{ fontSize: '1.125rem' }}>Apostas Recentes</h2>
                            <Link to="/minhas-apostas" style={{ color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 600 }}>
                                Ver todas →
                            </Link>
                        </div>
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {recentBets.map((bet, idx) => (
                                <div key={bet.id || `bet-${idx}`} style={{
                                    padding: '1rem',
                                    borderBottom: idx < recentBets.length - 1 ? '1px solid #eee' : 'none'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                            Concurso {bet.concurso}
                                        </span>
                                        <span className={`badge badge-${bet.status === 'pending' ? 'warning' : bet.status === 'confirmed' ? 'success' : bet.status === 'won' ? 'success' : 'neutral'}`}>
                                            {bet.status === 'pending' ? 'Pendente' : bet.status === 'confirmed' ? 'Confirmada' : bet.status === 'won' ? 'Premiado' : 'Não Premiado'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                        {bet.numbers.slice(0, 8).map((n, i) => (
                                            <span key={`${bet.id}-${n}-${i}`} style={{
                                                width: '26px',
                                                height: '26px',
                                                borderRadius: '50%',
                                                background: 'var(--muted)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                            }}>
                                                {n.toString().padStart(2, '0')}
                                            </span>
                                        ))}
                                        {bet.numbers.length > 8 && (
                                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', alignSelf: 'center' }}>
                                                +{bet.numbers.length - 8}
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.5rem' }}>
                                        Mínimo 5 acertos para ganhar
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )
            }

            {/* Account Settings / Pix Key */}
            <PixKeyUpdateSection />
        </div>
    );
}

import { getCurrentUser, updateUserPixKey, AuthUser } from '../lib/supabase';
import { Pencil, Check, X, AlertTriangle, KeyRound } from 'lucide-react';

function PixKeyUpdateSection() {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [editing, setEditing] = useState(false);
    const [newPixKey, setNewPixKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const currentUser = getCurrentUser();
        if (currentUser) {
            setUser(currentUser);
            setNewPixKey(currentUser.pix_key || '');
        }
    }, []);

    const handleUpdate = async () => {
        if (!user || !newPixKey.trim()) return;
        setLoading(true);
        setMessage(null);

        const result = await updateUserPixKey(user.id, newPixKey);

        if (result.success) {
            setMessage({ type: 'success', text: 'Chave Pix atualizada com sucesso!' });
            // Update local storage user
            const updatedUser = { ...user, pix_key: newPixKey };
            localStorage.setItem('lucky_user_v2', JSON.stringify(updatedUser));
            setUser(updatedUser);
            setEditing(false);
        } else {
            setMessage({ type: 'error', text: result.error || 'Erro ao atualizar.' });
        }
        setLoading(false);
    };

    if (!user) return null;

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <KeyRound size={20} /> Minha Chave Pix
                </h2>
                {!editing && (
                    <button onClick={() => setEditing(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }}>
                        <Pencil size={18} />
                    </button>
                )}
            </div>

            {editing ? (
                <div>
                    <input
                        type="text"
                        className="input"
                        value={newPixKey}
                        onChange={(e) => setNewPixKey(e.target.value)}
                        placeholder="Digite sua chave Pix"
                        style={{ width: '100%', marginBottom: '1rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={handleUpdate}
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.875rem' }}
                        >
                            {loading ? 'Salvando...' : <><Check size={16} /> Salvar</>}
                        </button>
                        <button
                            onClick={() => { setEditing(false); setNewPixKey(user.pix_key || ''); setMessage(null); }}
                            className="btn btn-outline"
                            style={{ flex: 1, padding: '0.5rem', fontSize: '0.875rem' }}
                        >
                            <X size={16} /> Cancelar
                        </button>
                    </div>
                    {message && (
                        <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: message.type === 'success' ? 'green' : 'red' }}>
                            {message.text}
                        </p>
                    )}
                </div>
            ) : (
                <div style={{ background: 'var(--muted)', padding: '0.75rem', borderRadius: '0.5rem', fontFamily: 'monospace', fontWeight: 600, textAlign: 'center', color: 'var(--foreground)' }}>
                    {user.pix_key || 'Nenhuma chave cadastrada'}
                </div>
            )}

            <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fff3e0', borderRadius: '0.5rem', border: '1px solid #ffe0b2', display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
                <AlertTriangle size={18} color="#f57c00" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '0.75rem', color: '#e65100', lineHeight: 1.4 }}>
                    <strong>Atenção:</strong> Evite mudar a chave com frequência ou em dia de Concurso para que não haja imprevistos no recebimento do prêmio.
                </p>
            </div>
        </section>
    );
}
