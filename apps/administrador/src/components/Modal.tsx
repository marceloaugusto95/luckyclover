import { X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            {/* Backdrop */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)'
                }}
                onClick={onClose}
            />

            {/* Content */}
            <div
                className="animate-in fade-in zoom-in-95 duration-200"
                style={{
                    position: 'relative',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '0.75rem',
                    boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                    width: '100%',
                    maxWidth: '32rem',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    margin: '1rem',
                    zIndex: 51
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1.25rem',
                    borderBottom: '1px solid var(--border)'
                }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{title}</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--muted-foreground)',
                            padding: '0.25rem',
                            display: 'flex',
                            borderRadius: '0.375rem',
                            transition: 'background-color 0.2s'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '1.5rem' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
