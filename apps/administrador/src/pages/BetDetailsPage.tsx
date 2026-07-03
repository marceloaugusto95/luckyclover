import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBetDetails } from '../lib/supabase';
import { ArrowLeft, User, Hash, Trophy } from 'lucide-react';

interface BetDetails {
    id: string;
    concurso: number;
    numbers: number[];
    amount: number;
    status: string;
    payment_status: string;
    hits: number;
    created_at: string;
    ticket_number?: string;
    client_name?: string;
    client_phone?: string;
    client_cpf?: string;
    client_email?: string;
    client_pix?: string;
    profiles?: {
        id: string;
        full_name: string;
        cpf: string;
        phone: string;
        pix_key: string;
        cidade: string;
    };
    resellers?: {
        coupon_code: string;
        business_name: string;
    };
}

// Fetch winning numbers from Loterias API
async function fetchWinningNumbers(concurso: number): Promise<number[]> {
    try {
        const response = await fetch(`https://loteriascaixa-api.herokuapp.com/api/megasena/${concurso}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.dezenas?.map((d: string) => parseInt(d, 10)) || [];
    } catch {
        return [];
    }
}

export default function BetDetailsPage() {
    const { id } = useParams<{ id: string }>();
    const [bet, setBet] = useState<BetDetails | null>(null);
    const [winningNumbers, setWinningNumbers] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBet = async () => {
            const data: any = await getBetDetails(id!);

            if (!data) {
                setBet(null);
            } else {
                // Normalize profiles if it comes as an array (RPC usually handles this, but keeping safety)
                const profileData = data.profiles;
                const normalizedBet = {
                    ...data,
                    // If profiles is null from JSON but we have client info, that's fine. 
                    // The type matches BetDetails interface roughly.
                    profiles: Array.isArray(profileData) ? profileData[0] : profileData
                };

                setBet(normalizedBet);
                // Fetch winning numbers for this concurso
                const numbers = await fetchWinningNumbers(data.concurso);
                setWinningNumbers(numbers);
            }
            setLoading(false);
        };

        fetchBet();
    }, [id]);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="animate-spin" style={{
                    width: 32, height: 32,
                    border: '3px solid var(--muted)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%',
                    margin: '0 auto'
                }} />
            </div>
        );
    }

    if (!bet) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>Aposta não encontrada</div>;
    }

    // Calculate matches
    const matchedNumbers = winningNumbers.length > 0
        ? bet.numbers.filter((n: number) => winningNumbers.includes(n))
        : [];
    const matchCount = matchedNumbers.length;

    return (
        <div>
            <Link to="/clientes" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                color: 'var(--primary)',
                marginBottom: '1.5rem',
                fontWeight: 600
            }}>
                <ArrowLeft size={18} />
                Voltar para Apostas
            </Link>

            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {/* Cliente Info */}
                <div className="card">
                    <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <User size={18} color="var(--primary)" />
                        Dados do Cliente
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Nome</span>
                            <p style={{ fontWeight: 600 }}>{bet.client_name || bet.profiles?.full_name || 'N/A'}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>CPF</span>
                            <p style={{ fontWeight: 600 }}>{bet.profiles?.cpf || bet.client_cpf || 'N/A'}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Telefone</span>
                            <p style={{ fontWeight: 600 }}>{bet.client_phone || bet.profiles?.phone || 'N/A'}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Cidade</span>
                            <p style={{ fontWeight: 600 }}>{bet.profiles?.cidade || 'N/A'}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Chave PIX</span>
                            <p style={{ fontWeight: 600 }}>{bet.profiles?.pix_key || bet.client_pix || 'N/A'}</p>
                        </div>
                        {bet.client_email && (
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Email</span>
                                <p style={{ fontWeight: 600 }}>{bet.client_email}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bet Info */}
                <div className="card">
                    <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Hash size={18} color="var(--primary)" />
                        Dados da Aposta
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Número do Bilhete</span>
                            <p style={{ fontWeight: 800, color: 'var(--primary)', fontSize: '1.1rem' }}>{bet.ticket_number || 'N/A'}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Concurso</span>
                            <p style={{ fontWeight: 600 }}>#{bet.concurso}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Valor da Aposta</span>
                            <p style={{ fontWeight: 600, color: 'var(--primary)' }}>R$ {bet.amount.toFixed(2)}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Cupom / Revendedor</span>
                            <p style={{ fontWeight: 600, fontFamily: bet.resellers?.coupon_code ? 'monospace' : 'inherit' }}>
                                {bet.resellers?.coupon_code ? (
                                    <span style={{
                                        background: '#e8f5e9',
                                        color: '#2e7d32',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.875rem'
                                    }}>
                                        {bet.resellers.coupon_code}
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--muted-foreground)' }}>-</span>
                                )}
                            </p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Data</span>
                            <p style={{ fontWeight: 600 }}>{new Date(bet.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Status</span>
                            <p>
                                <span className={`badge badge-${bet.status === 'pending' ? 'warning' : 'success'}`}>
                                    {bet.status === 'pending' ? 'Pendente' : bet.status === 'won' ? 'Premiado' : 'Confirmada'}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Numbers Section */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
                <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Trophy size={18} color="var(--primary)" />
                    Números Apostados
                </h2>

                {winningNumbers.length > 0 ? (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
                            Números Sorteados (Concurso #{bet.concurso}):
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {winningNumbers.map((n: number) => (
                                <span key={n} style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    background: '#2e7d32',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.875rem',
                                    fontWeight: 700
                                }}>
                                    {n.toString().padStart(2, '0')}
                                </span>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--muted)', borderRadius: '8px' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                            ⏳ Aguardando resultado do concurso #{bet.concurso}
                        </p>
                    </div>
                )}

                <div style={{ marginBottom: '1.5rem' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.75rem' }}>
                        Números do Cliente ({bet.numbers.length} dezenas):
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {[...bet.numbers].sort((a, b) => a - b).map((n: number) => {
                            const isMatch = winningNumbers.includes(n);
                            return (
                                <span key={n} style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '50%',
                                    background: isMatch ? 'var(--primary)' : 'var(--muted)',
                                    color: isMatch ? 'white' : 'var(--foreground)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    border: isMatch ? '2px solid #2e7d32' : '1px solid #e0e0e0',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}>
                                    {n.toString().padStart(2, '0')}
                                </span>
                            );
                        })}
                    </div>
                </div>

                {/* Match Result */}
                {winningNumbers.length > 0 && (
                    <div style={{
                        padding: '1.5rem',
                        background: matchCount >= 5 ? '#e8f5e9' : '#fff3e0',
                        borderRadius: '12px',
                        textAlign: 'center'
                    }}>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: matchCount >= 5 ? '#2e7d32' : '#e65100' }}>
                            {matchCount} Acertos
                        </p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginTop: '0.5rem' }}>
                            {matchCount >= 6 ? 'SENA - Prêmio Principal!' :
                                matchCount === 5 ? 'QUINA - Ótimo resultado!' :
                                    'Não premiado (mínimo 5 acertos)'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
