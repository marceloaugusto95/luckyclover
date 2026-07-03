import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

export const generateIndividualFinancialReport = (
    contest: ContestFinancialData,
    betsReport: ContestBetReportItem[],
) => {
    const doc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Colors
    const primaryGreen: [number, number, number] = [46, 125, 50];
    const darkBlue: [number, number, number] = [0, 51, 102];
    const white: [number, number, number] = [255, 255, 255];
    const lightGray: [number, number, number] = [240, 240, 240];

    // ========== HEADER: "BOLÃO MEGA 20" ==========
    doc.setFillColor(...primaryGreen);
    doc.rect(0, 0, pageWidth, 12, "F");
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("LuckyClover", pageWidth / 2, 8, {
        align: "center",
    });

    // ========== STATS SECTION ==========
    const statsY = 16;

    // Count hits distribution
    const hitCounts = [0, 0, 0, 0, 0, 0, 0]; // indices 0-6
    if (betsReport) {
        betsReport.forEach((b) => {
            const h = Math.min(b.hits, 6);
            hitCounts[h]++;
        });
    }
    const totalParticipants = betsReport?.length || 0;

    // Left side: hit counts
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    for (let i = 0; i <= 6; i++) {
        const yPos = statsY + i * 4.5;
        const count = i === 0 ? totalParticipants : hitCounts[i];
        doc.setFont("helvetica", "bold");
        doc.text(`${count}`, 10, yPos);
        doc.setFont("helvetica", "normal");
        doc.text("PESSOAS ACERTARAM", 20, yPos);
        doc.setFont("helvetica", "bold");
        doc.text(`${i}`, 58, yPos);
    }

    // Center: CONCURSO and DATA
    const centerX = pageWidth / 2 - 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("CONCURSO", centerX - 15, statsY + 4);

    // Concurso number in green box
    doc.setFillColor(...primaryGreen);
    doc.rect(centerX + 10, statsY, 25, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(`${contest.concurso}`, centerX + 22, statsY + 4.5, {
        align: "center",
    });

    // DATA
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text("DATA", centerX - 15, statsY + 14);
    doc.setFillColor(...primaryGreen);
    doc.rect(centerX + 10, statsY + 10, 35, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(contest.date, centerX + 27, statsY + 14.5, { align: "center" });

    // PARTICIPANTES
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("PARTICIPANTES", centerX - 15, statsY + 24);
    doc.setFillColor(...primaryGreen);
    doc.rect(centerX + 20, statsY + 20, 25, 6, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text(`${totalParticipants}`, centerX + 32, statsY + 24.5, {
        align: "center",
    });

    // Right side: NÚMEROS SORTEADOS
    const rightX = pageWidth - 80;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("NÚMEROS SORTEADOS", rightX, statsY + 4);

    // Draw drawn number boxes
    const drawnNums = contest.drawnNumbers.filter((n) => n !== 0);
    let boxX = rightX;
    drawnNums.forEach((n) => {
        doc.setFillColor(0, 51, 153);
        doc.rect(boxX, statsY + 6, 8, 7, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.text(n.toString().padStart(2, "0"), boxX + 4, statsY + 11, {
            align: "center",
        });
        boxX += 10;
    });

    // VALOR DO PRÊMIO
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("VALOR DO PRÊMIO", rightX, statsY + 21);
    const prizeValue = contest.prizePool || 0;
    doc.setTextColor(46, 125, 50);
    doc.setFontSize(12);
    doc.text(
        `R$${prizeValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        rightX,
        statsY + 27,
    );

    // ========== TABLE SECTION ==========
    const tableStartY = statsY + 34;

    if (betsReport && betsReport.length > 0) {
        // Sort alphabetically by client_name
        const sortedBets = [...betsReport].sort((a, b) =>
            (a.client_name || "").localeCompare(b.client_name || "")
        );

        // Find max numbers count for columns
        const maxNumbers = Math.max(
            ...sortedBets.map((b) => b.numbers.length),
            6,
        );

        // Build header
        const header = ["Nº", "PARTICIPANTES", "CUPOM"];
        for (let i = 0; i < maxNumbers; i++) {
            header.push(""); // Individual JOGOS columns
        }
        header.push("ACERTOS");

        // Build body
        const body = sortedBets.map((b, idx) => {
            const row: string[] = [
                `${idx + 1}`,
                (b.client_name || "Anônimo").toUpperCase(),
                (b.coupon_code || "APP").toUpperCase(),
            ];
            const sorted = [...b.numbers].sort((a, c) => a - c);
            for (let i = 0; i < maxNumbers; i++) {
                row.push(sorted[i] !== undefined ? sorted[i].toString() : "");
            }
            row.push(`${b.hits}`);
            return row;
        });

        // Column styles
        const colStyles: Record<number, any> = {
            0: { cellWidth: 10, halign: "center" },
            1: { cellWidth: 45 },
            2: { cellWidth: 20, halign: "center", fontSize: 7 },
        };
        for (let i = 3; i < 3 + maxNumbers; i++) {
            colStyles[i] = { cellWidth: 7, halign: "center", fontSize: 7 };
        }
        colStyles[3 + maxNumbers] = {
            cellWidth: 14,
            halign: "center",
            fontStyle: "bold",
        };

        autoTable(doc, {
            startY: tableStartY,
            head: [header],
            body: body,
            theme: "grid",
            styles: {
                fontSize: 7,
                cellPadding: 1,
                lineColor: [0, 0, 0],
                lineWidth: 0.2,
            },
            headStyles: {
                fillColor: darkBlue,
                textColor: white,
                fontStyle: "bold",
                halign: "center",
                fontSize: 7,
            },
            columnStyles: colStyles,
            alternateRowStyles: {
                fillColor: lightGray,
            },
            didDrawCell: (data) => {
                // Draw "JOGOS" text spanning across number columns in header
                if (data.section === "head" && data.column.index === 3) {
                    const cell = data.cell;
                    doc.setFillColor(...darkBlue);
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(8);
                    doc.setFont("helvetica", "bold");
                    const jogosWidth = maxNumbers * 7;
                    doc.text("JOGOS", cell.x + jogosWidth / 2, cell.y + 3.5, {
                        align: "center",
                    });
                }
            },
            didParseCell: (data) => {
                if (data.section === "body") {
                    const rowRaw = data.row.raw as string[];
                    const hits = parseInt(rowRaw[rowRaw.length - 1] || "0");

                    // Color the entire row for winners
                    // 6 hits: Green, 5 hits: Orange, 4 and below (winners): Blue
                    if (hits >= 6) {
                        data.cell.styles.fillColor = [46, 125, 50]; // Green
                        data.cell.styles.textColor = [255, 255, 255];
                        data.cell.styles.fontStyle = "bold";
                    } else if (hits === 5) {
                        data.cell.styles.fillColor = [239, 108, 0]; // Orange
                        data.cell.styles.textColor = [255, 255, 255];
                        data.cell.styles.fontStyle = "bold";
                    } else if (hits > 0 && hits <= 4) { // Assumes hits > 0 could be considered a winner here based on "4 and below"
                        data.cell.styles.fillColor = [25, 118, 210]; // Blue
                        data.cell.styles.textColor = [255, 255, 255];
                        data.cell.styles.fontStyle = "bold";
                    }

                    // Keep the ACERTOS column slightly larger
                    if (data.column.index === 3 + maxNumbers) {
                        data.cell.styles.fontStyle = "bold";
                        data.cell.styles.fontSize = 9;
                        if (hits === 0) {
                            data.cell.styles.textColor = [46, 125, 50];
                        }
                    }
                }
            },
            margin: { left: 5, right: 5 },
        });
    }

    doc.save(`relatorio_geral_concurso_${contest.concurso}.pdf`);
};

export const generateGeneralFinancialReport = (
    contests: ContestFinancialData[],
) => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(22);
    doc.setTextColor(46, 125, 50);
    doc.text("Relatório Financeiro Geral", 105, 20, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 105, 28, {
        align: "center",
    });

    // Summary Table
    const totalRevenue = contests.reduce((acc, c) => acc + c.totalRevenue, 0);
    const totalBets = contests.reduce((acc, c) => acc + c.totalBets, 0);

    const totalCommission = contests.reduce(
        (acc, c) => acc + c.totalCommission,
        0,
    );
    const totalPrizes = contests.reduce(
        (acc, c) => acc + (c.totalPrizesPaid || 0),
        0,
    );
    const totalProfit = contests.reduce((acc, c) => acc + c.houseProfit, 0);

    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text("Resumo Consolidado", 14, 45);

    const fmt = (v: number) =>
        `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

    autoTable(doc, {
        startY: 50,
        head: [[
            "Total Concursos",
            "Arrecadação",
            "Apostas",
            "Comissões",
            "Premiação",
            "Lucro Casa",
        ]],
        body: [[
            contests.length.toString(),
            fmt(totalRevenue),
            totalBets.toString(),
            fmt(totalCommission),
            fmt(totalPrizes),
            fmt(totalProfit),
        ]],
        theme: "striped",
        headStyles: { fillColor: [46, 125, 50] },
        styles: { fontSize: 8 },
    });

    // Contests Table
    doc.setFontSize(14);
    doc.text(
        "Detalhamento por Concurso",
        14,
        (doc as any).lastAutoTable.finalY + 15,
    );

    const contestsTableData = contests.map((c) => [
        `#${c.concurso}`,
        c.date,
        c.processed ? "Finalizado" : "Em Aberto",
        c.totalBets.toString(),
        fmt(c.totalRevenue),
        fmt(c.totalCommission),
        fmt(c.totalPrizesPaid || 0),
        fmt(c.houseProfit),
    ]);

    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [[
            "Concurso",
            "Data",
            "Status",
            "Apostas",
            "Arrecadação",
            "Comissões",
            "Premiação",
            "Lucro Casa",
        ]],
        body: contestsTableData,
        theme: "grid",
        headStyles: { fillColor: [66, 66, 66] },
        styles: { fontSize: 7 },
    });

    doc.save("relatorio_financeiro_geral.pdf");
};
