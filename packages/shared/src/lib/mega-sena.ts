export interface MegaSenaResult {
    concurso: number;
    data: string;
    dezenas: string[];
    acumulou: boolean;
    proximoConcurso: number;
    dataProximoConcurso: string;
    valorEstimadoProximoConcurso?: number;
}

// Fetch from Loterias API with fallback to mock data
export async function getMegaSenaResult(): Promise<MegaSenaResult> {
    try {
        const response = await fetch('https://loteriascaixa-api.herokuapp.com/api/megasena/latest');
        if (!response.ok) throw new Error('API unavailable');

        const data = await response.json();
        return {
            concurso: data.concurso,
            data: data.data,
            dezenas: data.dezenas,
            acumulou: data.acumulou,
            proximoConcurso: data.concurso + 1,
            dataProximoConcurso: data.dataProximoConcurso || 'A definir',
            valorEstimadoProximoConcurso: data.valorEstimadoProximoConcurso
        };
    } catch {
        // Fallback mock data for demo/offline mode
        return {
            concurso: 2670,
            data: "18/01/2026",
            dezenas: ["04", "12", "15", "32", "45", "58"],
            acumulou: true,
            proximoConcurso: 2671,
            dataProximoConcurso: "21/01/2026",
            valorEstimadoProximoConcurso: 58000000
        };
    }
}

// Check how many numbers match
export function checkBetResults(betNumbers: number[], drawnNumbers: string[]): number {
    const drawnSet = new Set(drawnNumbers.map(n => parseInt(n)));
    return betNumbers.filter(n => drawnSet.has(n)).length;
}

// Format currency in BRL
export function formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Format date in Brazilian format
export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('pt-BR');
}
