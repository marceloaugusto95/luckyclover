import { useState, useEffect } from 'react';
import { getRecentSales, getResellerMetrics, Sale, ResellerMetrics, getResellerReport, ResellerReportItem, getCurrentUser, supabase } from '../lib/supabase';
import { TicketModal } from '../components/TicketModal';
import { FileText, ChevronDown, ChevronUp, X, Loader2, Printer, Check } from 'lucide-react';
import { printResellerReport } from '../lib/printer';
import { PrintEmulator } from '../components/PrintEmulator';
import { useBetRealtime } from '../hooks/useBetRealtime';

export default function VendasPage() {
    const [sales, setSales] = useState<Sale[]>([]);
    const [metrics, setMetrics] = useState<(ResellerMetrics & { currentConcurso?: number }) | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

    // Integrate Realtime
    useBetRealtime(sales, setSales);

    // Report State
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportData, setReportData] = useState<ResellerReportItem[]>([]);
    const [loadingReport, setLoadingReport] = useState(false);
    const [expandedConcursos, setExpandedConcursos] = useState<number[]>([]);
    const [isPrintingReport, setIsPrintingReport] = useState(false);
    const [virtualReport, setVirtualReport] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            const [salesData, metricsData] = await Promise.all([
                getRecentSales(),
                getResellerMetrics()
            ]);
            setSales(salesData);
            setMetrics(metricsData);
            setLoading(false);
        };
        loadData();
    }, []);

    const displaySales = metrics ? metrics.totalSales : 0;
    const displayCommission = metrics ? metrics.commission : 0;
    const currentConcurso = metrics?.currentConcurso;

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

    return (
        <div>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Minhas Vendas</h1>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div className="card" style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>
                        Total Vendido {currentConcurso ? `(Conc. ${currentConcurso})` : ''}
                    </p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                        R$ {(displaySales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="card" style={{ textAlign: 'center', borderLeft: '4px solid var(--primary)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>
                        Sua Comissão {currentConcurso ? `(Conc. ${currentConcurso})` : ''}
                    </p>
                    <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#2e7d32' }}>
                        R$ {(displayCommission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Sales List */}
            {sales.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                    <p style={{ color: 'var(--muted-foreground)' }}>Nenhuma venda registrada ainda.</p>
                </div>
            ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {sales.filter(s => s.status === 'confirmed').map((sale, idx) => (
                        <div key={sale.id} style={{
                            padding: '1rem',
                            borderBottom: idx < sales.length - 1 ? '1px solid #eee' : 'none'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: 600 }}>
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
                                </span>
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
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                                <span style={{ color: 'var(--muted-foreground)' }}>{sale.game}</span>
                                <div>
                                    <span>R$ {sale.amount.toFixed(2)}</span>
                                    <span style={{ color: '#2e7d32', marginLeft: '0.5rem' }}>+R$ {sale.commission.toFixed(2)}</span>
                                    {sale.ticket_number && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600, textAlign: 'right', marginTop: '2px' }}>
                                            Bilhete: #{sale.ticket_number}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedSale(sale)}
                                style={{
                                    width: '100%',
                                    marginTop: '0.75rem',
                                    fontSize: '0.8rem',
                                    padding: '0.4rem',
                                    background: '#f5f5f5',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Ver Detalhes
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '1.5rem' }}>
                <button
                    onClick={async () => {
                        const user = getCurrentUser();
                        if (!user) return;

                        setLoadingReport(true);
                        setShowReportModal(true);

                        // Get reseller ID first
                        const { data: reseller } = await supabase
                            .from('resellers')
                            .select('id')
                            .eq('user_id', user.id)
                            .single();

                        if (reseller) {
                            const data = await getResellerReport(reseller.id);
                            setReportData(data);
                            if (data.length > 0) {
                                setExpandedConcursos([data[0].concurso]);
                            }
                        }
                        setLoadingReport(false);
                    }}
                    className="btn btn-outline"
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        borderColor: 'var(--primary)',
                        color: 'var(--primary)',
                        padding: '0.75rem'
                    }}
                >
                    <FileText size={18} /> Ver Relatório Detalhado
                </button>
            </div>

            {/* Report Modal */}
            {showReportModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100,
                    padding: '1rem'
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
                        <div style={{ padding: '1.25rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Relatório de Vendas</h2>
                                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: '0.15rem 0 0 0' }}>Organizado por concurso</p>
                            </div>
                            <button
                                onClick={() => setShowReportModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)' }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                            {loadingReport ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader2 size={32} className="animate-spin" />
                                </div>
                            ) : reportData.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                                    Nenhuma venda paga encontrada.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {reportData.map(item => (
                                        <div key={item.concurso} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                                            <div
                                                onClick={() => {
                                                    setExpandedConcursos(prev =>
                                                        prev.includes(item.concurso)
                                                            ? prev.filter(c => c !== item.concurso)
                                                            : [...prev, item.concurso]
                                                    );
                                                }}
                                                style={{
                                                    padding: '0.875rem',
                                                    background: '#f9fafb',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <div style={{ display: 'flex', gap: '1.25rem' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block', textTransform: 'uppercase' }}>Conc.</span>
                                                        <span style={{ fontWeight: 700 }}>#{item.concurso}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block', textTransform: 'uppercase' }}>Vendas</span>
                                                        <span style={{ fontWeight: 700 }}>R$ {(Number(item.total_sales) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block', textTransform: 'uppercase' }}>Comissão</span>
                                                        <span style={{ fontWeight: 700, color: '#2e7d32' }}>R$ {(Number(item.total_commission) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                                {expandedConcursos.includes(item.concurso) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </div>

                                            {expandedConcursos.includes(item.concurso) && (
                                                <div style={{ padding: '0 0.875rem 0.875rem 0.875rem' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                        <thead style={{ borderBottom: '1px solid #eee' }}>
                                                            <tr>
                                                                <th style={{ padding: '0.6rem 0', textAlign: 'left' }}>Data</th>
                                                                <th style={{ padding: '0.6rem 0', textAlign: 'left' }}>Cliente</th>
                                                                <th style={{ padding: '0.6rem 0', textAlign: 'left' }}>Bilhete</th>
                                                                <th style={{ padding: '0.6rem 0', textAlign: 'right' }}>Valor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {item.bets.map(bet => (
                                                                <tr key={bet.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                                                                    <td style={{ padding: '0.4rem 0' }}>{new Date(bet.created_at).toLocaleDateString('pt-BR')}</td>
                                                                    <td style={{ padding: '0.4rem 0' }}>{bet.client_name || 'Anônimo'}</td>
                                                                    <td style={{ padding: '0.4rem 0' }}>{bet.ticket_number ? `#${bet.ticket_number}` : '-'}</td>
                                                                    <td style={{ padding: '0.4rem 0', textAlign: 'right' }}>R$ {(Number(bet.amount) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '1rem', borderTop: '1px solid #eee', background: '#f9fafb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block' }}>Total de Vendas</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                                            R$ {(reportData.reduce((acc, curr) => acc + Number(curr.total_sales), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block' }}>Total de Comissão</span>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2e7d32' }}>
                                            R$ {(reportData.reduce((acc, curr) => acc + Number(curr.total_commission), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        const user = getCurrentUser();
                                        if (!user) return;
                                        setIsPrintingReport(true);
                                        const result = await printResellerReport(reportData, user.full_name);
                                        if (!result.success && result.virtualTicket) {
                                            setVirtualReport(result.virtualTicket);
                                        }
                                        setIsPrintingReport(false);
                                    }}
                                    className="btn btn-outline"
                                    style={{
                                        fontSize: '0.85rem',
                                        padding: '0.5rem 1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        color: 'var(--primary)',
                                        borderColor: 'var(--primary)'
                                    }}
                                    disabled={isPrintingReport || reportData.length === 0}
                                >
                                    <Printer size={18} /> {isPrintingReport ? 'Imprimindo...' : 'Imprimir'}
                                </button>
                                <button
                                    onClick={() => setShowReportModal(false)}
                                    className="btn btn-primary"
                                    style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {virtualReport && (
                <PrintEmulator
                    content={virtualReport}
                    onClose={() => setVirtualReport(null)}
                />
            )}

            <TicketModal
                sale={selectedSale}
                onClose={() => setSelectedSale(null)}
            />
        </div>
    );
}
