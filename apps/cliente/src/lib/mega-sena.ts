export interface MegaSenaResult {
    concurso: number;
    data: string;
    dezenas: string[];
    acumulou: boolean;
    proximoConcurso: number;
    dataProximoConcurso: string;
}

// Helper to format date string (YYYY-MM-DD) to DD/MM/YYYY without timezone shifts
export function formatDrawDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "A definir";
    // Handle YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss...
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const [_, year, month, day] = match;
        return `${day}/${month}/${year}`;
    }
    return dateStr;
}

// Helper to find the next Tue (2), Thu (4), or Sat (6)
export function getNextDrawDate(): Date {
    const today = new Date();

    // Simple iteration
    const checkDate = new Date(today);

    // If today is valid draw day (Tue, Thu, Sat), keep it.
    if ([2, 4, 6].includes(checkDate.getDay())) {
        return checkDate;
    }

    // Scan next 7 days
    for (let i = 1; i <= 7; i++) {
        checkDate.setDate(today.getDate() + 1);
        if ([2, 4, 6].includes(checkDate.getDay())) {
            return checkDate;
        }
    }
    return checkDate;
}

export async function getMegaSenaResult(): Promise<MegaSenaResult> {
    // Strategy: Try Internal DB first, then External API, then fallback mock

    // 1. Try Internal Database (Supabase)
    try {
        const { supabase } = await import("./supabase");

        // 1. Get the next OPEN contest strictly
        const { data: nextOpenList } = await supabase
            .from("concursos")
            .select("*")
            .eq("status", "open")
            .order("concurso_number", { ascending: true })
            .limit(1);

        const nextOpen = nextOpenList?.[0];

        // 2. Get the latest CLOSED contest strictly
        const { data: latestClosedList } = await supabase
            .from("concursos")
            .select("*")
            .eq("status", "closed")
            .order("concurso_number", { ascending: false })
            .limit(1);

        const latestClosed = latestClosedList?.[0];

        if (latestClosed || nextOpen) {
            // Determine "next contest"
            // Ensure next contest > latest closed if both exist
            // If nextOpen exists and is > latestClosed, use it.
            // If latestClosed exists but nextOpen is null (e.g. not created yet), use latestClosed + 1
            let proximoConcurso = 0;
            let dataProximoConcurso = "A definir";

            if (nextOpen) {
                proximoConcurso = nextOpen.concurso_number;
                dataProximoConcurso = formatDrawDate(nextOpen.draw_date);
            } else if (latestClosed) {
                // Fallback: assume next is +1
                proximoConcurso = latestClosed.concurso_number + 1;
                const nextDraw = getNextDrawDate();
                dataProximoConcurso = nextDraw.toLocaleDateString("pt-BR");
            }

            // If we have latest closed, display it
            if (latestClosed) {
                return {
                    concurso: latestClosed.concurso_number,
                    data: formatDrawDate(latestClosed.draw_date),
                    dezenas: latestClosed.drawn_numbers.map((n: number) =>
                        n.toString().padStart(2, "0")
                    ),
                    acumulou: false,
                    proximoConcurso,
                    dataProximoConcurso,
                };
            }

            // If only nextOpen exists (no closed contests ever?), fallback to dummy "prev" or just return next
            if (nextOpen && !latestClosed) {
                // Return dummy "latest" as 0? or handle gracefully?
                // The UI expects a "last result".
                // Maybe return nextOpen as the "next" part, and dummy for current?
                return {
                    concurso: 0,
                    data: "",
                    dezenas: [],
                    acumulou: false,
                    proximoConcurso,
                    dataProximoConcurso,
                };
            }
        }
    } catch (dbError: any) {
        console.log("Internal DB unavailable, trying external API...", dbError);
    }

    // 2. Try External API (fallback)
    try {
        const response = await fetch(
            "https://loteriascaixa-api.herokuapp.com/api/megasena/latest",
        );
        if (!response.ok) throw new Error("API unavailable");
        const data = await response.json();
        return {
            concurso: data.concurso,
            data: data.data,
            dezenas: data.dezenas,
            acumulou: data.acumulou,
            proximoConcurso: data.concurso + 1,
            dataProximoConcurso: data.dataProximoConcurso || "A definir",
        };
    } catch {
        // 3. Fallback mock data
        const nextDraw = getNextDrawDate();
        const dateStr = nextDraw.toLocaleDateString("pt-BR");

        return {
            concurso: 2670,
            data: "18/01/2026",
            dezenas: ["04", "12", "15", "32", "45", "58"],
            acumulou: true,
            proximoConcurso: 2671,
            dataProximoConcurso: dateStr,
        };
    }
}
