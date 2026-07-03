import { useState, useEffect } from 'react';
import { getResellers, createReseller, updateResellerCommission, formatCpf, validateCpf, Reseller, CreateResellerData, deleteUser, resetUserPassword, getResellerReport, ResellerReportItem, getConcursos, Concurso, getGeneralResellerReport } from '../lib/supabase';
import { Check, X, Plus, Loader2, Edit2, Save, Eye, Trash2, KeyRound, FileText, ChevronDown, ChevronUp, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function RevendedoresPage() {
    const [resellers, setResellers] = useState<Reseller[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Commission editing state
    // Commission editing state
    const [isEditingCommission, setIsEditingCommission] = useState(false);
    const [editCommission, setEditCommission] = useState<number>(0);
    const [savingCommission, setSavingCommission] = useState(false);

    // Details modal state
    const [selectedReseller, setSelectedReseller] = useState<Reseller | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Password Reset State
    const [resettingPassword, setResettingPassword] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [resetSuccess, setResetSuccess] = useState('');
    const [resetError, setResetError] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    // Report State
    const [showReportModal, setShowReportModal] = useState(false);
    const [reportData, setReportData] = useState<ResellerReportItem[]>([]);
    const [loadingReport, setLoadingReport] = useState(false);
    const [expandedConcursos, setExpandedConcursos] = useState<number[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        fullName: '',
        cpf: '',
        phone: '',
        pixKey: '',
        cidade: '',
        businessName: '',
        couponCode: '',
        password: '',
        confirmPassword: ''
    });

    const [currentConcurso, setCurrentConcurso] = useState<number | null>(null);

    // General Report State
    const [concursos, setConcursos] = useState<Concurso[]>([]);
    const [showGeneralReportModal, setShowGeneralReportModal] = useState(false);
    const [selectedConcursoId, setSelectedConcursoId] = useState<number | null>(null);
    const [generatingReport, setGeneratingReport] = useState(false);

    useEffect(() => {
        loadResellers();
        loadConcursos();
    }, []);

    const loadConcursos = async () => {
        const data = await getConcursos();
        setConcursos(data);
        if (data.length > 0) setSelectedConcursoId(data[0].concurso_number);
    };

    const loadResellers = async () => {
        setLoading(true);
        const data = await getResellers();
        setResellers(data);

        // Extract current contest from the first item if available
        if (data.length > 0) {
            // @ts-ignore
            const firstItem = data[0] as any;
            if (firstItem.current_concurso) {
                setCurrentConcurso(firstItem.current_concurso);
            }
        }

        setLoading(false);

        // Update selected reseller if open
        if (selectedReseller) {
            const updated = data.find(r => r.id === selectedReseller.id);
            if (updated) setSelectedReseller(updated);
        }
    };

    // Initialize edit state when opening details
    useEffect(() => {
        if (selectedReseller) {
            setEditCommission(selectedReseller.commission_rate);
            setIsEditingCommission(false);
        }
    }, [selectedReseller]); // Only run when a different reseller is selected (or opened)

    const saveCommission = async () => {
        if (!selectedReseller) return;
        setSavingCommission(true);
        const success = await updateResellerCommission(selectedReseller.id, editCommission);
        if (success) {
            await loadResellers();
            setIsEditingCommission(false);
        }
        setSavingCommission(false);
    };



    const handleCpfChange = (value: string) => {
        setFormData(prev => ({ ...prev, cpf: formatCpf(value) }));
    };

    const handlePhoneChange = (value: string) => {
        const clean = value.replace(/\D/g, '');
        let formatted = clean;
        if (clean.length > 2) {
            formatted = `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}`;
            if (clean.length > 7) {
                formatted += `-${clean.slice(7, 11)}`;
            }
        }
        setFormData(prev => ({ ...prev, phone: formatted }));
    };

    const resetForm = () => {
        setFormData({
            fullName: '',
            cpf: '',
            phone: '',
            pixKey: '',
            cidade: '',
            businessName: '',
            couponCode: '',
            password: '',
            confirmPassword: ''
        });
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (!validateCpf(formData.cpf)) {
            setError('CPF invÃ¡lido. Digite os 11 dÃ­gitos.');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('As senhas nÃ£o coincidem.');
            return;
        }

        if (formData.password.length < 6) {
            setError('A senha deve ter no ­mínimo 6 caracteres.');
            return;
        }

        setCreating(true);

        const resellerData: CreateResellerData = {
            fullName: formData.fullName,
            cpf: formData.cpf,
            phone: formData.phone,
            pixKey: formData.pixKey,
            cidade: formData.cidade,
            businessName: formData.fullName, // Use full name as business name
            couponCode: formData.couponCode,
            password: formData.password
        };

        const result = await createReseller(resellerData);

        if (result.success) {
            setSuccess('Revendedor criado com sucesso!');
            await loadResellers();
            setTimeout(() => {
                setShowModal(false);
                resetForm();
            }, 1500);
        } else {
            setError(result.error || 'Erro ao criar revendedor');
        }

        setCreating(false);
    };

    const handleDelete = async (userId: string) => {
        if (!confirm('Tem certeza que deseja excluir este revendedor? Todas as apostas e dados relacionados serÃ£o removidos permanentemente.')) {
            return;
        }

        setDeletingId(userId);
        const result = await deleteUser(userId);
        if (result.success) {
            await loadResellers();
        } else {
            alert(result.error || 'Erro ao excluir revendedor');
        }
        setDeletingId(null);
    };

    const handleShowReport = async () => {
        if (!selectedReseller) return;
        setLoadingReport(true);
        setShowReportModal(true);
        const data = await getResellerReport(selectedReseller.id);
        setReportData(data);
        setLoadingReport(false);
        // Auto-expand first concurso if only one, or none
        if (data.length > 0) {
            setExpandedConcursos([data[0].concurso]);
        }
    };

    const toggleConcurso = (concurso: number) => {
        setExpandedConcursos(prev =>
            prev.includes(concurso)
                ? prev.filter(c => c !== concurso)
                : [...prev, concurso]
        );
    };

    const handlePasswordReset = async () => {
        if (!selectedReseller) return;
        if (newPassword.length < 6) {
            setResetError('A senha deve ter no mí­nimo 6 caracteres.');
            return;
        }

        setIsResetting(true);
        setResetError('');
        setResetSuccess('');

        const result = await resetUserPassword(selectedReseller.user_id, newPassword);

        if (result.success) {
            setResetSuccess('Senha redefinida com sucesso.');
            setNewPassword('');
            setTimeout(() => {
                setResettingPassword(false);
                setResetSuccess('');
            }, 2000);
        } else {
            setResetError(result.error || 'Erro ao redefinir senha.');
        }

        setIsResetting(false);
    };

    const generateGeneralReport = async () => {
        if (!selectedConcursoId) return;

        setGeneratingReport(true);

        try {
            const data = await getGeneralResellerReport(selectedConcursoId);

            if (data.length === 0) {
                alert('Nenhum dado encontrado para este concurso.');
                setGeneratingReport(false);
                return;
            }

            const doc = new jsPDF();

            // Title
            doc.setFontSize(18);
            doc.text(`Relatório Geral de Vendas - Concurso ${selectedConcursoId}`, 14, 20);

            // Date
            doc.setFontSize(10);
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);

            // Table
            const tableData = data.map(item => [
                item.reseller_name,
                item.tickets_count.toString(),
                `R$ ${(item.total_sales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                `R$ ${(item.total_commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                `R$ ${(item.net_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ]);

            // Calculate totals
            const totalSales = data.reduce((sum, item) => sum + item.total_sales, 0);
            const totalCommission = data.reduce((sum, item) => sum + item.total_commission, 0);
            const totalNet = data.reduce((sum, item) => sum + item.net_value, 0);
            const totalTickets = data.reduce((sum, item) => sum + item.tickets_count, 0);

            // Add footer row
            tableData.push([
                'TOTAL',
                totalTickets.toString(),
                `R$ ${(totalSales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                `R$ ${(totalCommission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                `R$ ${(totalNet || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
            ]);

            autoTable(doc, {
                startY: 35,
                head: [['Revendedor', 'Qtd', 'Vendas', 'Comissão', 'Lí­quido']],
                body: tableData,
                foot: [['TOTAL', totalTickets.toString(), `R$ ${(totalSales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, `R$ ${(totalCommission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, `R$ ${(totalNet || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]],
                theme: 'grid',
                headStyles: { fillColor: [46, 125, 50] },
                footStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
                columnStyles: {
                    0: { cellWidth: 'auto' }, // Revendedor
                    1: { cellWidth: 20, halign: 'center' }, // Qtd
                    2: { cellWidth: 35, halign: 'right' }, // Vendas
                    3: { cellWidth: 35, halign: 'right' }, // Comissão
                    4: { cellWidth: 35, halign: 'right' }  // Lí­quido
                }
            });

            doc.save(`relatorio_geral_concurso_${selectedConcursoId}.pdf`);
            setShowGeneralReportModal(false);

        } catch (err) {
            console.error('Error generating PDF:', err);
            alert('Erro ao gerar relatório PDF.');
        }

        setGeneratingReport(false);
    };

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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                <button
                    className="btn btn-outline"
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem' }}
                    onClick={() => setShowGeneralReportModal(true)}
                >
                    <Download size={16} /> Relatório Geral
                </button>
                <button
                    className="btn btn-primary"
                    style={{ fontSize: '0.875rem', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => { resetForm(); setShowModal(true); }}
                >
                    <Plus size={16} /> Novo Revendedor
                </button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Nome</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Cupom</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>
                                Vendas {currentConcurso ? `(Conc. ${currentConcurso})` : ''}
                            </th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>
                                Comissão {currentConcurso ? `(Conc. ${currentConcurso})` : ''}
                            </th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Status</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Detalhes</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {resellers.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>{r.business_name}</td>
                                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{r.coupon_code || '-'}</td>
                                <td style={{ padding: '1rem' }}>R$ {(r.total_sales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td style={{ padding: '1rem', color: '#2e7d32', fontWeight: 600 }}>
                                    R$ {(r.total_commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </td>

                                <td style={{ padding: '1rem' }}>
                                    {r.is_active ? (
                                        <span className="badge badge-success"><Check size={12} style={{ marginRight: 4 }} />Ativo</span>
                                    ) : (
                                        <span className="badge badge-neutral"><X size={12} style={{ marginRight: 4 }} />Inativo</span>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <button
                                        onClick={() => {
                                            setSelectedReseller(r);
                                            setResettingPassword(false);
                                            setNewPassword('');
                                            setResetError('');
                                            setResetSuccess('');
                                        }}
                                        className="btn btn-outline"
                                        style={{
                                            padding: '0.25rem 0.5rem',
                                            fontSize: '0.75rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.25rem'
                                        }}
                                    >
                                        <Eye size={12} /> Ver
                                    </button>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>

                                        <button
                                            onClick={() => handleDelete(r.user_id)}
                                            className="btn btn-outline"
                                            style={{
                                                padding: '0.25rem 0.5rem',
                                                fontSize: '0.75rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                color: '#e53935',
                                                borderColor: '#e53935'
                                            }}
                                            disabled={deletingId === r.user_id}
                                        >
                                            {deletingId === r.user_id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Create Reseller Modal */}
            {showModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Novo Revendedor</h2>
                            <button
                                onClick={() => setShowModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--muted-foreground)' }}
                            >
                                Fechar
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                    Nome Completo *
                                </label>
                                <input
                                    type="text"
                                    className="input"
                                    value={formData.fullName}
                                    onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                    placeholder="Nome completo"
                                    required
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        CPF *
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.cpf}
                                        onChange={(e) => handleCpfChange(e.target.value)}
                                        placeholder="000.000.000-00"
                                        maxLength={14}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        Telefone *
                                    </label>
                                    <input
                                        type="tel"
                                        className="input"
                                        value={formData.phone}
                                        onChange={(e) => handlePhoneChange(e.target.value)}
                                        placeholder="(00) 00000-0000"
                                        maxLength={15}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        Chave PIX *
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.pixKey}
                                        onChange={(e) => setFormData(prev => ({ ...prev, pixKey: e.target.value }))}
                                        placeholder="CPF, telefone, e-mail..."
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        Cidade *
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.cidade}
                                        onChange={(e) => setFormData(prev => ({ ...prev, cidade: e.target.value }))}
                                        placeholder="Cidade"
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        Código do Cupom *
                                    </label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.couponCode}
                                        onChange={(e) => setFormData(prev => ({ ...prev, couponCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                                        placeholder="Ex: LUCKY10"
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        Senha *
                                    </label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={formData.password}
                                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="Mí­nimo 6 caracteres"
                                        minLength={6}
                                        required
                                    />
                                </div>

                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
                                        Confirmar Senha *
                                    </label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={formData.confirmPassword}
                                        onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                                        placeholder="Confirme a senha"
                                        required
                                    />
                                </div>
                            </div>

                            {error && (
                                <p style={{ color: '#e53935', fontSize: '0.875rem', textAlign: 'center', margin: 0 }}>
                                    {error}
                                </p>
                            )}

                            {success && (
                                <p style={{ color: '#43a047', fontSize: '0.875rem', textAlign: 'center', margin: 0 }}>
                                    {success}
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    className="btn"
                                    style={{ flex: 1, background: 'var(--muted)', color: 'var(--foreground)' }}
                                    onClick={() => setShowModal(false)}
                                    disabled={creating}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    disabled={creating}
                                >
                                    {creating ? <><Loader2 size={16} className="animate-spin" /> Criando...</> : 'Criar Revendedor'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reseller Details Modal */}
            {selectedReseller && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '450px' }}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Detalhes do Revendedor</h2>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Nome</span>
                                <p style={{ fontWeight: 600, margin: 0 }}>{selectedReseller.business_name}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Código do Cupom</span>
                                <p style={{ fontWeight: 600, margin: 0, fontFamily: 'monospace', color: 'var(--primary)' }}>{selectedReseller.coupon_code || 'NÃ£o definido'}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>CPF</span>
                                <p style={{ fontWeight: 600, margin: 0, fontFamily: 'monospace' }}>{selectedReseller.user_cpf || 'N/A'}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Cidade</span>
                                <p style={{ fontWeight: 600, margin: 0 }}>{selectedReseller.user_cidade || 'N/A'}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Telefone</span>
                                <p style={{ fontWeight: 600, margin: 0 }}>{selectedReseller.user_phone || 'N/A'}</p>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Chave PIX</span>
                                <p style={{ fontWeight: 600, margin: 0 }}>{selectedReseller.user_pix || 'N/A'}</p>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Total de Vendas</span>
                                    <p style={{ fontWeight: 600, margin: 0, color: 'var(--primary)' }}>
                                        R$ {(selectedReseller.total_sales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Total de Comissão</span>
                                    <p style={{ fontWeight: 600, margin: 0, color: '#2e7d32' }}>
                                        R$ {(selectedReseller.total_commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Comissão</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {isEditingCommission ? (
                                        <>
                                            <input
                                                type="number"
                                                value={editCommission}
                                                onChange={(e) => setEditCommission(Number(e.target.value))}
                                                style={{
                                                    width: '60px',
                                                    padding: '0.25rem 0.5rem',
                                                    border: '1px solid var(--primary)',
                                                    borderRadius: '4px',
                                                    fontSize: '0.875rem'
                                                }}
                                                min="0"
                                                max="100"
                                                step="0.5"
                                                autoFocus
                                            />
                                            <span style={{ fontSize: '0.875rem' }}>%</span>
                                            <button
                                                onClick={saveCommission}
                                                disabled={savingCommission}
                                                style={{
                                                    background: 'var(--primary)',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '0.25rem',
                                                    cursor: 'pointer',
                                                    display: 'flex'
                                                }}
                                            >
                                                {savingCommission ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setIsEditingCommission(false);
                                                    setEditCommission(selectedReseller.commission_rate);
                                                }}
                                                style={{
                                                    background: 'var(--muted)',
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    padding: '0.25rem',
                                                    cursor: 'pointer',
                                                    display: 'flex'
                                                }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ fontWeight: 600, margin: 0 }}>{selectedReseller.commission_rate}%</p>
                                            <button
                                                onClick={() => setIsEditingCommission(true)}
                                                className="btn btn-ghost"
                                                style={{ padding: '0.2rem', height: 'auto' }}
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Status</span>
                            <p style={{ margin: 0 }}>
                                {selectedReseller.is_active ? (
                                    <span className="badge badge-success"><Check size={12} style={{ marginRight: 4 }} />Ativo</span>
                                ) : (
                                    <span className="badge badge-neutral"><X size={12} style={{ marginRight: 4 }} />Inativo</span>
                                )}
                            </p>
                        </div>

                        <hr style={{ margin: '0.5rem 0', borderColor: '#eee' }} />

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                onClick={handleShowReport}
                                className="btn btn-primary"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: '#2e7d32', borderColor: '#2e7d32' }}
                            >
                                <FileText size={16} /> Relatório de Vendas
                            </button>

                            <button
                                onClick={() => setResettingPassword(!resettingPassword)}
                                className="btn btn-outline"
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                            >
                                <KeyRound size={16} /> {resettingPassword ? 'Cancelar Redefinição' : 'Redefinir Senha'}
                            </button>

                            {resettingPassword && (
                                <div style={{ marginTop: '1rem', background: '#f9fafb', padding: '1rem', borderRadius: '8px' }}>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                                        Nova Senha
                                    </label>
                                    <input
                                        type="password"
                                        className="input"
                                        placeholder="Nova senha..."
                                        style={{ width: '100%', marginBottom: '0.5rem' }}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        minLength={6}
                                    />
                                    {resetError && <p style={{ color: '#e53935', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>{resetError}</p>}
                                    {resetSuccess && <p style={{ color: '#43a047', fontSize: '0.8rem', margin: '0 0 0.5rem 0' }}>{resetSuccess}</p>}

                                    <button
                                        onClick={handlePasswordReset}
                                        disabled={isResetting || !newPassword}
                                        className="btn btn-primary"
                                        style={{ width: '100%', marginTop: '0.5rem' }}
                                    >
                                        {isResetting ? <Loader2 size={16} className="animate-spin" /> : 'Salvar Nova Senha'}
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            className="btn"
                            style={{ width: '100%', marginTop: '1.5rem', background: 'var(--muted)', color: 'var(--foreground)' }}
                            onClick={() => setSelectedReseller(null)}
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {showReportModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1100
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Relatório de Vendas</h2>
                                <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: '0.25rem 0 0 0' }}>{selectedReseller?.business_name}</p>
                            </div>
                            <button
                                onClick={() => setShowReportModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--muted-foreground)' }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {loadingReport ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                                    <Loader2 size={32} className="animate-spin" />
                                </div>
                            ) : reportData.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                                    Nenhuma venda paga encontrada para este revendedor.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {reportData.map(item => (
                                        <div key={item.concurso} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                                            <div
                                                onClick={() => toggleConcurso(item.concurso)}
                                                style={{
                                                    padding: '1rem',
                                                    background: '#f9fafb',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <div style={{ display: 'flex', gap: '2rem' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Concurso</span>
                                                        <span style={{ fontWeight: 600 }}>#{item.concurso}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Vendas</span>
                                                        <span style={{ fontWeight: 600 }}>R$ {(item.total_sales || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Comissão</span>
                                                        <span style={{ fontWeight: 600, color: '#2e7d32' }}>R$ {(item.total_commission || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                </div>
                                                {expandedConcursos.includes(item.concurso) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </div>

                                            {expandedConcursos.includes(item.concurso) && (
                                                <div style={{ padding: '0 1rem 1rem 1rem' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                                        <thead style={{ borderBottom: '1px solid #eee' }}>
                                                            <tr>
                                                                <th style={{ padding: '0.75rem 0', textAlign: 'left' }}>Data</th>
                                                                <th style={{ padding: '0.75rem 0', textAlign: 'left' }}>Cliente</th>
                                                                <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Valor</th>
                                                                <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Comissão</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {item.bets.map(bet => (
                                                                <tr key={bet.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                                                                    <td style={{ padding: '0.5rem 0' }}>{new Date(bet.created_at).toLocaleDateString('pt-BR')}</td>
                                                                    <td style={{ padding: '0.5rem 0' }}>{bet.client_name || 'Anônimo'}</td>
                                                                    <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>R$ {(bet.amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                                    <td style={{ padding: '0.5rem 0', textAlign: 'right', color: '#2e7d32' }}>R$ {(Number(bet.commission) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
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

                        <div style={{ padding: '1.25rem', borderTop: '1px solid #eee', background: '#f9fafb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', gap: '1.5rem' }}>
                                    <div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Total de Vendas</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                                            R$ {(reportData.reduce((acc, curr) => acc + Number(curr.total_sales), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block' }}>Total de Comissão</span>
                                        <span style={{ fontSize: '1rem', fontWeight: 600, color: '#2e7d32' }}>
                                            R$ {(reportData.reduce((acc, curr) => acc + Number(curr.total_commission), 0) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowReportModal(false)}
                                    className="btn"
                                    style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
                                >
                                    Fechar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* General Report Selection Modal */}
            {showGeneralReportModal && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1200
                }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Gerar Relatório Geral</h2>
                            <button
                                onClick={() => setShowGeneralReportModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', color: 'var(--muted-foreground)' }}
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>
                                Selecione o Concurso
                            </label>
                            <select
                                className="input"
                                style={{ width: '100%' }}
                                value={selectedConcursoId || ''}
                                onChange={(e) => setSelectedConcursoId(Number(e.target.value))}
                            >
                                {concursos.map(c => (
                                    <option key={c.concurso_number} value={c.concurso_number}>
                                        Concurso #{c.concurso_number} ({new Date(c.draw_date).toLocaleDateString()}) - {c.status === 'open' ? 'Aberto' : 'Encerrado'}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                className="btn"
                                style={{ flex: 1, background: 'var(--muted)', color: 'var(--foreground)' }}
                                onClick={() => setShowGeneralReportModal(false)}
                                disabled={generatingReport}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                onClick={generateGeneralReport}
                                disabled={generatingReport || !selectedConcursoId}
                            >
                                {generatingReport ? <Loader2 size={16} className="animate-spin" /> : <><Download size={16} /> Gerar PDF</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
