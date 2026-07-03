import { useState, useEffect, useRef } from 'react';
import { Modal } from '../components/Modal';
import {
    getContestStats,
    getConcursos,
    processDraw,
    getWinners,
    getPrizeEstimates,
    createConcurso,
    updateConcursoDate,
    type Winner,
    type ContestStat,
    type PrizeEstimate,
    getContestReportBets
} from '../lib/supabase';
import { Users, AlertCircle, Calendar, DollarSign, Play, Trophy, RefreshCw, Download, FileText, Plus } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateIndividualFinancialReport, generateGeneralFinancialReport } from '../utils/pdf-reports';
import { generateIndividualFinancialReportExcel } from '../utils/excel-reports';

interface ContestDisplay {
    concurso: number;
    date: string;
    drawnNumbers: number[];
    // Internal stats
    totalRevenue: number;
    totalBets: number;
    totalCommission: number;
    prizeEstimate: PrizeEstimate | null;
    winners: Winner[];
    processed: boolean;
}

export default function ConcursosPage() {
    const [contests, setContests] = useState<ContestDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processing, setProcessing] = useState<number | null>(null);
    const [processResult, setProcessResult] = useState<{
        success: boolean;
        data?: {
            bets_processed: number;
            winners_sena: number;
            winners_quina: number;
            winners_quadra: number;
            winners_list?: Winner[];
        };
        error?: string;
    } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [lastProcessedConcurso, setLastProcessedConcurso] = useState<number | null>(null);

    // New Contest modal state
    const [isNewContestModalOpen, setIsNewContestModalOpen] = useState(false);
    const [newContestNumber, setNewContestNumber] = useState('');
    const [newContestDate, setNewContestDate] = useState('');
    const [creatingContest, setCreatingContest] = useState(false);
    const [createContestError, setCreateContestError] = useState<string | null>(null);

    // Manual number entry state: { [concurso]: number[] }
    const [manualNumbers, setManualNumbers] = useState<Record<number, string[]>>({});
    const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

    useEffect(() => {
        fetchContestData();
    }, []);

    const fetchContestData = async () => {
        setLoading(true);
        try {
            // Stats internas + concursos do DB em paralelo
            const [statsData, concursosData] = await Promise.all([
                getContestStats(),
                getConcursos(),
            ]);

            // Build a unified set of concurso numbers
            const concursoSet = new Set<number>();
            statsData.forEach((s: ContestStat) => concursoSet.add(s.concurso));
            concursosData.forEach(c => concursoSet.add(c.concurso_number));

            // Hidrata cada concurso em paralelo (e winners+estimativa concorrentes),
            // em vez de sequencialmente — elimina o gargalo de ~N requisições em série.
            const displayData: ContestDisplay[] = await Promise.all(
                Array.from(concursoSet).map(async (concursoNum): Promise<ContestDisplay> => {
                    const stat = statsData.find((s: ContestStat) => s.concurso === concursoNum);
                    const stored = concursosData.find(c => c.concurso_number === concursoNum);

                    const drawnNumbers = stored?.drawn_numbers || [];

                    // Get winners if we have bets for this contest
                    let winners: Winner[] = [];
                    let prizeEstimate: PrizeEstimate | null = null;

                    if (stat && stat.total_bets > 0) {
                        [winners, prizeEstimate] = await Promise.all([
                            getWinners(concursoNum),
                            getPrizeEstimates(concursoNum),
                        ]);
                    }

                    return {
                        concurso: concursoNum,
                        date: stored?.draw_date || '',
                        drawnNumbers,
                        totalRevenue: Number(stat?.total_revenue) || 0,
                        totalBets: Number(stat?.total_bets) || 0,
                        totalCommission: Number(stat?.total_commission) || 0,
                        prizeEstimate,
                        winners,
                        processed: stored?.status === 'closed' && drawnNumbers.length > 0 && drawnNumbers.some(n => n !== 0)
                    };
                })
            );

            // Sort by concurso number descending
            displayData.sort((a, b) => b.concurso - a.concurso);

            setContests(displayData);

            // Initialize manualNumbers from existing drawn numbers
            const initNumbers: Record<number, string[]> = {};
            displayData.forEach(d => {
                if (d.drawnNumbers.length > 0 && d.drawnNumbers.some(n => n !== 0)) {
                    initNumbers[d.concurso] = d.drawnNumbers.map(n => n.toString().padStart(2, '0'));
                }
            });
            setManualNumbers(prev => ({ ...initNumbers, ...prev }));
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchContestData();
        setRefreshing(false);
    };

    const handleOpenNewContestModal = () => {
        // Suggest next contest number
        const maxConcurso = contests.length > 0 ? Math.max(...contests.map(c => c.concurso)) : 0;
        setNewContestNumber(String(maxConcurso + 1));
        setNewContestDate('');
        setCreateContestError(null);
        setIsNewContestModalOpen(true);
    };

    const handleCreateContest = async () => {
        const num = parseInt(newContestNumber, 10);
        if (isNaN(num) || num <= 0) {
            setCreateContestError('Número do concurso inválido.');
            return;
        }
        if (!newContestDate) {
            setCreateContestError('Informe a data do concurso.');
            return;
        }

        setCreatingContest(true);
        setCreateContestError(null);

        const result = await createConcurso(num, newContestDate);

        if (result.success) {
            setIsNewContestModalOpen(false);
            await fetchContestData();
        } else {
            setCreateContestError(result.error || 'Erro ao criar concurso.');
        }

        setCreatingContest(false);
    };

    const handleDateChange = async (concurso: number, newDate: string) => {
        const result = await updateConcursoDate(concurso, newDate);
        if (result.success) {
            // Update local state
            setContests(prev => prev.map(c =>
                c.concurso === concurso ? { ...c, date: newDate } : c
            ));
        } else {
            alert('Erro ao atualizar data: ' + (result.error || 'Erro desconhecido'));
        }
    };

    const handleManualNumberChange = (concurso: number, index: number, value: string) => {
        // Only allow numbers 1-60
        const cleaned = value.replace(/\D/g, '');
        const num = parseInt(cleaned, 10);
        if (cleaned !== '' && (num < 1 || num > 60)) return;

        setManualNumbers(prev => {
            const current = prev[concurso] || ['', '', '', '', '', ''];
            const updated = [...current];
            updated[index] = cleaned;
            return { ...prev, [concurso]: updated };
        });

        // Auto-advance to next input when 2 digits are entered
        if (cleaned.length === 2 && index < 5) {
            const nextKey = `${concurso}-${index + 1}`;
            inputRefs.current[nextKey]?.focus();
        }
    };

    const getManualDrawnNumbers = (concurso: number): number[] | null => {
        const entries = manualNumbers[concurso];
        if (!entries) return null;

        const nums = entries.map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 1 && n <= 60);
        // Must have exactly 6 unique numbers
        const unique = [...new Set(nums)];
        if (unique.length !== 6) return null;
        return unique;
    };

    const handleProcessDraw = async (concursoNumber: number, drawnNumbers: number[], drawDate: string) => {
        setProcessing(concursoNumber);
        setProcessResult(null);

        try {
            // First, ensure the concurso exists in the database with the drawn numbers
            const { supabase } = await import('../lib/supabase');

            // Upsert concurso with the provided draw date and drawn numbers
            const { error: upsertError } = await supabase
                .from('concursos')
                .upsert({
                    concurso_number: concursoNumber,
                    draw_date: drawDate,
                    drawn_numbers: drawnNumbers,
                    status: 'closed'
                }, { onConflict: 'concurso_number' });

            if (upsertError) {
                setProcessResult({ success: false, error: `Erro ao registrar concurso: ${upsertError.message}` });
                setIsModalOpen(true);
                setProcessing(null);
                return;
            }

            // Now process the draw
            const result = await processDraw(concursoNumber);
            setProcessing(null);

            if (result.success && result.data) {
                // Fetch winners details immediately
                const winnersList = await getWinners(concursoNumber);

                await fetchContestData();
                setProcessResult({
                    success: true,
                    data: {
                        bets_processed: result.data.bets_processed,
                        winners_sena: result.data.winners_sena,
                        winners_quina: result.data.winners_quina,
                        winners_quadra: result.data.winners_quadra,
                        winners_list: winnersList
                    }
                });
                setLastProcessedConcurso(concursoNumber);
                setIsModalOpen(true);
            } else {
                setProcessResult({ success: false, error: result.error || 'Erro desconhecido ao processar' });
                setIsModalOpen(true);
            }
        } catch (error) {
            console.error(error);
            setProcessing(null);
            setProcessResult({ success: false, error: 'Erro inesperado ao processar sorteio.' });
            setIsModalOpen(true);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <div className="animate-spin" style={{
                    width: 32, height: 32,
                    border: '3px solid var(--muted)',
                    borderTopColor: 'var(--primary)',
                    borderRadius: '50%'
                }} />
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className="btn btn-primary"
                        onClick={handleOpenNewContestModal}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Plus size={18} />
                        Novo Concurso
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={() => {
                            const contestData = contests.map(c => {
                                const prizePool = c.prizeEstimate?.prize_pool || 0;
                                return {
                                    ...c,
                                    totalPrizesPaid: prizePool,
                                    houseProfit: c.totalRevenue - c.totalCommission - prizePool
                                };
                            });
                            generateGeneralFinancialReport(contestData);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <FileText size={18} />
                        Relatório Geral
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Atualizando...' : 'Atualizar'}
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gap: '1.5rem' }}>
                {contests.length === 0 ? (
                    <div style={{
                        padding: '3rem',
                        textAlign: 'center',
                        background: 'var(--card)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border)'
                    }}>
                        <AlertCircle size={48} style={{ margin: '0 auto 1rem', color: 'var(--muted-foreground)' }} />
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Nenhum concurso encontrado</h3>
                        <p style={{ color: 'var(--muted-foreground)' }}>Não há concursos com apostas registradas no sistema.</p>
                    </div>
                ) : (
                    contests.map((contest) => {
                        const manualDrawn = getManualDrawnNumbers(contest.concurso);

                        let cascadedPrizes: Record<number, number> = {};
                        if (contest.prizeEstimate) {
                            const pool = contest.prizeEstimate.prize_pool || 0;
                            const hitsCount: Record<number, number> = {};
                            contest.winners.forEach(w => {
                                hitsCount[w.hits] = (hitsCount[w.hits] || 0) + 1;
                            });

                            if (contest.processed && Object.keys(hitsCount).length > 0) {
                                if (hitsCount[6] && hitsCount[5]) {
                                    cascadedPrizes[6] = pool * 0.70;
                                    cascadedPrizes[5] = pool * 0.30;
                                } else if (hitsCount[6]) {
                                    cascadedPrizes[6] = pool;
                                } else if (hitsCount[5]) {
                                    cascadedPrizes[5] = pool;
                                } else if (hitsCount[4]) {
                                    cascadedPrizes[4] = pool;
                                } else if (hitsCount[3]) {
                                    cascadedPrizes[3] = pool;
                                } else if (hitsCount[2]) {
                                    cascadedPrizes[2] = pool;
                                } else if (hitsCount[1]) {
                                    cascadedPrizes[1] = pool;
                                }
                            } else {
                                // Default static estimate if not processed or no winners
                                cascadedPrizes[6] = contest.prizeEstimate.sena || (pool * 0.70);
                                cascadedPrizes[5] = contest.prizeEstimate.quina || (pool * 0.30);
                            }
                        }

                        return (
                            <div key={contest.concurso} className="card">
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: '1.5rem',
                                    flexWrap: 'wrap',
                                    gap: '1rem'
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                                                Concurso #{contest.concurso}
                                            </h2>
                                            {contest.processed ? (
                                                <span className="badge" style={{ background: '#2e7d32', color: 'white' }}>Processado</span>
                                            ) : (
                                                <span className="badge badge-success">Aberto</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                                            {/* Editable Date */}
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                <Calendar size={14} />
                                                <input
                                                    type="date"
                                                    value={contest.date}
                                                    onChange={e => handleDateChange(contest.concurso, e.target.value)}
                                                    style={{
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '0.25rem',
                                                        padding: '0.2rem 0.4rem',
                                                        fontSize: '0.875rem',
                                                        background: 'var(--card)',
                                                        color: 'var(--foreground)',
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                            </span>
                                            {contest.totalBets > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <Users size={14} /> {contest.totalBets} apostas internas
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <button
                                            className="btn btn-ghost p-2"
                                            onClick={async () => {
                                                const bets = await getContestReportBets(contest.concurso);
                                                generateIndividualFinancialReportExcel({
                                                    ...contest,
                                                    houseProfit: contest.totalRevenue - contest.totalCommission,
                                                    prizePool: contest.prizeEstimate?.prize_pool,
                                                    senaPrize: contest.prizeEstimate?.sena,
                                                    quinaPrize: contest.prizeEstimate?.quina
                                                }, bets);
                                            }}
                                            title="Gerar Relatório Excel"
                                        >
                                            Excel
                                        </button>
                                        <button
                                            className="btn btn-ghost p-2"
                                            onClick={async () => {
                                                const bets = await getContestReportBets(contest.concurso);
                                                generateIndividualFinancialReport({
                                                    ...contest,
                                                    houseProfit: contest.totalRevenue - contest.totalCommission,
                                                    prizePool: contest.prizeEstimate?.prize_pool,
                                                    senaPrize: contest.prizeEstimate?.sena,
                                                    quinaPrize: contest.prizeEstimate?.quina
                                                }, bets);
                                            }}
                                            title="Gerar Relatório Financeiro"
                                        >
                                            PDF
                                        </button>
                                        {contest.totalRevenue > 0 && (
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>Arrecadação</p>
                                                <p style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2e7d32', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <DollarSign size={18} />
                                                    {(contest.totalRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Always visible Number Entry */}
                                <div style={{
                                    marginBottom: '1.5rem',
                                    padding: '1rem',
                                    background: 'rgba(25, 118, 210, 0.08)',
                                    borderRadius: '0.5rem',
                                    border: '1px solid rgba(25, 118, 210, 0.2)'
                                }}>
                                    <p style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: '#1976d2' }}>
                                        Dezenas Sorteadas (6 números de 01 a 60)
                                    </p>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {[0, 1, 2, 3, 4, 5].map(i => (
                                            <input
                                                key={i}
                                                ref={el => { inputRefs.current[`${contest.concurso}-${i}`] = el; }}
                                                type="text"
                                                inputMode="numeric"
                                                maxLength={2}
                                                value={(manualNumbers[contest.concurso] || [])[i] || ''}
                                                onChange={e => handleManualNumberChange(contest.concurso, i, e.target.value)}
                                                placeholder={String(i + 1).padStart(2, '0')}
                                                style={{
                                                    width: 48,
                                                    height: 48,
                                                    textAlign: 'center',
                                                    fontSize: '1.1rem',
                                                    fontWeight: 700,
                                                    borderRadius: '50%',
                                                    border: '2px solid #1976d2',
                                                    background: 'white',
                                                    color: '#1976d2',
                                                    outline: 'none',
                                                }}
                                            />
                                        ))}
                                        <button
                                            className="btn btn-primary"
                                            disabled={!manualDrawn || processing === contest.concurso}
                                            onClick={() => {
                                                if (manualDrawn) {
                                                    handleProcessDraw(contest.concurso, manualDrawn, contest.date);
                                                }
                                            }}
                                            style={{
                                                marginLeft: '0.75rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                opacity: manualDrawn ? 1 : 0.5
                                            }}
                                        >
                                            <Play size={16} />
                                            {processing === contest.concurso
                                                ? 'Processando...'
                                                : contest.processed
                                                    ? 'Reprocessar'
                                                    : 'Processar Apostas'}
                                        </button>
                                    </div>
                                    {manualNumbers[contest.concurso] && manualNumbers[contest.concurso].some(s => s !== '') && !manualDrawn && (
                                        <p style={{ fontSize: '0.75rem', color: '#f57c00', marginTop: '0.5rem' }}>
                                            Informe 6 números únicos de 01 a 60.
                                        </p>
                                    )}
                                </div>

                                {/* Winner Counts - Sena, Quina */}
                                <div style={{
                                    display: 'flex',
                                    gap: '1rem',
                                    marginBottom: '1rem',
                                    flexWrap: 'wrap'
                                }}>
                                    <div style={{
                                        padding: '0.5rem 1rem',
                                        background: contest.winners.filter(w => w.hits === 6).length > 0 ? '#2e7d32' : '#e0e0e0',
                                        color: contest.winners.filter(w => w.hits === 6).length > 0 ? 'white' : '#666',
                                        borderRadius: '0.375rem',
                                        textAlign: 'center',
                                        minWidth: '80px'
                                    }}>
                                        <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                                            {contest.winners.filter(w => w.hits === 6).length}
                                        </p>
                                        <p style={{ fontSize: '0.75rem', margin: 0 }}>Sena</p>
                                    </div>
                                    <div style={{
                                        padding: '0.5rem 1rem',
                                        background: contest.winners.filter(w => w.hits === 5).length > 0 ? '#ef6c00' : '#e0e0e0',
                                        color: contest.winners.filter(w => w.hits === 5).length > 0 ? 'white' : '#666',
                                        borderRadius: '0.375rem',
                                        textAlign: 'center',
                                        minWidth: '80px'
                                    }}>
                                        <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                                            {contest.winners.filter(w => w.hits === 5).length}
                                        </p>
                                        <p style={{ fontSize: '0.75rem', margin: 0 }}>Quina</p>
                                    </div>
                                </div>

                                {/* Prize Estimate for contests with bets */}
                                {contest.prizeEstimate && contest.totalBets > 0 && (
                                    <div style={{
                                        marginBottom: '1rem',
                                        padding: '0.75rem',
                                        background: 'rgba(46, 125, 50, 0.1)',
                                        borderRadius: '0.375rem',
                                        fontSize: '0.875rem'
                                    }}>
                                        <strong>Premiação Interna:</strong> Pool: R$ {contest.prizeEstimate.prize_pool?.toLocaleString('pt-BR') || '0'}
                                        {Object.entries(cascadedPrizes)
                                            .sort(([a], [b]) => Number(b) - Number(a))
                                            .map(([hits, prize]) => (
                                                <span key={hits}>
                                                    {' | '}{hits === '6' ? 'Sena' : hits === '5' ? 'Quina' : `Acertos (${hits})`}: R$ {prize.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            ))}
                                    </div>
                                )}

                                {/* Winners Section */}
                                {contest.winners.length > 0 && (
                                    <div style={{
                                        marginTop: '1rem',
                                        padding: '1rem',
                                        background: '#e8f5e9',
                                        borderRadius: '0.5rem',
                                        border: '1px solid #c8e6c9'
                                    }}>
                                        <h3 style={{
                                            fontSize: '1rem',
                                            fontWeight: 700,
                                            color: '#1b5e20',
                                            marginBottom: '1rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}>
                                            <Trophy size={18} /> Ganhadores ({contest.winners.length})
                                        </h3>
                                        <div style={{ display: 'grid', gap: '0.75rem' }}>

                                            {contest.winners.map((winner) => {
                                                const hitsCount = contest.winners.filter(w => w.hits === winner.hits).length;

                                                let prize = 0;
                                                if (cascadedPrizes[winner.hits] && hitsCount > 0) {
                                                    prize = cascadedPrizes[winner.hits] / hitsCount;
                                                }

                                                return (
                                                    <div key={winner.bet_id} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        background: 'white',
                                                        padding: '0.75rem',
                                                        borderRadius: '0.375rem',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                                    }}>
                                                        <div>
                                                            <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.125rem' }}>
                                                                {winner.full_name || winner.client_name || 'Cliente'}
                                                                {winner.ticket_number && (
                                                                    <span style={{ 
                                                                        marginLeft: '0.5rem', 
                                                                        fontSize: '0.75rem', 
                                                                        color: 'var(--muted-foreground)', 
                                                                        fontWeight: 'normal',
                                                                        background: '#f1f5f9',
                                                                        padding: '0.125rem 0.375rem',
                                                                        borderRadius: '0.25rem'
                                                                    }}>
                                                                        #{winner.ticket_number}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', marginBottom: '0.375rem' }}>
                                                                <span>Tel: {winner.phone || winner.client_phone || 'Não informado'}</span>
                                                                {winner.pix_key && <span>Pix: {winner.pix_key}</span>}
                                                            </div>
                                                            {winner.numbers && winner.numbers.length > 0 && (
                                                                <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.75rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                                                                    {winner.numbers.map((n, i) => {
                                                                        const isDrawn = contest.drawnNumbers.includes(n);
                                                                        return (
                                                                            <span key={i} style={{ 
                                                                                background: isDrawn ? '#e8f5e9' : '#f5f5f5', 
                                                                                color: isDrawn ? '#2e7d32' : '#666',
                                                                                padding: '0.125rem 0.375rem', 
                                                                                borderRadius: '0.25rem',
                                                                                border: `1px solid ${isDrawn ? '#a5d6a7' : '#e0e0e0'}`,
                                                                                fontWeight: isDrawn ? 600 : 400
                                                                            }}>
                                                                                {n.toString().padStart(2, '0')}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                            {prize > 0 && (
                                                                <div style={{ marginTop: '0.25rem', color: '#2e7d32', fontWeight: 700, fontSize: '0.85rem' }}>
                                                                    Prêmio: R$ {prize.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <span style={{
                                                                background: winner.hits === 6 ? '#2e7d32' : winner.hits === 5 ? '#ef6c00' : '#f57c00',
                                                                color: 'white',
                                                                fontWeight: 700,
                                                                fontSize: '0.75rem',
                                                                padding: '0.25rem 0.5rem',
                                                                borderRadius: '999px'
                                                            }}>
                                                                {winner.hits} acertos
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={processResult?.success ? "Resultado do Processamento" : "Erro no Processamento"}
            >
                {processResult && (
                    <div style={{ textAlign: 'center' }}>
                        {processResult.success ? (
                            <>
                                <div style={{
                                    width: 64, height: 64,
                                    background: '#e8f5e9',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.5rem',
                                    color: '#2e7d32'
                                }}>
                                    <Trophy size={32} />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
                                    Sorteio Processado com Sucesso!
                                </h3>
                                <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                                    Foram verificadas <strong>{processResult.data?.bets_processed}</strong> apostas.
                                </p>

                                <button
                                    className="btn btn-outline"
                                    onClick={async () => {
                                        if (!lastProcessedConcurso || !processResult.data) return;

                                        const contest = contests.find(c => c.concurso === lastProcessedConcurso);
                                        if (!contest) return;

                                        // Fetch detailed bets report
                                        const betsReport = await getContestReportBets(contest.concurso);

                                        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
                                        const pageWidth = doc.internal.pageSize.getWidth();

                                        // Colors
                                        const yellow: [number, number, number] = [255, 215, 0];
                                        const darkBlue: [number, number, number] = [0, 51, 102];
                                        const white: [number, number, number] = [255, 255, 255];
                                        const lightGray: [number, number, number] = [240, 240, 240];

                                        // ========== HEADER: "BOLÃO MEGA 20" ==========
                                        doc.setFillColor(...yellow);
                                        doc.rect(0, 0, pageWidth, 12, 'F');
                                        doc.setFontSize(16);
                                        doc.setFont('helvetica', 'bold');
                                        doc.setTextColor(0, 0, 0);
                                        doc.text('LuckyClover', pageWidth / 2, 8, { align: 'center' });

                                        // ========== STATS SECTION ==========
                                        const statsY = 14;

                                        // Count hits distribution
                                        const hitCounts = [0, 0, 0, 0, 0, 0, 0]; // indices 0-6
                                        if (betsReport) {
                                            betsReport.forEach(b => {
                                                const h = Math.min(b.hits, 6);
                                                hitCounts[h]++;
                                            });
                                        }
                                        const totalParticipants = betsReport?.length || 0;

                                        // Left side: hit counts
                                        doc.setFontSize(8);
                                        doc.setFont('helvetica', 'bold');
                                        doc.setTextColor(0, 0, 0);
                                        for (let i = 0; i <= 6; i++) {
                                            const yPos = statsY + i * 5;
                                            const count = i === 0 ? totalParticipants : hitCounts[i];
                                            doc.text(`${count}`, 10, yPos);
                                            doc.setFont('helvetica', 'normal');
                                            doc.text(`PESSOAS ACERTARAM`, 20, yPos);
                                            doc.setFont('helvetica', 'bold');
                                            doc.text(`${i}`, 60, yPos);
                                        }

                                        // Center: CONCURSO and DATA
                                        const centerX = pageWidth / 2 - 10;
                                        doc.setFontSize(10);
                                        doc.setFont('helvetica', 'bold');
                                        doc.text('CONCURSO', centerX - 15, statsY + 5);

                                        // Concurso number in yellow box
                                        doc.setFillColor(...yellow);
                                        doc.rect(centerX + 10, statsY + 1, 25, 6, 'F');
                                        doc.setTextColor(0, 0, 139);
                                        doc.setFontSize(11);
                                        doc.text(`${contest.concurso}`, centerX + 22, statsY + 5.5, { align: 'center' });

                                        // DATA
                                        doc.setTextColor(0, 0, 0);
                                        doc.setFontSize(10);
                                        doc.text('DATA', centerX - 15, statsY + 15);
                                        doc.setFillColor(...yellow);
                                        doc.rect(centerX + 10, statsY + 11, 35, 6, 'F');
                                        doc.setTextColor(0, 0, 139);
                                        doc.text(contest.date, centerX + 27, statsY + 15.5, { align: 'center' });

                                        // PARTICIPANTES
                                        doc.setTextColor(0, 0, 0);
                                        doc.setFontSize(10);
                                        doc.setFont('helvetica', 'bold');
                                        doc.text('PARTICIPANTES', centerX - 15, statsY + 25);
                                        doc.setFillColor(...yellow);
                                        doc.rect(centerX + 20, statsY + 21, 25, 6, 'F');
                                        doc.setTextColor(0, 0, 139);
                                        doc.setFontSize(12);
                                        doc.text(`${totalParticipants}`, centerX + 32, statsY + 25.5, { align: 'center' });

                                        // Right side: NÚMEROS SORTEADOS
                                        const rightX = pageWidth - 80;
                                        doc.setTextColor(0, 0, 0);
                                        doc.setFontSize(9);
                                        doc.setFont('helvetica', 'bold');
                                        doc.text('NÚMEROS SORTEADOS', rightX, statsY + 5);

                                        // Draw drawn number circles
                                        const drawnNums = contest.drawnNumbers.filter(n => n !== 0);
                                        let circleX = rightX;
                                        drawnNums.forEach(n => {
                                            doc.setFillColor(0, 51, 153);
                                            doc.rect(circleX, statsY + 7, 8, 7, 'F');
                                            doc.setTextColor(255, 255, 255);
                                            doc.setFontSize(9);
                                            doc.text(n.toString().padStart(2, '0'), circleX + 4, statsY + 12, { align: 'center' });
                                            circleX += 10;
                                        });

                                        // VALOR DO PRÊMIO
                                        doc.setTextColor(0, 0, 0);
                                        doc.setFontSize(9);
                                        doc.text('VALOR DO PRÊMIO', rightX, statsY + 22);
                                        const prizeValue = contest.prizeEstimate?.prize_pool || 0;
                                        doc.setTextColor(255, 0, 0);
                                        doc.setFontSize(12);
                                        doc.setFont('helvetica', 'bold');
                                        doc.text(`R$${prizeValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, rightX, statsY + 28);

                                        // ========== TABLE SECTION ==========
                                        const tableStartY = statsY + 35;

                                        if (betsReport && betsReport.length > 0) {
                                            // Sort by client_name
                                            const sortedBets = [...betsReport].sort((a, b) =>
                                                (a.client_name || '').localeCompare(b.client_name || '')
                                            );

                                            // Find max numbers count for columns
                                            const maxNumbers = Math.max(...sortedBets.map(b => b.numbers.length), 6);

                                            // Build header
                                            const header = ['Nº', 'PARTICIPANTES'];
                                            for (let i = 0; i < maxNumbers; i++) {
                                                header.push(''); // JOGOS columns
                                            }
                                            header.push('ACERTOS');

                                            // Build body
                                            const body = sortedBets.map((b, idx) => {
                                                const row: string[] = [
                                                    `${idx + 1}`,
                                                    (b.client_name || 'Anônimo').toUpperCase()
                                                ];
                                                const sorted = [...b.numbers].sort((a, c) => a - c);
                                                for (let i = 0; i < maxNumbers; i++) {
                                                    row.push(sorted[i] !== undefined ? sorted[i].toString() : '');
                                                }
                                                row.push(`${b.hits}`);
                                                return row;
                                            });

                                            // Column styles
                                            const colStyles: Record<number, any> = {
                                                0: { cellWidth: 10, halign: 'center' },
                                                1: { cellWidth: 55 },
                                            };
                                            for (let i = 2; i < 2 + maxNumbers; i++) {
                                                colStyles[i] = { cellWidth: 7, halign: 'center', fontSize: 7 };
                                            }
                                            colStyles[2 + maxNumbers] = { cellWidth: 14, halign: 'center', fontStyle: 'bold' };

                                            autoTable(doc, {
                                                startY: tableStartY,
                                                head: [header],
                                                body: body,
                                                theme: 'grid',
                                                styles: {
                                                    fontSize: 7,
                                                    cellPadding: 1,
                                                    lineColor: [0, 0, 0],
                                                    lineWidth: 0.2,
                                                },
                                                headStyles: {
                                                    fillColor: darkBlue,
                                                    textColor: white,
                                                    fontStyle: 'bold',
                                                    halign: 'center',
                                                    fontSize: 7,
                                                },
                                                columnStyles: colStyles,
                                                alternateRowStyles: {
                                                    fillColor: lightGray,
                                                },
                                                didDrawCell: (data) => {
                                                    // Merge JOGOS header
                                                    if (data.section === 'head' && data.column.index === 2) {
                                                        const cell = data.cell;
                                                        doc.setFillColor(...darkBlue);
                                                        doc.setTextColor(255, 255, 255);
                                                        doc.setFontSize(8);
                                                        doc.setFont('helvetica', 'bold');
                                                        // Draw "JOGOS" label spanning across number columns
                                                        const jogosWidth = maxNumbers * 7;
                                                        doc.text('JOGOS', cell.x + jogosWidth / 2, cell.y + 3.5, { align: 'center' });
                                                    }
                                                },
                                                didParseCell: (data) => {
                                                    // Color the ACERTOS column red
                                                    if (data.column.index === 2 + maxNumbers && data.section === 'body') {
                                                        const hits = parseInt(data.cell.text[0] || '0');
                                                        if (hits >= 5) {
                                                            data.cell.styles.textColor = [46, 125, 50];
                                                            data.cell.styles.fillColor = [232, 245, 233];
                                                        } else {
                                                            data.cell.styles.textColor = [255, 0, 0];
                                                        }
                                                        data.cell.styles.fontStyle = 'bold';
                                                        data.cell.styles.fontSize = 9;
                                                    }
                                                },
                                                margin: { left: 5, right: 5 },
                                            });
                                        }

                                        doc.save(`resultado_concurso_${contest.concurso}.pdf`);
                                    }}
                                    style={{ marginBottom: '1.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <Download size={16} /> Baixar Relatório do Sorteio
                                </button>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, 1fr)',
                                    gap: '1rem',
                                    marginBottom: '2rem'
                                }}>
                                    <div className="p-3 bg-green-50 rounded-lg">
                                        <div className="text-2xl font-bold text-green-700">{processResult.data?.winners_sena}</div>
                                        <div className="text-xs text-green-600 font-semibold uppercase">Sena</div>
                                    </div>
                                    <div className="p-3 bg-orange-50 rounded-lg">
                                        <div className="text-2xl font-bold text-orange-700">{processResult.data?.winners_quina}</div>
                                        <div className="text-xs text-orange-600 font-semibold uppercase">Quina</div>
                                    </div>
                                </div>

                                {processResult.data?.winners_list && processResult.data.winners_list.length > 0 && (
                                    <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
                                        <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--foreground)' }}>
                                            Lista de Ganhadores
                                        </h4>
                                        <div style={{ display: 'grid', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
                                            {processResult.data.winners_list.map((winner) => (
                                                <div key={winner.bet_id} style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    background: '#f8f9fa',
                                                    padding: '0.75rem',
                                                    borderRadius: '0.375rem',
                                                    border: '1px solid #e9ecef'
                                                }}>
                                                    <div>
                                                        <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{winner.full_name || 'Cliente'}</p>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                            {winner.phone} {winner.pix_key ? `• Pix: ${winner.pix_key}` : ''}
                                                            {winner.ticket_number && <span style={{ color: 'var(--primary)', fontWeight: 600 }}> • Bilhete: #{winner.ticket_number}</span>}
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        background: winner.hits === 6 ? '#2e7d32' : winner.hits === 5 ? '#ef6c00' : '#f57c00',
                                                        color: 'white',
                                                        fontWeight: 700,
                                                        fontSize: '0.7rem',
                                                        padding: '0.125rem 0.5rem',
                                                        borderRadius: '999px'
                                                    }}>
                                                        {winner.hits} pts
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div style={{
                                    width: 64, height: 64,
                                    background: '#fee2e2',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 1.5rem',
                                    color: '#ef4444'
                                }}>
                                    <AlertCircle size={32} />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem', color: '#ef4444' }}>
                                    Erro ao Processar
                                </h3>
                                <p style={{ color: 'var(--muted-foreground)' }}>
                                    {processResult.error}
                                </p>
                            </>
                        )}

                        <button
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                            onClick={() => setIsModalOpen(false)}
                        >
                            Fechar
                        </button>
                    </div>
                )}
            </Modal>

            {/* New Contest Modal */}
            <Modal
                isOpen={isNewContestModalOpen}
                onClose={() => setIsNewContestModalOpen(false)}
                title="Novo Concurso"
            >
                <div style={{ display: 'grid', gap: '1.25rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Número do Concurso
                        </label>
                        <input
                            type="number"
                            value={newContestNumber}
                            onChange={e => setNewContestNumber(e.target.value)}
                            placeholder="Ex: 2810"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--border)',
                                fontSize: '1rem',
                                background: 'var(--card)',
                                color: 'var(--foreground)'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Data do Concurso
                        </label>
                        <input
                            type="date"
                            value={newContestDate}
                            onChange={e => setNewContestDate(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--border)',
                                fontSize: '1rem',
                                background: 'var(--card)',
                                color: 'var(--foreground)'
                            }}
                        />
                    </div>

                    {createContestError && (
                        <div style={{
                            padding: '0.75rem',
                            background: '#fee2e2',
                            color: '#dc2626',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem'
                        }}>
                            {createContestError}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                            className="btn btn-outline"
                            style={{ flex: 1 }}
                            onClick={() => setIsNewContestModalOpen(false)}
                            disabled={creatingContest}
                        >
                            Cancelar
                        </button>
                        <button
                            className="btn btn-primary"
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            onClick={handleCreateContest}
                            disabled={creatingContest}
                        >
                            <Plus size={18} />
                            {creatingContest ? 'Criando...' : 'Criar Concurso'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
