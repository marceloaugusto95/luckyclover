import { useState, useEffect } from 'react';
import { getClients, resetUserPassword, formatCpf, AuthUser } from '../lib/supabase';
import { KeyRound, Loader2, Search } from 'lucide-react';

export default function ClientesCadastradosPage() {
    const [clients, setClients] = useState<AuthUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Reset Password Modal
    const [resetModalOpen, setResetModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<AuthUser | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetting, setResetting] = useState(false);
    const [resetMessage, setResetMessage] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const data = await getClients();
        setClients(data || []);
        setLoading(false);
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || !newPassword) return;

        setResetting(true);
        setResetMessage('');

        const result = await resetUserPassword(selectedClient.id, newPassword);

        if (result.success) {
            setResetMessage('Senha redefinida com sucesso!');
            setTimeout(() => {
                setResetModalOpen(false);
                setResetMessage('');
                setNewPassword('');
                setSelectedClient(null);
            }, 1500);
        } else {
            setResetMessage('Erro: ' + result.error);
        }
        setResetting(false);
    };

    const openResetModal = (client: AuthUser) => {
        setSelectedClient(client);
        setNewPassword('');
        setResetMessage('');
        setResetModalOpen(true);
    };

    const filteredClients = clients.filter(c =>
        c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.cpf?.includes(searchTerm)
    );

    if (loading && clients.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="animate-spin" style={{ width: 32, height: 32, border: '3px solid var(--muted)', borderTopColor: 'var(--primary)', borderRadius: '50%', margin: '0 auto' }} />
            </div>
        );
    }

    return (
        <div>
            <div style={{ marginBottom: '1rem', position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input
                    type="text"
                    className="input"
                    placeholder="Buscar por nome ou CPF..."
                    style={{ paddingLeft: '2.5rem', width: '100%', maxWidth: '400px' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: 'var(--muted)', textAlign: 'left' }}>
                        <tr>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Nome</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>CPF</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Telefone</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Chave Pix</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Cidade</th>
                            <th style={{ padding: '1rem', fontSize: '0.875rem' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredClients.map(client => (
                            <tr key={client.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>{client.full_name}</td>
                                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{formatCpf(client.cpf)}</td>
                                <td style={{ padding: '1rem' }}>{client.phone}</td>
                                <td style={{ padding: '1rem', fontFamily: 'monospace' }}>{client.pix_key}</td>
                                <td style={{ padding: '1rem' }}>{client.cidade}</td>
                                <td style={{ padding: '1rem' }}>
                                    <button
                                        onClick={() => openResetModal(client)}
                                        className="btn btn-outline"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}
                                    >
                                        <KeyRound size={14} /> Resetar Senha
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredClients.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Nenhum cliente encontrado.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Reset Password Modal */}
            {resetModalOpen && selectedClient && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ width: '100%', maxWidth: '400px' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Redefinir Senha</h2>
                        <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                            Defina uma nova senha para <strong>{selectedClient.full_name}</strong>.
                        </p>

                        <form onSubmit={handleResetPassword}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontSize: '0.875rem' }}>Nova Senha</label>
                                <input
                                    type="text" // Visible so admin can see what they type
                                    className="input"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Digite a nova senha"
                                    required
                                    minLength={6}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            {resetMessage && (
                                <p style={{ marginBottom: '1rem', fontSize: '0.875rem', color: resetMessage.includes('Erro') ? 'red' : 'green', fontWeight: 600 }}>
                                    {resetMessage}
                                </p>
                            )}

                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="button" className="btn" onClick={() => setResetModalOpen(false)} style={{ flex: 1, background: 'var(--muted)' }} disabled={resetting}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={resetting}>
                                    {resetting ? <Loader2 className="animate-spin" size={16} /> : 'Salvar Nova Senha'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
