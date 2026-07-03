import { X } from 'lucide-react';

interface PrivacyPolicyModalProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * Política de Privacidade / Aviso LGPD (modelo).
 * IMPORTANTE: este é um texto-base. Revise com apoio jurídico e preencha os
 * dados do controlador (razão social, CNPJ, e-mail/DPO) antes de uso em produção.
 */
export default function PrivacyPolicyModal({ isOpen, onClose }: PrivacyPolicyModalProps) {
    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2000, padding: '1rem'
            }}
            onClick={onClose}
        >
            <div
                className="card"
                style={{ width: '100%', maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto', position: 'relative' }}
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    aria-label="Fechar"
                    style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'none', border: 'none', cursor: 'pointer', color: '#999' }}
                >
                    <X size={20} />
                </button>

                <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Política de Privacidade e Uso de Dados</h2>
                <p style={{ fontSize: '0.8rem', color: '#777', marginBottom: '1rem' }}>
                    Em conformidade com a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).
                </p>

                <div style={{ fontSize: '0.875rem', lineHeight: 1.6, color: '#333', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <section>
                        <strong>1. Quem somos</strong>
                        <p>Esta plataforma ("LuckyClover / LuckyClover") realiza a gestão de apostas
                        e sorteios. O responsável pelo tratamento dos seus dados (controlador) é o organizador
                        do serviço. Em caso de dúvidas sobre seus dados, utilize o canal de contato/suporte
                        disponível no aplicativo.</p>
                    </section>

                    <section>
                        <strong>2. Quais dados coletamos</strong>
                        <p>Coletamos os dados que você nos fornece no cadastro e na utilização do serviço:
                        nome completo, CPF, telefone, cidade e chave PIX. Também registramos dados das suas
                        apostas e pagamentos (valores, concursos, status).</p>
                    </section>

                    <section>
                        <strong>3. Para que usamos seus dados (finalidades)</strong>
                        <ul style={{ margin: '0.25rem 0 0 1.1rem', padding: 0 }}>
                            <li>Criar e gerenciar sua conta;</li>
                            <li>Registrar e processar suas apostas e a participação nos sorteios;</li>
                            <li>Processar pagamentos e o pagamento de prêmios via PIX;</li>
                            <li>Entrar em contato sobre apostas, prêmios e suporte;</li>
                            <li>Cumprir obrigações legais e de prevenção a fraudes.</li>
                        </ul>
                    </section>

                    <section>
                        <strong>4. Base legal</strong>
                        <p>O tratamento se fundamenta no seu <em>consentimento</em> e na <em>execução do
                        serviço</em> que você contrata ao apostar, além do cumprimento de obrigações legais.</p>
                    </section>

                    <section>
                        <strong>5. Compartilhamento</strong>
                        <p>Seus dados podem ser compartilhados com prestadores essenciais à operação, como o
                        processador de pagamentos (Mercado Pago, para cobranças e repasses via PIX) e a
                        infraestrutura de hospedagem/banco de dados. Não vendemos seus dados.</p>
                    </section>

                    <section>
                        <strong>6. Armazenamento e segurança</strong>
                        <p>Adotamos medidas técnicas para proteger seus dados (controle de acesso, criptografia
                        em trânsito e regras de segurança no banco de dados). Os dados são mantidos pelo tempo
                        necessário às finalidades acima e às exigências legais.</p>
                    </section>

                    <section>
                        <strong>7. Cookies e armazenamento local</strong>
                        <p>Utilizamos armazenamento local (localStorage) essencial para manter você conectado e
                        para o funcionamento do aplicativo. Esses dados ficam no seu dispositivo.</p>
                    </section>

                    <section>
                        <strong>8. Seus direitos (LGPD)</strong>
                        <p>Você pode solicitar a qualquer momento: confirmação e acesso aos seus dados,
                        correção, portabilidade, eliminação, informação sobre compartilhamentos e a revogação
                        do consentimento. Para exercer seus direitos, utilize o canal de contato/suporte.</p>
                    </section>

                    <section>
                        <strong>9. Idade mínima</strong>
                        <p>O serviço é destinado a maiores de 18 anos.</p>
                    </section>
                </div>

                <button className="btn btn-primary" style={{ width: '100%', marginTop: '1.25rem' }} onClick={onClose}>
                    Entendi
                </button>
            </div>
        </div>
    );
}
