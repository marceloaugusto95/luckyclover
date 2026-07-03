import { useState } from 'react';
import { FileText, Search, Loader2 } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAuditBets } from '../lib/supabase';

interface AuditSectionProps {
    latestConcurso?: number;
}

export default function AuditSection({ latestConcurso }: AuditSectionProps) {
    const [concurso, setConcurso] = useState<string>(latestConcurso ? latestConcurso.toString() : '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGeneratePDF = async () => {
        const concursoNum = parseInt(concurso);
        if (isNaN(concursoNum) || concursoNum <= 0) {
            setError('Por favor, insira um número de concurso válido.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const bets = await getAuditBets(concursoNum);

            if (!bets || bets.length === 0) {
                setError('Nenhuma aposta encontrada para este concurso.');
                setLoading(false);
                return;
            }

            // Generate PDF
            const doc = new jsPDF();

            // Header
            doc.setFontSize(18);
            doc.text(`Relatório de Auditoria - Concurso #${concursoNum}`, 14, 22);
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 30);
            doc.text('LuckyClover - Transparência Blockchain', 14, 36);

            // Table Data
            const tableData = bets.map(bet => [
                (bet.created_at ? new Date(bet.created_at) : new Date()).toLocaleString('pt-BR'),
                bet.full_name,
                bet.numbers.map(n => n.toString().padStart(2, '0')).join(', '),
                bet.status === 'won' ? 'Premiado' : 'Confirmado',
                bet.hits > 0 ? bet.hits.toString() : '-'
            ]);

            autoTable(doc, {
                startY: 44,
                head: [['Data/Hora', 'Usuário', 'Dezenas', 'Status', 'Acertos']],
                body: tableData,
                styles: { fontSize: 8 },
                headStyles: { fillColor: [40, 167, 69] }, // Green color
            });

            doc.save(`auditoria-concurso-${concursoNum}.pdf`);
        } catch (err) {
            console.error(err);
            setError('Erro ao gerar relatório. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="card" style={{ borderLeft: '4px solid var(--primary)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText className="text-primary" /> Conferir Concurso
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                Gere um relatório completo em PDF com todas as apostas realizadas. Dados sensíveis são ocultados para garantir sua privacidade.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'start' }}>
                <div style={{ flex: 1 }}>
                    <input
                        type="number"
                        className="input"
                        placeholder="Nº do Concurso"
                        value={concurso}
                        onChange={(e) => setConcurso(e.target.value)}
                        style={{ width: '100%' }}
                    />
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleGeneratePDF}
                    disabled={loading}
                    style={{ whiteSpace: 'nowrap', minWidth: '120px' }}
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : <><Search size={20} /> Conferir</>}
                </button>
            </div>
            {error && (
                <p style={{ color: 'red', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    {error}
                </p>
            )}
        </section>
    );
}
