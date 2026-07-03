import * as XLSX from "xlsx";
import { type ContestBetReportItem, type Winner } from "../lib/supabase";

interface ContestFinancialData {
    concurso: number;
    date: string;
    totalRevenue: number;
    totalBets: number;
    totalCommission: number;
    houseProfit: number;
    winners: Winner[];
    drawnNumbers: number[];
    processed: boolean;
    prizePool?: number;
    senaPrize?: number;
    quinaPrize?: number;
    totalPrizesPaid?: number;
}

export const generateIndividualFinancialReportExcel = (
    contest: ContestFinancialData,
    betsReport: ContestBetReportItem[],
) => {
    const wb = XLSX.utils.book_new();
    const rows: (string | number)[][] = [];

    // Summary rows
    rows.push(["LuckyClover"]);
    rows.push(["CONCURSO", contest.concurso]);
    rows.push(["DATA", contest.date]);
    rows.push(["PARTICIPANTES", betsReport?.length || 0]);
    const prizeValue = contest.prizePool || 0;
    rows.push(["VALOR DO PRÊMIO", `R$${prizeValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`]);
    const drawnNums = contest.drawnNumbers.filter((n) => n !== 0);
    rows.push(["NÚMEROS SORTEADOS", drawnNums.join(", ")]);

    // Hit distribution
    const hitCounts = [0, 0, 0, 0, 0, 0, 0];
    if (betsReport) {
        betsReport.forEach((b) => {
            const h = Math.min(b.hits, 6);
            hitCounts[h]++;
        });
    }
    for (let i = 0; i <= 6; i++) {
        rows.push([`${hitCounts[i]} PESSOAS ACERTARAM ${i}`]);
    }

    // Spacer
    rows.push([]);

    if (betsReport && betsReport.length > 0) {
        const sortedBets = [...betsReport].sort((a, b) =>
            (a.client_name || "").localeCompare(b.client_name || "")
        );

        const maxNumbers = Math.max(
            ...sortedBets.map((b) => b.numbers.length),
            6,
        );

        // Header row
        const header: string[] = ["Nº", "PARTICIPANTES", "CUPOM"];
        for (let i = 1; i <= maxNumbers; i++) {
            header.push(`Jogo ${i}`);
        }
        header.push("ACERTOS");
        rows.push(header);

        // Data rows
        sortedBets.forEach((b, idx) => {
            const row: (string | number)[] = [
                idx + 1,
                (b.client_name || "Anônimo").toUpperCase(),
                (b.coupon_code || "APP").toUpperCase(),
            ];
            const sorted = [...b.numbers].sort((a, c) => a - c);
            for (let i = 0; i < maxNumbers; i++) {
                row.push(sorted[i] !== undefined ? sorted[i] : "");
            }
            row.push(b.hits);
            rows.push(row);
        });
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");

    const blob = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_geral_concurso_${contest.concurso}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
};
