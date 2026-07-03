import { useEffect, useRef } from 'react';
import { supabase, Sale } from '../lib/supabase';
import { printBetTicket } from '../lib/printer';

// Sound effect for confirmed payment
const playSuccessSound = () => {
    try {
        const audio = new Audio('/notification.mp3'); 
        audio.play().catch(e => console.log("Audio play failed (interaction needed?):", e));
        console.log("Play success sound");
    } catch (e) {
        console.error("Error playing sound", e);
    }
};

export function useBetRealtime(
    sales: Sale[],
    setSales: React.Dispatch<React.SetStateAction<Sale[]>>
) {
    // Keep sales in a ref to access current state inside subscription callback without dependency loop
    const salesRef = useRef(sales);
    
    useEffect(() => {
        salesRef.current = sales;
    }, [sales]);

    useEffect(() => {
        let isMounted = true;
        // Unique channel name per hook instance plus a random suffix to avoid collisions during strict mode remounts
        const channelId = `bets_realtime_${Math.random().toString(36).substring(7)}`;

        console.log(`Setting up realtime subscription for bets (Channel: ${channelId})...`);

        const channel = supabase
            .channel(channelId)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'bets',
                },
                async (payload) => {
                    if (!isMounted) return;
                    
                    console.log("Realtime update received:", payload);
                    const updatedBet = payload.new;

                    // Check if this bet is in our list
                    const existingSaleIndex = salesRef.current.findIndex(s => s.id === updatedBet.id);
                    
                    if (existingSaleIndex !== -1) {
                        // Update the local state
                        setSales(prevSales => prevSales.map(sale => {
                            if (sale.id === updatedBet.id) {
                                return {
                                    ...sale,
                                    payment_status: updatedBet.payment_status,
                                    status: updatedBet.payment_status === 'paid' ? 'confirmed' : 'pending'
                                };
                            }
                            return sale;
                        }));

                        const validOldStatus = salesRef.current[existingSaleIndex].payment_status !== 'paid';
                        
                        if (updatedBet.payment_status === 'paid' && validOldStatus) {
                            console.log(`Payment confirmed for bet ${updatedBet.id}. Triggering actions...`);
                            
                            playSuccessSound();

                            const fullSaleData = {
                                ...salesRef.current[existingSaleIndex],
                                ...updatedBet,
                                payment_status: 'paid',
                                status: 'confirmed'
                            };

                            try {
                                const printData = {
                                    id: fullSaleData.id,
                                    concurso: fullSaleData.concurso,
                                    numbers: fullSaleData.numbers || [],
                                    amount: fullSaleData.amount || 0,
                                    clientName: fullSaleData.client_name || 'Cliente',
                                    clientPhone: fullSaleData.client_phone || 'Nao informado',
                                    createdAt: fullSaleData.created_at,
                                    resellerName: 'LuckyClover',
                                    ticketNumber: fullSaleData.ticket_number
                                };
                                
                                console.log("Auto-printing ticket...", printData);
                                await printBetTicket(printData);
                            } catch (err) {
                                if (isMounted) console.error("Auto-print failed:", err);
                            }
                        }
                    }
                }
            )
            .subscribe((status) => {
                if (isMounted) {
                    console.log(`Realtime subscription status (${channelId}):`, status);
                }
            });

        return () => {
            isMounted = false;
            // Guard to avoid calling removeChannel multiple times or in an invalid state
            if (channel) {
                supabase.removeChannel(channel).catch(err => {
                    console.log("Error removing realtime channel (can be ignored):", err);
                });
            }
        };
    }, [setSales]);
 // Re-run if setSales changes (unlikely)
}
