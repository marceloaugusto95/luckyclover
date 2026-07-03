import { useState, useEffect } from 'react';
import { DollarSign, Users, TrendingUp, Ticket, Trophy, Medal } from 'lucide-react';
import { getAdminMetrics, getRecentTransactions, checkWinners, getPrizeEstimates, AdminMetrics, Transaction, WinnerDetails, PrizeEstimate } from '../lib/supabase';
import { getMegaSenaResult, MegaSenaResult } from '../lib/mega-sena';

export default function DashboardPage() {
    const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [megaResult, setMegaResult] = useState<MegaSenaResult | null>(null);
    const [winners, setWinners] = useState<WinnerDetails[]>([]);
    const [estimates, setEstimates] = useState<PrizeEstimate | null>(null);
    const [nextEstimates, setNextEstimates] = useState<PrizeEstimate | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const [m, t, mega] = await Promise.all([
                getAdminMetrics(),
                getRecentTransactions(),
                getMegaSenaResult()
            ]);

            setMetrics(m);
            setTransactions(t);
            setMegaResult(mega);

            // If we have a result, check for winners
            if (mega) {
                // Fetch estimates for this contest (for winner prizes)
                const est = await getPrizeEstimates(mega.concurso);
                setEstimates(est);

                // Fetch estimates for next contest (for display)
                const nextEst = await getPrizeEstimates(mega.proximoConcurso);
                setNextEstimates(nextEst);

                // Parse winning numbers (they come as strings in API)
                const winningNums = mega.dezenas.map(d => parseInt(d));
                const winList = await checkWinners(mega.concurso, winningNums);
                setWinners(winList);
            }

            setLoading(false);
        };
        load();
    }, []);

    if (loading || !metrics) {
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

    // Metadados de cada faixa (tier) de acerto. O sistema é em cascata: nunca fica
    // sem ganhador — se ninguém faz Sena, o prêmio desce para a maior faixa premiada.
    const TIERS = [
        { hits: 6, name: 'SENA', desc: '6 acertos', color: '#2e7d32', bg: '#e8f5e9', border: '#a5d6a7' },
        { hits: 5, name: 'QUINA', desc: '5 acertos', color: '#ef6c00', bg: '#fff3e0', border: '#ffcc80' },
        { hits: 4, name: 'QUADRA', desc: '4 acertos', color: '#1565c0', bg: '#e3f2fd', border: '#90caf9' },
        { hits: 3, name: 'TERNO', desc: '3 acertos', color: '#6a1b9a', bg: '#f3e5f5', border: '#ce93d8' },
        { hits: 2, name: 'DUQUE', desc: '2 acertos', color: '#00838f', bg: '#e0f7fa', border: '#80deea' },
        { hits: 1, name: 'UM ACERTO', desc: '1 acerto', color: '#455a64', bg: '#eceff1', border: '#b0bec5' },
    ];

    // Agrupa os ganhadores por nº de acertos (o RPC já devolve só a faixa premiada).
    const winnersByHits: Record<number, WinnerDetails[]> = {};
    winners.forEach(w => {
        (winnersByHits[w.hits] = winnersByHits[w.hits] || []).push(w);
    });
    const maxHits = winners.reduce((m, w) => Math.max(m, w.hits), 0);

    // Prêmio individual por faixa, espelhando a cascata do backend:
    //  - Se há Sena (6): split normal (pool Sena / pool Quina);
    //  - Senão: 100% do prêmio vai para a maior faixa com ganhador.
    const prizeByHits: Record<number, number> = {};
    const pool = estimates?.prize_pool || 0;
    const count6 = winnersByHits[6]?.length || 0;
    const count5 = winnersByHits[5]?.length || 0;
    if (count6 > 0) {
        prizeByHits[6] = (estimates?.sena || 0) / count6;
        if (count5 > 0) prizeByHits[5] = (estimates?.quina || 0) / count5;
    } else if (maxHits >= 1) {
        const countTop = winnersByHits[maxHits]?.length || 0;
        if (countTop > 0) prizeByHits[maxHits] = pool / countTop;
    }

    // Faixas que de fato têm ganhadores (para renderizar os cards dinamicamente).
    const winningTiers = TIERS.filter(t => (winnersByHits[t.hits]?.length || 0) > 0);

    return (
        <div>
            {/* Metrics Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <MetricCard
                    title="Faturamento Total"
                    value={`R$ ${(metrics.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    icon={<DollarSign size={20} color="var(--primary)" />}
                    trend="+12% esse mês"
                    highlight
                />

                <MetricCard
                    title="Clientes Cadastrados"
                    value={(metrics.registeredClients || 0).toLocaleString('pt-BR')}
                    icon={<Users size={20} />}
                    subtitle={metrics.newClientsToday > 0 ? `+${metrics.newClientsToday} novos hoje` : 'Nenhum novo hoje'}
                />
                <MetricCard
                    title="Total de Apostas"
                    value={(metrics.totalBets || 0).toLocaleString('pt-BR')}
                    icon={<Ticket size={20} />}
                    subtitle={`Concurso ${megaResult?.concurso || '...'}`}
                />
            </div>

            {/* Prize Estimate Card (Current/Next Contest) */}
            {megaResult && (
                <section className="card" style={{ background: 'linear-gradient(135deg, #1a472a 0%, #2e7d32 100%)', color: 'white', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', color: 'white', fontWeight: 800 }}>
                                Prêmio Estimado
                            </h2>
                            <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                                Concurso #{megaResult.proximoConcurso} • {megaResult.dataProximoConcurso}
                            </p>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1.5rem', borderRadius: '0.5rem', backdropFilter: 'blur(5px)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '1rem', marginBottom: '0.5rem', fontWeight: 600, color: '#FFD700' }}>SENA</p>
                            <p style={{ fontSize: '2.5rem', fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                                {nextEstimates?.sena
                                    ? nextEstimates.sena.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : 'R$ 0,00'}
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: 600 }}>QUINA</p>
                                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                    {nextEstimates?.quina
                                        ? nextEstimates.quina.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                        : 'R$ 0,00'}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Winners Section */}
            {megaResult && (
                <div style={{ marginBottom: '2rem' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Trophy size={20} color="#FFD700" />
                        Resultados Concurso #{megaResult.concurso}
                    </h2>

                    {winningTiers.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                            {winningTiers.map(t => {
                                const count = winnersByHits[t.hits]?.length || 0;
                                const prize = prizeByHits[t.hits] || 0;
                                return (
                                    <div key={t.hits} className="card" style={{ background: t.bg, borderColor: t.border }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <strong style={{ color: t.color }}>{t.name} ({t.desc})</strong>
                                            <Medal size={24} color={t.color} />
                                        </div>
                                        <div style={{ fontSize: '2rem', fontWeight: 800, color: t.color }}>
                                            {count}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: t.color }}>
                                            {prize > 0
                                                ? `Prêmio Individual: R$ ${prize.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                : (t.hits === maxHits ? 'Faixa premiada (cascata)' : 'Ganhadores')}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="card" style={{ marginBottom: '1rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                            Nenhum ganhador apurado para este concurso ainda.
                        </div>
                    )}

                    {/* Table of Winners */}
                    {winners.length > 0 && (
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '1rem', borderBottom: '1px solid #eee', background: '#fafafa' }}>
                                <strong>Lista de Ganhadores</strong>
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>Nome</th>
                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>Acertos</th>
                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>Prêmio (Estimado)</th>
                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>Números Apostados</th>
                                        <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem' }}>PIX / Contato</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {winners.map(w => {
                                        const prize = prizeByHits[w.hits] || 0;
                                        return (
                                            <tr key={w.bet_id} style={{ borderBottom: '1px solid #eee' }}>
                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>{w.user_name}</td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <span className={`badge ${w.hits >= 6 ? 'badge-success' : 'badge-warning'}`} style={{ fontWeight: 800 }}>
                                                        {w.hits}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--primary)' }}>
                                                    R$ {(prize || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                        {w.bet_numbers.map(n => (
                                                            <span key={n} style={{
                                                                fontSize: '0.7rem',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                background: megaResult.dezenas.includes(n.toString().padStart(2, '0')) ? '#c8e6c9' : '#eee',
                                                                color: megaResult.dezenas.includes(n.toString().padStart(2, '0')) ? '#2e7d32' : 'inherit',
                                                                fontWeight: megaResult.dezenas.includes(n.toString().padStart(2, '0')) ? 700 : 400
                                                            }}>
                                                                {n.toString().padStart(2, '0')}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                                    <div>PIX: {w.user_pix}</div>
                                                    <div>Tel: {w.user_phone}</div>
                                                    {w.ticket_number && <div style={{ fontWeight: 600, color: 'var(--primary)' }}>Bilhete: {w.ticket_number}</div>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Recent Activity */}
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Últimas Movimentações</h2>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Descrição</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Data</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Valor</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transactions.map(t => (
                            <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1rem' }}>
                                    {t.description}
                                    {t.ticket_number && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>
                                            Bilhete: #{t.ticket_number}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1rem', color: 'var(--muted-foreground)' }}>{t.date}</td>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>+ R$ {t.amount.toFixed(2)}</td>
                                <td style={{ padding: '1rem' }}>
                                    <span className={`badge badge-${t.status === 'completed' ? 'success' : 'warning'}`}>
                                        {t.status === 'completed' ? 'Pago' : 'Pendente'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MetricCard({ title, value, icon, trend, subtitle, highlight }: {
    title: string;
    value: string;
    icon: React.ReactNode;
    trend?: string;
    subtitle?: string;
    highlight?: boolean;
}) {
    return (
        <div className="card" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            borderLeft: highlight ? '4px solid var(--primary)' : undefined
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{title}</span>
                {icon}
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{value}</div>
            {trend && <span style={{ fontSize: '0.75rem', color: '#2e7d32' }}><TrendingUp size={12} style={{ verticalAlign: 'middle' }} /> {trend}</span>}
            {subtitle && <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>{subtitle}</span>}
        </div>
    );
}
