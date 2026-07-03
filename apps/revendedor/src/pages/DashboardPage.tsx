import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Users, TrendingUp, Ticket, Printer, Check, Loader2 } from 'lucide-react';
import { getResellerMetrics, getRecentSales, ResellerMetrics, Sale, getWinners, getPrizeEstimates, PrizeEstimate, supabase, Winner } from '../lib/supabase';
import { getMegaSenaResult, MegaSenaResult } from '../lib/mega-sena';
import { printContestResult } from '../lib/printer';
import { TicketModal } from '../components/TicketModal';
import { useBetRealtime } from '../hooks/useBetRealtime';

export default function DashboardPage() {
    const [metrics, setMetrics] = useState<(ResellerMetrics & { currentConcurso?: number }) | null>(null);
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

    // Integarte Realtime
    useBetRealtime(sales, setSales);

    // Result Data
    const [resultData, setResultData] = useState<{ mega: MegaSenaResult; winnersSena: number; winnersQuina: number } | null>(null);
    const [prizeEstimate, setPrizeEstimate] = useState<PrizeEstimate | null>(null);
    const [printingResult, setPrintingResult] = useState(false);

    const load = async () => {
        const [m, s, megaResult] = await Promise.all([
            getResellerMetrics(),
            getRecentSales(),
            getMegaSenaResult()
        ]);

        setMetrics(m);
        setSales(s);

        // Load winners and estimates
        try {
            if (megaResult && megaResult.dezenas && megaResult.dezenas.length > 0) {
                const [winners, estimates] = await Promise.all([
                    getWinners(megaResult.concurso),
                    getPrizeEstimates(megaResult.proximoConcurso)
                ]);

                const sena = winners.filter((w: Winner) => w.hits === 6).length;
                const quina = winners.filter((w: Winner) => w.hits === 5).length;

                setResultData({
                    mega: megaResult,
                    winnersSena: sena,
                    winnersQuina: quina
                });
                setPrizeEstimate(estimates);
            }
        } catch (e) {
            console.error("Error loading extra data", e);
        }

        setLoading(false);
    };

    useEffect(() => {
        let isMounted = true;
        let subscribed = false;

        load();

        // Subscribe to contests changes
        const channel = supabase
            .channel('concursos_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'concursos' },
                () => {
                    if (isMounted) {
                        console.log('Contest update detected, refreshing data...');
                        load();
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

    const handlePrintResult = async () => {
        if (!resultData) return;
        setPrintingResult(true);
        try {
            await printContestResult({
                concurso: resultData.mega.concurso,
                date: resultData.mega.data,
                numbers: resultData.mega.dezenas,
                winnersSena: resultData.winnersSena,
                winnersQuina: resultData.winnersQuina
            });
        } finally {
            setPrintingResult(false);
        }
    };

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

    return (
        <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Painel do Revendedor</h1>

            {/* Metrics Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
                marginBottom: '1.5rem'
            }}>
                <MetricCard
                    title={metrics.currentConcurso ? `Vendas (Conc. ${metrics.currentConcurso})` : "Vendas (Sem concurso)"}
                    value={`R$ ${(metrics.totalSales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    icon={<DollarSign size={18} color="var(--primary)" />}
                    highlight
                />
                <MetricCard
                    title={metrics.currentConcurso ? `Comissão (Conc. ${metrics.currentConcurso})` : "Comissão (Sem concurso)"}
                    value={`R$ ${(metrics.commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    icon={<TrendingUp size={18} color="#F57C00" />}
                    valueColor="#2e7d32"
                />
                <MetricCard
                    title="Clientes Ativos"
                    value={metrics.activeClients.toString()}
                    icon={<Users size={18} />}
                />
                <MetricCard
                    title="Apostas Hoje"
                    value={metrics.todaysBets.toString()}
                    icon={<Ticket size={18} />}
                />
            </div>

            {/* Prize Estimate Card (Current/Next Contest) */}
            {resultData && (
                <section className="card" style={{ background: 'linear-gradient(135deg, #1a472a 0%, #2e7d32 100%)', color: 'white', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', color: 'white', fontWeight: 800 }}>
                                Prêmio Estimado
                            </h2>
                            <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                                Concurso #{resultData.mega.proximoConcurso} • {resultData.mega.dataProximoConcurso}
                            </p>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1.5rem', borderRadius: '0.5rem', backdropFilter: 'blur(5px)' }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '1rem', marginBottom: '0.5rem', fontWeight: 600, color: '#FFD700' }}>SENA</p>
                            <p style={{ fontSize: '2.5rem', fontWeight: 900, textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                                {prizeEstimate?.sena
                                    ? prizeEstimate.sena.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                    : 'R$ 0,00'}
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                            <div style={{ textAlign: 'center' }}>
                                <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem', fontWeight: 600 }}>QUINA</p>
                                <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                    {prizeEstimate?.quina
                                        ? prizeEstimate.quina.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                        : 'R$ 0,00'}
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Result Section (Last Contest) */}
            {resultData && (
                <section className="card" style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                            <h2 style={{ fontSize: '1.125rem', color: 'var(--primary)', fontWeight: 700 }}>
                                Resultado Anterior #{resultData.mega.concurso}
                            </h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{resultData.mega.data}</p>
                        </div>
                        <button
                            className="btn btn-outline"
                            onClick={handlePrintResult}
                            disabled={printingResult}
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', gap: '0.25rem' }}
                        >
                            <Printer size={14} />
                            {printingResult ? '...' : 'Imprimir'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', margin: '1.5rem 0' }}>
                        {resultData.mega.dezenas.map((num) => (
                            <div key={num} style={{
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#f5f5f5', padding: '0.75rem', borderRadius: '8px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '0.75rem', color: '#666' }}>Ganhadores Sena</p>
                            <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{resultData.winnersSena}</p>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ fontSize: '0.75rem', color: '#666' }}>Ganhadores Quina</p>
                            <p style={{ fontWeight: 800, fontSize: '1.1rem' }}>{resultData.winnersQuina}</p>
                        </div>
                    </div>
                </section>
            )}

            {/* Recent Sales */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.125rem' }}>Vendas Recentes</h2>
                <Link to="/nova-aposta" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>
                    Nova Aposta
                </Link>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {sales.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>
                        Nenhuma venda recente.
                    </div>
                ) : (
                    sales.map((sale, idx) => (
                        <div key={sale.id} style={{
                            padding: '1rem',
                            borderBottom: idx < sales.length - 1 ? '1px solid #eee' : 'none',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                    {sale.client_name}
                                    {sale.client_phone && (
                                        <span style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--muted-foreground)',
                                            fontWeight: 400,
                                            marginLeft: '0.5rem'
                                        }}>
                                            {sale.client_phone}
                                        </span>
                                    )}
                                </p>
                                <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                    High Five • R$ {sale.amount.toFixed(2)}
                                </p>
                                <p style={{ fontSize: '0.65rem', color: '#888', marginTop: '0.25rem' }}>
                                    Conc. {sale.concurso} {sale.ticket_number && `• Bilhete: #${sale.ticket_number}`}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ color: '#2e7d32', fontWeight: 600, fontSize: '0.875rem' }}>
                                    + R$ {sale.commission.toFixed(2)}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem', marginTop: '0.25rem' }}>
                                    {sale.status === 'confirmed' ? (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            background: '#e6f4ea',
                                            color: '#1e7e34',
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 700
                                        }}>
                                            <Check size={14} strokeWidth={3} /> V
                                        </div>
                                    ) : (
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem',
                                            background: '#fff3cd',
                                            color: '#856404',
                                            padding: '0.1rem 0.4rem',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600
                                        }}>
                                            <Loader2 size={12} className="animate-spin" /> Aguardando
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setSelectedSale(sale)}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        marginTop: '0.5rem',
                                        fontSize: '0.75rem',
                                        color: 'var(--primary)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        textAlign: 'right',
                                        fontWeight: 600
                                    }}
                                >
                                    Ver Detalhes
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <TicketModal
                sale={selectedSale}
                onClose={() => setSelectedSale(null)}
            />
        </div>
    );
}

function MetricCard({ title, value, icon, highlight, valueColor }: {
    title: string;
    value: string;
    icon: React.ReactNode;
    highlight?: boolean;
    valueColor?: string;
}) {
    return (
        <div className="card" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            borderLeft: highlight ? '4px solid var(--primary)' : undefined
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--muted-foreground)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{title}</span>
                {icon}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: valueColor }}>
                {value}
            </div>
        </div>
    );
}
