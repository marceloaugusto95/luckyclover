/**
 * Printer Library for Thermal Printers (58mm)
 * Targets: Stone T6900 / SUNMI P2
 *
 * Uses window.print() for browser-based printing on Stone POS devices.
 */

export interface TicketData {
    id: string;
    concurso: number;
    numbers: number[];
    amount: number;
    clientName: string;
    clientPhone: string;
    createdAt: string;
    resellerName: string;
    ticketNumber?: string;
}

/**
 * Formats the ticket data into a plain text structure optimized for thermal printers.
 * Thermal printers (58mm) usually have ~32 characters per line.
 */
export function formatTicketForThermal(data: TicketData): string {
    const divider = "--------------------------------";
    const center = (text: string) => {
        const space = Math.max(0, Math.floor((32 - text.length) / 2));
        return " ".repeat(space) + text;
    };

    // We break numbers into groups of 5 for readability on narrow paper
    const numberLines: string[] = [];
    for (let i = 0; i < data.numbers.length; i += 5) {
        numberLines.push(
            data.numbers.slice(i, i + 5).map((n) =>
                n.toString().padStart(2, "0")
            ).join("  "),
        );
    }

    const dateObj = data.createdAt ? new Date(data.createdAt) : new Date();
    const dateStr = (isNaN(dateObj.getTime()) ? new Date() : dateObj)
        .toLocaleString("pt-BR");

    return [
        "",
        center("LuckyClover"),
        center("LuckyClover"),
        divider,
        center("*** COMPROVANTE DE JOGO ***"),
        divider,
        center(`DATA: ${dateStr.split(", ")[0]}`),
        center(`HORA: ${dateStr.split(", ")[1]}`),
        center(`CONCURSO: ${data.concurso}`),
        data.ticketNumber ? center(`BILHETE: #${data.ticketNumber}`) : "",
        divider,
        center("DEZENAS ESCOLHIDAS:"),
        "",
        ...numberLines.map((line) => center(line)),
        "",
        divider,
        center(`VALOR TOTAL: R$ ${data.amount.toFixed(2)}`),
        center(`CLIENTE: ${data.clientName.toUpperCase()}`),
        center(`TEL: ${data.clientPhone}`),
        divider,
        center("Para acompanhar sua aposta"),
        center("e realizar outras acesse:"),
        center("www.amigos.luckyclover154.com.br/"),
        "",
        center("Insira os mesmos dados que"),
        center("foram fornecidos na aposta"),
        center("para realizar seu cadastro."),
        "",
        center("Fique com este comprovante."),
        center("Boa sorte!"),
        "",
        "",
        "", // Extra space for tearing
    ].join("\n");
}

export interface ContestResultData {
    concurso: number;
    date: string;
    numbers: string[]; // Already formatted or strings
    winnersSena: number;
    winnersQuina: number;
}

export function formatResultForThermal(data: ContestResultData): string {
    const divider = "--------------------------------";
    const center = (text: string) => {
        const space = Math.max(0, Math.floor((32 - text.length) / 2));
        return " ".repeat(space) + text;
    };

    // Format numbers row (e.g., 04 12 28 32 45 49)
    // Assuming we have 6 numbers, 2 digits each.
    // 6 * 2 + 5 spaces = 12 + 5 = 17 chars. Fits easily in 32.
    const numbersLine = data.numbers.map((n) => n.toString().padStart(2, "0"))
        .join(" ");

    return [
        "",
        center("LuckyClover"),
        center("LuckyClover"),
        divider,
        center("RESULTADO DO CONCURSO"),
        center(`${data.concurso}`),
        center(data.date),
        divider,
        "",
        center(numbersLine),
        "",
        divider,
        center("GANHADORES NO LUCKYCLOVER:"),
        "",
        `SENA (6): ${data.winnersSena}`.padEnd(32, " "), // Left align or maybe center? Let's just padding
        `QUINA (5): ${data.winnersQuina}`.padEnd(32, " "),
        "",
        divider,
        center("Confira seu bilhete!"),
        center("Boa sorte!"),
        "",
        "",
        "",
    ].join("\n");
}

export interface CartTicketData {
    cartId: string;
    items: {
        game: string;
        numbers: number[];
        amount: number;
        concurso: number;
        ticket_number?: string;
    }[];
    clientName: string;
    clientPhone: string;
    date: string;
    totalAmount: number;
}

export function formatCartTicketForThermal(data: CartTicketData): string {
    const divider = "--------------------------------";
    const center = (text: string) => {
        const space = Math.max(0, Math.floor((32 - text.length) / 2));
        return " ".repeat(space) + text;
    };

    const itemsContent = data.items.map((item, idx) => {
        // Split numbers if too long (more than 5-6 numbers logic or just line wrapping)
        // Simple wrap logic:
        const chunkedNums = [];
        for (let i = 0; i < item.numbers.length; i += 5) {
            chunkedNums.push(
                item.numbers.slice(i, i + 5).map((n) =>
                    n.toString().padStart(2, "0")
                ).join("  "),
            );
        }

        return [
            `JOGO ${idx + 1} - CONC: ${item.concurso}`,
            item.ticket_number ? `BILHETE: #${item.ticket_number}` : "",
            ...chunkedNums.map((l) => center(l)),
            `R$ ${item.amount.toFixed(2)}`.padStart(32, " "),
            "-".repeat(32),
        ].filter((line) => line !== "").join("\n");
    }).join("\n");

    return [
        "",
        center("LuckyClover"),
        center("LuckyClover"),
        divider,
        center("*** COMPROVANTE (CARRINHO) ***"),
        divider,
        center(
            `DATA: ${
                (data.date ? new Date(data.date) : new Date()).toLocaleString(
                    "pt-BR",
                ).split(", ")[0] || "-"
            }`,
        ),
        center(
            `HORA: ${
                (data.date ? new Date(data.date) : new Date()).toLocaleString(
                    "pt-BR",
                ).split(", ")[1] || "-"
            }`,
        ),
        divider,
        itemsContent,
        divider,
        center(`TOTAL: R$ ${data.totalAmount.toFixed(2)}`),
        center(`CLIENTE: ${data.clientName.toUpperCase()}`),
        center(`TEL: ${data.clientPhone}`),
        divider,
        center("Para acompanhar suas apostas"),
        center("acesse:"),
        center("www.amigos.luckyclover154.com.br/"),
        "",
        center("Fique com este comprovante."),
        center("Boa sorte!"),
        "",
        "",
        "",
    ].join("\n");
}

export interface ReportItem {
    concurso: number;
    total_sales: number;
    total_commission: number;
    bets: any[];
}

export function formatResellerReportForThermal(
    data: ReportItem[],
    resellerName: string,
): string {
    const divider = "--------------------------------";
    const center = (text: string) => {
        const space = Math.max(0, Math.floor((32 - text.length) / 2));
        return " ".repeat(space) + text;
    };

    const totalSales = data.reduce(
        (acc, curr) => acc + Number(curr.total_sales),
        0,
    );
    const totalCommission = data.reduce(
        (acc, curr) => acc + Number(curr.total_commission),
        0,
    );

    const concursosContent = data.map((item) => {
        return [
            `CONCURSO: #${item.concurso}`,
            `Vendas: R$ ${Number(item.total_sales).toFixed(2)}`,
            `Comiss: R$ ${Number(item.total_commission).toFixed(2)}`,
            "- - - - - - - - - - - - - - - - ",
        ].join("\n");
    }).join("\n");

    return [
        "",
        center("LuckyClover"),
        center("LuckyClover"),
        divider,
        center("RELATORIO DE VENDAS"),
        center(resellerName.toUpperCase()),
        center(`DATA: ${new Date().toLocaleDateString("pt-BR")}`),
        divider,
        "",
        concursosContent,
        "",
        divider,
        center(`TOTAL VENDAS: R$ ${totalSales.toFixed(2)}`),
        center(`TOTAL COMISS: R$ ${totalCommission.toFixed(2)}`),
        divider,
        "",
        center("LuckyClover"),
        "",
        "",
        "",
    ].join("\n");
}

// ============================================================
// Browser-based Printing (for Stone POS / Chrome)
// ============================================================

/**
 * Triggers printing.
 * Priority:
 * 1. SUNMI Native Plugin (Capacitor)
 * 2. Stone DeepLink (for Stone POS via Intent to avoid ERR_UNKNOWN_URL_SCHEME crash)
 * 3. window.print() fallback
 */
async function triggerBrowserPrint(
    content: string,
): Promise<{ success: boolean }> {
    // Check for Capacitor and try native SUNMI plugin first
    const Capacitor = (window as any).Capacitor;

    if (Capacitor && Capacitor.Plugins && Capacitor.Plugins.SunmiPrinter) {
        console.log("SUNMI plugin detected, checking availability...");
        try {
            const { available } = await Capacitor.Plugins.SunmiPrinter
                .isAvailable();
            if (available) {
                console.log("SUNMI printer available, printing natively...");
                await Capacitor.Plugins.SunmiPrinter.printText({
                    text: content,
                });
                return { success: true };
            } else {
                console.log(
                    "SUNMI printer not available, fallback to other methods...",
                );
            }
        } catch (err) {
            console.warn("SUNMI plugin error, fallback:", err);
        }
    }

    // Detect if running in Android (includes TWA/Browser)
    const isAndroid = /Android/i.test(navigator.userAgent);

    const printViaBrowserFallback = () => {
        console.log("Browser environment or fallback, using window.print()...");
        return new Promise<{ success: boolean }>((resolve) => {
            // Get or create the print container
            let container = document.getElementById("print-container");
            if (!container) {
                container = document.createElement("div");
                container.id = "print-container";
                document.body.appendChild(container);
            }

            // Set the content (wrapped in a pre tag for monospace formatting).
            // Usa textContent, e nao innerHTML: o ticket carrega dados digitados
            // por terceiros (nome e TELEFONE do cliente, este sem toUpperCase),
            // que com innerHTML eram injetados como HTML na origem do PDV --
            // onde fica o token do revendedor no localStorage.
            const pre = document.createElement("pre");
            pre.className = "print-ticket";
            pre.textContent = content;
            container.replaceChildren(pre);

            // Small delay to ensure DOM is updated, then print
            setTimeout(() => {
                window.print();

                // Clear content after print dialog closes
                setTimeout(() => {
                    if (container) {
                        container.innerHTML = "";
                    }
                    resolve({ success: true });
                }, 500);
            }, 100);
        });
    };

    if (isAndroid) {
        console.log("Android detected, trying DeepLink printing...");

        return new Promise((resolve) => {
            try {
                const encodedContent = encodeURIComponent(content);

                // Reverting to direct DeepLink because Intents via iframe
                // are often blocked by Chrome security policies (requires transient activation).
                // The Stone POS captures this specific scheme globally.
                const stoneUri =
                    `printer-app://print?SHOW_FEEDBACK_SCREEN=true&PRINTABLE_CONTENT=${encodedContent}`;

                console.log("Attempting direct Stone DeepLink...");
                window.location.href = stoneUri;

                // If the app doesn't catch the scheme, the page remains and we might see an error.
                // We provide a fallback timeout to trigger standard web print just in case,
                // or simply resolve if the page hasn't crashed.
                setTimeout(() => {
                    if (document.visibilityState === "visible") {
                        console.log(
                            "DeepLink might have failed or ignored. Trying fallback...",
                        );
                        printViaBrowserFallback().then(resolve);
                    } else {
                        resolve({ success: true });
                    }
                }, 2000);
            } catch (err) {
                console.error("Android printing error:", err);
                printViaBrowserFallback().then(resolve);
            }
        });
    }

    // Direct Browser fallback (Desktop or non-Android mobile)
    return printViaBrowserFallback();
}

/**
 * Prints contest result ticket
 */
export async function printContestResult(data: ContestResultData) {
    const text = formatResultForThermal(data);

    try {
        console.log("Printing contest result:", text);
        await triggerBrowserPrint(text);
        return { success: true };
    } catch (error) {
        console.error("Printing failed:", error);
        return { success: false, error, virtualTicket: text };
    }
}

/**
 * Prints a single bet ticket
 */
export async function printBetTicket(data: TicketData) {
    const text = formatTicketForThermal(data);

    try {
        console.log("Printing bet ticket:", text);
        await triggerBrowserPrint(text);
        return { success: true };
    } catch (error) {
        console.error("Printing failed:", error);
        return { success: false, error, virtualTicket: text };
    }
}

/**
 * Prints a cart ticket (multiple bets)
 */
export async function printCartTicket(data: CartTicketData) {
    const text = formatCartTicketForThermal(data);

    try {
        console.log("Printing cart ticket:", text);
        await triggerBrowserPrint(text);
        return { success: true };
    } catch (error) {
        console.error("Printing failed:", error);
        return { success: false, error, virtualTicket: text };
    }
}

/**
 * Prints reseller sales report
 */
export async function printResellerReport(
    data: ReportItem[],
    resellerName: string,
) {
    const text = formatResellerReportForThermal(data, resellerName);

    try {
        console.log("Printing reseller report:", text);
        await triggerBrowserPrint(text);
        return { success: true };
    } catch (error) {
        console.error("Printing failed:", error);
        return { success: false, error, virtualTicket: text };
    }
}
