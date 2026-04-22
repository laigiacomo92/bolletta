// =============================================================
// Simulatore Bolletta PLACET EE Variabile
// Calcoli conformi allo script Python di riferimento.
// =============================================================

(function () {
    "use strict";

    // ---------- Utility ----------
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    const EUR = (n) =>
        new Intl.NumberFormat("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(n) + " €";

    const NUM4 = (n) =>
        new Intl.NumberFormat("it-IT", {
            minimumFractionDigits: 4,
            maximumFractionDigits: 6,
        }).format(n);

    const PCT = (n) =>
        new Intl.NumberFormat("it-IT", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        }).format(n) + " %";

    // Nomi dei mesi (abbreviati e lunghi)
    const MONTHS = [
        "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
        "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
    ];
    const MONTHS_LONG = [
        "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
        "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
    ];

    // Serie storica del PUN medio mensile (€/MWh).
    // Fonte: Mercato Elettrico Italiano (GME) — valori medi mensili.
    // Gli array sono ordinati gen→dic.
    const PUN_HISTORY_MWH = {
        2025: [118.3, 115.0, 112.0, 108.5, 105.2, 110.8, 116.5, 108.8, 109.1, 111.0, 117.1, 115.5],
        2024: [99.1, 87.6, 88.9, 86.8, 94.9, 103.2, 112.3, 128.3, 117.1, 116.6, 122.5, 121.6],
        2023: [174.5, 161.1, 136.4, 116.8, 105.7, 105.3, 112.1, 111.9, 115.7, 134.3, 121.7, 115.5],
        2022: [224.5, 211.7, 308.1, 246.0, 230.1, 271.3, 441.7, 543.1, 429.9, 211.2, 224.5, 294.9],
        2021: [60.7, 56.6, 60.4, 69.0, 70.0, 84.8, 102.7, 112.4, 158.6, 217.6, 225.9, 281.2],
        2020: [47.5, 39.3, 32.0, 24.8, 21.8, 28.1, 38.0, 40.3, 48.8, 46.6, 48.9, 54.0],
        2019: [67.7, 59.4, 52.9, 52.2, 50.7, 48.4, 51.9, 47.8, 51.8, 53.5, 57.0, 54.6],
        2018: [50.2, 55.7, 54.3, 45.7, 51.9, 60.6, 60.1, 67.6, 76.3, 71.5, 67.9, 69.1],
        2017: [72.2, 56.9, 43.1, 43.6, 45.0, 49.0, 51.4, 53.7, 51.9, 58.1, 68.0, 65.4],
        2016: [48.8, 38.0, 31.4, 33.2, 34.7, 38.6, 42.9, 40.9, 45.0, 54.3, 55.5, 56.1],
        2015: [50.5, 53.8, 50.4, 48.1, 49.6, 55.1, 63.4, 46.9, 51.6, 54.4, 54.9, 52.2],
        2010: [64.8, 62.5, 61.5, 65.1, 66.7, 64.9, 69.6, 59.5, 64.4, 67.5, 68.2, 67.5],
    };

    // Anno di default usato come preset quando si passa a "Prezzo mensile"
    const DEFAULT_PRICE_YEAR = 2025;

    // Profili di consumo tipici — 12 valori mensili in kWh (gen→dic).
    // Fonte: profili ARERA standard ricavati da studi di settore.
    const CONSUMPTION_PROFILES = {
        standard: {
            label: "Standard (2.700 kWh/anno)",
            kwh: [250, 220, 210, 190, 180, 220, 280, 260, 210, 200, 230, 250],
        },
        full_electric: {
            label: "Full Electric (5.500 kWh/anno)",
            kwh: [750, 650, 450, 250, 200, 350, 550, 500, 300, 250, 500, 750],
        },
        single: {
            label: "Single (1.270 kWh/anno)",
            kwh: [110, 100, 100, 90, 90, 110, 130, 110, 100, 100, 110, 120],
        },
    };

    // Converte i prezzi €/MWh → €/kWh (serve dividere per 1000)
    function getPricesForYear(year) {
        const arr = PUN_HISTORY_MWH[year];
        if (!arr) return null;
        return arr.map((v) => v / 1000);
    }

    // Prezzi P_INGM di riferimento per mese (€/kWh).
    // Usati come preset quando si passa alla modalità "Prezzo mensile".
    const DEFAULT_MONTHLY_PRICES = getPricesForYear(DEFAULT_PRICE_YEAR);

    // Stato mensile globale (persiste fra i ricalcoli)
    const monthlyState = {
        consumptionMode: "uniform",         // "uniform" | "custom"
        priceMode: "single",                // "single" | "monthly"
        kwh: Array(12).fill(2700 / 12),
        prices: Array(12).fill(0.1244),
        selectedPriceYear: null,            // anno PUN selezionato (null se "custom")
        selectedConsumptionProfile: null,   // chiave profilo consumo (null se "custom")
    };

    // Valori predefiniti (fedeli allo script)
    const DEFAULTS = {
        consumo_annuo: 2700,
        potenza_impegnata: 3.0,
        residente: true,
        sconto_una_tantum: 20.0,
        p_ingm_f0: 0.1244,
        alpha: 0.0055,
        p_fix_v: 60.0,
        lambda_losses: 0.102,
        dispbt_f: 0,
        cdispd: 0.016988,
        sigma1: 23.04,
        sigma2: 23.52,
        sigma3: 0.0119,
        uc3: 0.00276,
        uc6p_d: 0.00007,
        uc6s_d: 0.1988,
        asos: 0.028657,
        arim: 0.001638,
        accisa_val: 0.0227,
        iva_rate: 0.10,
    };

    // Lettura input form
    function readInputs() {
        return {
            consumo_annuo: parseFloat($("#consumo_annuo").value) || 0,
            potenza_impegnata: parseFloat($("#potenza_impegnata").value) || 0,
            // Stato mensile (referenza, non copia)
            consumptionMode: monthlyState.consumptionMode,
            priceMode: monthlyState.priceMode,
            monthlyKwh: monthlyState.kwh.slice(),
            monthlyPrices: monthlyState.prices.slice(),
            residente: $("#residente").checked,
            sconto_una_tantum: parseFloat($("#sconto_una_tantum").value) || 0,
            p_ingm_f0: parseFloat($("#p_ingm_f0").value) || 0,
            alpha: parseFloat($("#alpha").value) || 0,
            p_fix_v: parseFloat($("#p_fix_v").value) || 0,
            lambda_losses: parseFloat($("#lambda_losses").value) || 0,
            dispbt_f: parseFloat($("#dispbt_f").value) || 0,
            cdispd: parseFloat($("#cdispd").value) || 0,
            sigma1: parseFloat($("#sigma1").value) || 0,
            sigma2: parseFloat($("#sigma2").value) || 0,
            sigma3: parseFloat($("#sigma3").value) || 0,
            uc3: parseFloat($("#uc3").value) || 0,
            uc6p_d: parseFloat($("#uc6p_d").value) || 0,
            uc6s_d: parseFloat($("#uc6s_d").value) || 0,
            asos: parseFloat($("#asos").value) || 0,
            arim: parseFloat($("#arim").value) || 0,
            accisa_val: parseFloat($("#accisa_val").value) || 0,
            iva_rate: parseFloat($("#iva_rate").value) || 0,
        };
    }

    // Calcolo delle serie mensili effettive in base alla modalità scelta.
    // Ritorna { kwhByMonth[], priceByMonth[], consumoTot }
    function resolveMonthlySeries(p) {
        let kwhByMonth;
        if (p.consumptionMode === "uniform") {
            const share = p.consumo_annuo / 12;
            kwhByMonth = Array(12).fill(share);
        } else {
            kwhByMonth = p.monthlyKwh.slice();
        }

        let priceByMonth;
        if (p.priceMode === "single") {
            priceByMonth = Array(12).fill(p.p_ingm_f0);
        } else {
            priceByMonth = p.monthlyPrices.slice();
        }

        const consumoTot = kwhByMonth.reduce((s, v) => s + v, 0);
        return { kwhByMonth, priceByMonth, consumoTot };
    }

    // =============================================================
    // CORE: calcolo della bolletta — FEDELE allo script Python,
    // con estensione al calcolo mensile della materia energia.
    // =============================================================
    function computeBill(p) {
        const { kwhByMonth, priceByMonth, consumoTot } = resolveMonthlySeries(p);
        // Il consumo totale usato per gli altri calcoli è la somma dei kWh
        // distribuiti mensilmente (coincide con consumo_annuo in modalità uniforme).
        const consumo_annuo = consumoTot;

        // --- Vendita energia (materia) — calcolata mese per mese ---
        const quota_fissa_materia = p.p_fix_v;

        // Dettaglio mensile: per ogni mese calcola
        //   prezzo_energia_m = (1 + λ) * (P_INGM_m + α)
        //   costo_materia_m  = prezzo_energia_m * kwh_m
        const monthlyDetail = kwhByMonth.map((kwh, i) => {
            const prezzo_energia_m = (1 + p.lambda_losses) * (priceByMonth[i] + p.alpha);
            const costo_materia_m = prezzo_energia_m * kwh;
            return {
                month: i,
                kwh,
                p_ingm: priceByMonth[i],
                prezzo_energia: prezzo_energia_m,
                costo_materia: costo_materia_m,
                costo_dispacciamento: p.cdispd * kwh,
            };
        });

        const quota_variabile_materia = monthlyDetail.reduce(
            (s, m) => s + m.costo_materia,
            0
        );

        // Prezzo energia medio ponderato sull'anno (utile per il report)
        const prezzo_energia =
            consumo_annuo > 0 ? quota_variabile_materia / consumo_annuo : 0;

        const spesa_materia = quota_fissa_materia + quota_variabile_materia;

        // --- Dispacciamento ---
        const spesa_comm_fissa = p.dispbt_f;
        const spesa_dispacciamento_var = p.cdispd * consumo_annuo;

        // --- Rete ---
        const rete_fissa = p.sigma1;
        const rete_sigma2 = p.sigma2 * p.potenza_impegnata;
        const rete_uc6s = p.uc6s_d * p.potenza_impegnata;
        const rete_potenza = rete_sigma2 + rete_uc6s;
        const rete_sigma3 = p.sigma3 * consumo_annuo;
        const rete_uc3 = p.uc3 * consumo_annuo;
        const rete_uc6p = p.uc6p_d * consumo_annuo;
        const rete_variabile = rete_sigma3 + rete_uc3 + rete_uc6p;
        const spesa_rete = rete_fissa + rete_potenza + rete_variabile;

        // --- Oneri di sistema ---
        const oneri_asos = p.asos * consumo_annuo;
        const oneri_arim = p.arim * consumo_annuo;
        const spesa_oneri_var = oneri_asos + oneri_arim;

        // --- Accise ---
        const accisa_totale =
            consumo_annuo > 1800 ? p.accisa_val * (consumo_annuo - 1800) : 0.0;

        // --- Imponibile IVA e IVA ---
        const imponibile_iva =
            spesa_materia +
            spesa_comm_fissa +
            spesa_dispacciamento_var +
            spesa_rete +
            spesa_oneri_var +
            accisa_totale -
            p.sconto_una_tantum;

        const iva_totale = imponibile_iva * p.iva_rate;
        const totale_finale = imponibile_iva + iva_totale;

        // Spesa netta (come definita nello script: senza accise e sconti)
        const spesa_netta =
            spesa_materia +
            spesa_comm_fissa +
            spesa_dispacciamento_var +
            spesa_rete +
            spesa_oneri_var;

        return {
            // Consumo totale effettivo (somma dei mesi)
            consumo_annuo,
            // Dettaglio mensile
            monthlyDetail,

            // Vendita + dispacciamento
            quota_fissa_materia,
            prezzo_energia,
            quota_variabile_materia,
            spesa_materia,
            spesa_comm_fissa,
            spesa_dispacciamento_var,

            // Rete
            rete_fissa,
            rete_sigma2,
            rete_uc6s,
            rete_potenza,
            rete_sigma3,
            rete_uc3,
            rete_uc6p,
            rete_variabile,
            spesa_rete,

            // Oneri
            oneri_asos,
            oneri_arim,
            spesa_oneri_var,

            // Accise + IVA
            accisa_totale,
            imponibile_iva,
            iva_totale,
            totale_finale,

            // Totali
            spesa_netta,
        };
    }

    // =============================================================
    // RENDERING — report dettagliato (stile script Python)
    // =============================================================
    function buildTable(title, columns, rows) {
        const header = columns.map((c) => `<th>${c}</th>`).join("");
        const body = rows
            .map((r) => {
                const cls = r.className ? ` class="${r.className}"` : "";
                const cells = r.cells
                    .map((cell, i) =>
                        i === 0 ? `<td>${cell}</td>` : `<td>${cell}</td>`
                    )
                    .join("");
                return `<tr${cls}>${cells}</tr>`;
            })
            .join("");

        return `
            <div class="cost-table">
                <div class="table-head">${title}</div>
                <table>
                    <thead><tr>${header}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
        `;
    }

    // Costruisce una struttura dati comune per entrambe le viste del report.
    // Ogni categoria ha: id, title, rows (oggetti {label, desc, price, unit, amount}),
    // subtotal (valore numerico), optional negative (per sconti).
    function buildReportCategories(p, r) {
        const consumoRilevante = Math.max(0, r.consumo_annuo - 1800);
        const energiaDesc =
            p.priceMode === "monthly"
                ? "Media ponderata mensile (1+λ)·(P<sub>INGM,m</sub>+α)"
                : "Costo del kWh: (1+λ)·(P<sub>INGM</sub>+α)";

        return [
            {
                id: "energy",
                title: "VENDITA ENERGIA ELETTRICA",
                subtotal:
                    r.spesa_materia +
                    r.spesa_comm_fissa +
                    r.spesa_dispacciamento_var,
                rows: [
                    {
                        label: "Commercializzazione",
                        desc: "Quota fissa annua del venditore per la gestione del contratto",
                        price: NUM4(p.p_fix_v),
                        unit: "€/anno",
                        amount: r.quota_fissa_materia,
                    },
                    {
                        label: "Componente energia",
                        desc: energiaDesc,
                        price: NUM4(r.prezzo_energia),
                        unit: "€/kWh",
                        amount: r.quota_variabile_materia,
                    },
                    {
                        label: "Dispacciamento var.",
                        desc: "Corrispettivo variabile ARERA per il bilanciamento della rete (c<sub>DISPd</sub>)",
                        price: NUM4(p.cdispd),
                        unit: "€/kWh",
                        amount: r.spesa_dispacciamento_var,
                    },
                    {
                        label: "Dispacciamento fisso",
                        desc: "Quota fissa ARERA sul dispacciamento (DISP<sub>BT,F</sub>)",
                        price: NUM4(p.dispbt_f),
                        unit: "€/anno",
                        amount: r.spesa_comm_fissa,
                    },
                ],
            },
            {
                id: "grid",
                title: "TARIFFA USO RETE",
                subtotal: r.spesa_rete,
                rows: [
                    {
                        label: "σ<sub>1</sub>",
                        desc: "Quota fissa per uso delle reti di trasmissione e distribuzione",
                        price: NUM4(p.sigma1),
                        unit: "€/anno",
                        amount: r.rete_fissa,
                    },
                    {
                        label: "σ<sub>2</sub>",
                        desc: "Quota proporzionale alla potenza impegnata",
                        price: NUM4(p.sigma2),
                        unit: "€/kW/anno",
                        amount: r.rete_sigma2,
                    },
                    {
                        label: "UC6 potenza",
                        desc: "Perequazione qualità del servizio sulla potenza",
                        price: NUM4(p.uc6s_d),
                        unit: "€/kW/anno",
                        amount: r.rete_uc6s,
                    },
                    {
                        label: "σ<sub>3</sub>",
                        desc: "Quota variabile sull'energia prelevata",
                        price: NUM4(p.sigma3),
                        unit: "€/kWh",
                        amount: r.rete_sigma3,
                    },
                    {
                        label: "UC3",
                        desc: "Squilibri e perequazione costi di rete",
                        price: NUM4(p.uc3),
                        unit: "€/kWh",
                        amount: r.rete_uc3,
                    },
                    {
                        label: "UC6 energia",
                        desc: "Perequazione qualità del servizio sull'energia",
                        price: NUM4(p.uc6p_d),
                        unit: "€/kWh",
                        amount: r.rete_uc6p,
                    },
                ],
            },
            {
                id: "charges",
                title: "ONERI DI SISTEMA",
                subtotal: r.spesa_oneri_var,
                rows: [
                    {
                        label: "A<sub>SOS</sub>",
                        desc: "Oneri per il finanziamento delle fonti rinnovabili",
                        price: NUM4(p.asos),
                        unit: "€/kWh",
                        amount: r.oneri_asos,
                    },
                    {
                        label: "A<sub>RIM</sub>",
                        desc: "Oneri generali di sistema rimanenti",
                        price: NUM4(p.arim),
                        unit: "€/kWh",
                        amount: r.oneri_arim,
                    },
                ],
            },
            {
                id: "tax",
                title: "IMPOSTE",
                subtotal: r.accisa_totale + r.iva_totale,
                rows: [
                    {
                        label: "Accise",
                        desc: `Imposta di consumo statale sui kWh oltre 1800/anno (base: ${consumoRilevante} kWh)`,
                        price: NUM4(p.accisa_val),
                        unit: "€/kWh",
                        amount: r.accisa_totale,
                    },
                    {
                        label: "IVA",
                        desc: "Imposta sul valore aggiunto applicata sull'imponibile",
                        price: (p.iva_rate * 100).toFixed(0),
                        unit: "%",
                        amount: r.iva_totale,
                    },
                ],
            },
            {
                id: "discount",
                title: "SCONTI SOGGETTI A IVA",
                subtotal: -p.sconto_una_tantum,
                negative: true,
                rows: [
                    {
                        label: "Una tantum",
                        desc: "Bonus commerciale del venditore applicato all'imponibile IVA",
                        price: "—",
                        unit: "",
                        amount: -p.sconto_una_tantum,
                        isDiscount: true,
                    },
                ],
            },
        ];
    }

    function renderReport(p, r) {
        const categories = buildReportCategories(p, r);
        renderReportDashboard(p, r, categories);
        renderReportAccordion(p, r, categories);
    }

    function renderReportDashboard(p, r, categories) {
        const cols = ["Voce", "Prezzo", "Unità", "Spesa"];

        // VENDITA ENERGIA
        const tableEnergy = buildTable("VENDITA ENERGIA ELETTRICA", cols, [
            {
                cells: [
                    "Costi di commercializzazione",
                    NUM4(p.p_fix_v),
                    "€/anno",
                    EUR(r.quota_fissa_materia),
                ],
            },
            {
                cells: [
                    p.priceMode === "monthly"
                        ? "Componente energia (media ponderata mensile)"
                        : "Componente energia (1+λ)(P<sub>INGM</sub>+α)",
                    NUM4(r.prezzo_energia),
                    "€/kWh",
                    EUR(r.quota_variabile_materia),
                ],
            },
            {
                cells: [
                    "c<sub>DISPd</sub> — dispacciamento",
                    NUM4(p.cdispd),
                    "€/kWh",
                    EUR(r.spesa_dispacciamento_var),
                ],
            },
            {
                cells: [
                    "DISP<sub>BT,F</sub> — quota fissa dispacciamento",
                    NUM4(p.dispbt_f),
                    "€/anno",
                    EUR(r.spesa_comm_fissa),
                ],
            },
            {
                className: "total-row",
                cells: [
                    "TOTALE",
                    "—",
                    "",
                    EUR(r.spesa_materia + r.spesa_comm_fissa + r.spesa_dispacciamento_var),
                ],
            },
        ]);

        // RETE
        const tableNet = buildTable("TARIFFA USO RETE", cols, [
            {
                cells: [
                    "σ<sub>1</sub>",
                    NUM4(p.sigma1),
                    "€/anno",
                    EUR(r.rete_fissa),
                ],
            },
            {
                cells: [
                    "σ<sub>2</sub>",
                    NUM4(p.sigma2),
                    "€/kW/anno",
                    EUR(r.rete_sigma2),
                ],
            },
            {
                cells: [
                    "UC6 qualità potenza",
                    NUM4(p.uc6s_d),
                    "€/kW/anno",
                    EUR(r.rete_uc6s),
                ],
            },
            {
                cells: [
                    "σ<sub>3</sub>",
                    NUM4(p.sigma3),
                    "€/kWh",
                    EUR(r.rete_sigma3),
                ],
            },
            {
                cells: ["UC3", NUM4(p.uc3), "€/kWh", EUR(r.rete_uc3)],
            },
            {
                cells: [
                    "UC6 qualità energia",
                    NUM4(p.uc6p_d),
                    "€/kWh",
                    EUR(r.rete_uc6p),
                ],
            },
            {
                className: "total-row",
                cells: ["TOTALE", "—", "", EUR(r.spesa_rete)],
            },
        ]);

        // ONERI
        const tableCharges = buildTable("ONERI DI SISTEMA", cols, [
            {
                cells: [
                    "A<sub>SOS</sub>",
                    NUM4(p.asos),
                    "€/kWh",
                    EUR(r.oneri_asos),
                ],
            },
            {
                cells: [
                    "A<sub>RIM</sub>",
                    NUM4(p.arim),
                    "€/kWh",
                    EUR(r.oneri_arim),
                ],
            },
            {
                className: "total-row",
                cells: ["TOTALE", "—", "", EUR(r.spesa_oneri_var)],
            },
        ]);

        // IMPOSTE
        const consumoRilevante = Math.max(0, r.consumo_annuo - 1800);
        const tableTax = buildTable("IMPOSTE", cols, [
            {
                cells: [
                    `Accise (su ${consumoRilevante} kWh oltre 1800)`,
                    NUM4(p.accisa_val),
                    "€/kWh",
                    EUR(r.accisa_totale),
                ],
            },
            {
                cells: [
                    "IVA",
                    (p.iva_rate * 100).toFixed(0),
                    "%",
                    EUR(r.iva_totale),
                ],
            },
            {
                className: "total-row",
                cells: ["TOTALE IMPOSTE", "—", "", EUR(r.accisa_totale + r.iva_totale)],
            },
        ]);

        // SCONTI
        const tableDiscount = buildTable("SCONTI SOGGETTI A IVA", cols, [
            {
                className: "discount-row",
                cells: ["Una tantum", "—", "", `− ${EUR(p.sconto_una_tantum)}`],
            },
        ]);

        $("#reportTables").innerHTML =
            tableEnergy + tableNet + tableCharges + tableTax + tableDiscount;
    }

    // Vista "Tabella" — un'unica tabella con tbody espandibili per categoria.
    // Garantisce allineamento perfetto delle colonne su tutte le sezioni.
    function renderReportAccordion(p, r, categories) {
        const host = $("#reportAccordion");
        if (!host) return;

        // Preserva lo stato aperto/chiuso delle sezioni tra re-render
        const wasOpen = new Set(
            Array.from(host.querySelectorAll(".acc-section.is-open")).map(
                (el) => el.dataset.id
            )
        );
        // Default: tutte le sezioni COMPRESSE al primo render
        const firstRender = host.childElementCount === 0;

        const sectionsHtml = categories
            .map((cat) => {
                const isOpen = !firstRender && wasOpen.has(cat.id);
                const rowsHtml = cat.rows
                    .map((row) => {
                        const cls = row.isDiscount
                            ? " acc-row discount-row"
                            : " acc-row";
                        const amount = row.isDiscount
                            ? `− ${EUR(Math.abs(row.amount))}`
                            : EUR(row.amount);
                        return `<tr class="${cls.trim()}">
                            <td class="voce">${row.label}</td>
                            <td class="desc">${row.desc || ""}</td>
                            <td class="num">${row.price}</td>
                            <td class="unit">${row.unit}</td>
                            <td class="amount">${amount}</td>
                        </tr>`;
                    })
                    .join("");

                const subtotalClass = cat.negative ? " is-negative" : "";
                const subtotalText = cat.negative
                    ? `− ${EUR(Math.abs(cat.subtotal))}`
                    : EUR(cat.subtotal);

                return `<tbody class="acc-section${isOpen ? " is-open" : ""}" data-id="${cat.id}">
                    <tr class="acc-header-row" role="button" aria-expanded="${isOpen}">
                        <th class="acc-title-cell" colspan="4">
                            <span class="acc-chevron">▶</span><span class="acc-title-text">${cat.title}</span>
                        </th>
                        <td class="acc-subtotal${subtotalClass}">${subtotalText}</td>
                    </tr>
                    ${rowsHtml}
                </tbody>`;
            })
            .join("");

        const headHtml = `
            <thead>
                <tr>
                    <th class="th-voce">Voce</th>
                    <th class="th-desc">Descrizione</th>
                    <th class="th-prezzo">Prezzo</th>
                    <th class="th-unita">Unità</th>
                    <th class="th-spesa">Spesa</th>
                </tr>
            </thead>`;

        const footHtml = `
            <tfoot class="acc-grand">
                <tr>
                    <th colspan="4">
                        <div class="gt-label">Totale bolletta</div>
                        <div class="gt-sub">Imponibile IVA: ${EUR(r.imponibile_iva)} · IVA ${(p.iva_rate * 100).toFixed(0)}%: ${EUR(r.iva_totale)}</div>
                    </th>
                    <td class="gt-value">${EUR(r.totale_finale)}</td>
                </tr>
            </tfoot>`;

        host.innerHTML = `<table class="report-accordion-table">
            <colgroup>
                <col class="c-voce">
                <col class="c-desc">
                <col class="c-prezzo">
                <col class="c-unita">
                <col class="c-spesa">
            </colgroup>
            ${headHtml}
            ${sectionsHtml}
            ${footHtml}
        </table>`;
    }

    // =============================================================
    // SELETTORE PERIODO DI ANALISI
    // Consente di calcolare la composizione (pie + costi fissi/variabili)
    // su un qualsiasi sottoinsieme dei 12 mesi, oltre alle scorciatoie:
    //   - year       → anno intero
    //   - avg-month  → 1/12 dell'anno (mese medio)
    //   - custom     → una combinazione libera di mesi (anche un solo mese)
    // =============================================================
    const periodState = {
        mode: "year",
        customMonths: new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    };

    let lastInputs = null;
    let lastAnnualResult = null;

    // Campi di `r` che si "scalano" proporzionalmente quando si passa
    // dall'anno a una frazione del periodo
    const SCALABLE_FIELDS = [
        "consumo_annuo",
        "quota_fissa_materia",
        "quota_variabile_materia",
        "spesa_materia",
        "spesa_comm_fissa",
        "spesa_dispacciamento_var",
        "rete_fissa",
        "rete_sigma2",
        "rete_uc6s",
        "rete_sigma3",
        "rete_uc3",
        "rete_uc6p",
        "spesa_rete",
        "oneri_asos",
        "oneri_arim",
        "spesa_oneri_var",
        "accisa_totale",
        "spesa_netta",
        "imponibile_iva",
        "iva_totale",
        "totale_finale",
    ];

    function scaleResult(r, factor) {
        const out = { ...r };
        SCALABLE_FIELDS.forEach((f) => {
            if (typeof r[f] === "number") out[f] = r[f] * factor;
        });
        return out;
    }

    // Costruisce un risultato "come r" aggregato su un sottoinsieme di mesi.
    // - Costi fissi (quote potenza / quote fisse)    → scalati per N_sel/12
    // - Costi variabili rete/oneri/accise            → scalati per kwh_sel/kwh_anno
    // - Costo materia e dispacciamento variabile     → valore esatto dal
    //   breakdown mensile (m.costo_materia / m.costo_dispacciamento)
    // - IVA e imponibile                             → ricalcolati
    function aggregateForMonths(p, r, monthIndexes) {
        const N = 12;
        const nSel = monthIndexes.length;
        if (nSel === 0) return scaleResult(r, 0);

        const timeFrac = nSel / N;
        const md = r.monthlyDetail || [];
        const selSet = new Set(monthIndexes);
        const selMonths = md.filter((m) => selSet.has(m.month));

        const kwhPeriod = selMonths.reduce((s, m) => s + m.kwh, 0);
        const kwhYear = r.consumo_annuo;
        const kwhFrac = kwhYear > 0 ? kwhPeriod / kwhYear : timeFrac;

        // Materia variabile ed energia dispacciamento: usiamo i valori
        // effettivi mese per mese (coerenti con i prezzi mensili).
        const quota_variabile_materia = selMonths.reduce(
            (s, m) => s + m.costo_materia,
            0
        );
        const spesa_dispacciamento_var = selMonths.reduce(
            (s, m) => s + m.costo_dispacciamento,
            0
        );

        // Quote fisse → frazione di tempo
        const quota_fissa_materia = r.quota_fissa_materia * timeFrac;
        const spesa_comm_fissa = r.spesa_comm_fissa * timeFrac;
        const rete_fissa = r.rete_fissa * timeFrac;
        const rete_sigma2 = r.rete_sigma2 * timeFrac;
        const rete_uc6s = r.rete_uc6s * timeFrac;

        // Voci variabili non-materia → frazione di consumo
        const rete_sigma3 = r.rete_sigma3 * kwhFrac;
        const rete_uc3 = r.rete_uc3 * kwhFrac;
        const rete_uc6p = r.rete_uc6p * kwhFrac;
        const oneri_asos = r.oneri_asos * kwhFrac;
        const oneri_arim = r.oneri_arim * kwhFrac;
        const accisa_totale = r.accisa_totale * kwhFrac;

        const spesa_materia = quota_fissa_materia + quota_variabile_materia;
        const spesa_rete =
            rete_fissa +
            rete_sigma2 +
            rete_uc6s +
            rete_sigma3 +
            rete_uc3 +
            rete_uc6p;
        const spesa_oneri_var = oneri_asos + oneri_arim;

        const spesa_netta =
            quota_fissa_materia +
            quota_variabile_materia +
            spesa_comm_fissa +
            spesa_dispacciamento_var +
            spesa_rete +
            spesa_oneri_var;

        const sconto = (p.sconto_una_tantum || 0) * timeFrac;
        const imponibile_iva = spesa_netta + accisa_totale - sconto;
        const iva_totale = imponibile_iva * (p.iva_rate || 0);
        const totale_finale = imponibile_iva + iva_totale;

        return {
            ...r,
            consumo_annuo: kwhPeriod,
            quota_fissa_materia,
            quota_variabile_materia,
            spesa_materia,
            spesa_comm_fissa,
            spesa_dispacciamento_var,
            rete_fissa,
            rete_sigma2,
            rete_uc6s,
            rete_sigma3,
            rete_uc3,
            rete_uc6p,
            spesa_rete,
            oneri_asos,
            oneri_arim,
            spesa_oneri_var,
            accisa_totale,
            spesa_netta,
            imponibile_iva,
            iva_totale,
            totale_finale,
        };
    }

    function getPeriodResult(p, r) {
        switch (periodState.mode) {
            case "year":
                return r;
            case "avg-month":
                return scaleResult(r, 1 / 12);
            case "custom": {
                const arr = [...periodState.customMonths];
                return aggregateForMonths(p, r, arr);
            }
            default:
                return r;
        }
    }

    function formatKwh(n) {
        return `${n.toLocaleString("it-IT", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })} kWh`;
    }

    function describePeriod(p, r, pr) {
        switch (periodState.mode) {
            case "year":
                return `Totale annuo — ${EUR(pr.totale_finale)} · ${formatKwh(pr.consumo_annuo)}`;
            case "avg-month":
                return `Mese medio (annuo ÷ 12) — ${EUR(pr.totale_finale)} · ${formatKwh(pr.consumo_annuo)}`;
            case "custom": {
                const sel = [...periodState.customMonths].sort((a, b) => a - b);
                if (sel.length === 0) return "Nessun mese selezionato";
                if (sel.length === 12)
                    return `Tutti i mesi — ${EUR(pr.totale_finale)} · ${formatKwh(pr.consumo_annuo)}`;
                if (sel.length === 1)
                    return `${MONTHS_LONG[sel[0]]} — ${EUR(pr.totale_finale)} · ${formatKwh(pr.consumo_annuo)}`;
                const names = sel.map((i) => MONTHS[i]).join(", ");
                return `${sel.length} mesi (${names}) — ${EUR(pr.totale_finale)} · ${formatKwh(pr.consumo_annuo)}`;
            }
            default:
                return "";
        }
    }

    function renderPeriodChips() {
        const grid = $("#periodChipsGrid");
        if (!grid) return;
        grid.innerHTML = MONTHS.map((name, i) => {
            const selected = periodState.customMonths.has(i) ? " selected" : "";
            return `<button type="button" class="period-chip${selected}" data-month="${i}">${name}</button>`;
        }).join("");
    }

    function updatePeriodExtraVisibility() {
        const c = $("#periodCustomControl");
        if (c) c.hidden = periodState.mode !== "custom";
    }

    function renderBreakdownSection(p, r) {
        const pr = getPeriodResult(p, r);
        renderFixedVariable(p, pr);
        renderPieChart(pr);
        const info = $("#periodInfo");
        if (info) info.textContent = describePeriod(p, r, pr);
    }

    function refreshBreakdown() {
        if (lastInputs && lastAnnualResult) {
            renderBreakdownSection(lastInputs, lastAnnualResult);
        }
    }

    function setupPeriodSelector() {
        renderPeriodChips();
        updatePeriodExtraVisibility();

        // Segmented: cambio modalità
        $$(".period-mode-switcher .seg-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const mode = btn.dataset.value;
                if (periodState.mode === mode) return;
                periodState.mode = mode;
                $$(".period-mode-switcher .seg-btn").forEach((b) =>
                    b.classList.toggle("active", b.dataset.value === mode)
                );
                updatePeriodExtraVisibility();
                refreshBreakdown();
            });
        });

        // Chips del periodo personalizzato (event delegation)
        $("#periodChipsGrid")?.addEventListener("click", (e) => {
            const chip = e.target.closest(".period-chip");
            if (!chip) return;
            const m = parseInt(chip.dataset.month, 10);
            if (isNaN(m)) return;
            if (periodState.customMonths.has(m)) {
                periodState.customMonths.delete(m);
                chip.classList.remove("selected");
            } else {
                periodState.customMonths.add(m);
                chip.classList.add("selected");
            }
            refreshBreakdown();
        });

        // Pulsanti rapidi: tutti / nessuno / inverno / estate
        $$(".period-chips-quick .mini-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const act = btn.dataset.periodQuick;
                let months;
                if (act === "all") months = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
                else if (act === "none") months = [];
                else if (act === "winter") months = [0, 1, 10, 11]; // gen, feb, nov, dic
                else if (act === "summer") months = [5, 6, 7, 8]; // giu, lug, ago, set
                else return;
                periodState.customMonths = new Set(months);
                renderPeriodChips();
                refreshBreakdown();
            });
        });
    }

    // =============================================================
    // RENDERING — costi fissi vs variabili
    // =============================================================
    function renderFixedVariable(p, r) {
        // FISSI: non dipendono dal consumo (includono quote potenza,
        // poiché la potenza impegnata è un parametro fisso dell'anno).
        const fixedItems = [
            {
                label: "Commercializzazione (P<sub>FIX,V</sub>)",
                value: r.quota_fissa_materia,
            },
            {
                label: "Dispacciamento quota fissa (DISP<sub>BT,F</sub>)",
                value: r.spesa_comm_fissa,
            },
            { label: "Rete — σ<sub>1</sub>", value: r.rete_fissa },
            {
                label: "Rete — σ<sub>2</sub> × potenza impegnata",
                value: r.rete_sigma2,
            },
            {
                label: "Rete — UC6 qualità potenza × potenza",
                value: r.rete_uc6s,
            },
        ];

        // VARIABILI: proporzionali al consumo annuo
        const variableItems = [
            {
                label: "Componente energia (1+λ)(P<sub>INGM</sub>+α) × kWh",
                value: r.quota_variabile_materia,
            },
            {
                label: "Dispacciamento c<sub>DISPd</sub> × kWh",
                value: r.spesa_dispacciamento_var,
            },
            { label: "Rete — σ<sub>3</sub> × kWh", value: r.rete_sigma3 },
            { label: "Rete — UC3 × kWh", value: r.rete_uc3 },
            { label: "Rete — UC6 qualità energia × kWh", value: r.rete_uc6p },
            { label: "Oneri — A<sub>SOS</sub> × kWh", value: r.oneri_asos },
            { label: "Oneri — A<sub>RIM</sub> × kWh", value: r.oneri_arim },
        ];

        const totalFixed = fixedItems.reduce((s, it) => s + it.value, 0);
        const totalVariable = variableItems.reduce((s, it) => s + it.value, 0);
        const totalNet = totalFixed + totalVariable;

        const mkTable = (items, total, totalLabel) => {
            const rows = items
                .map(
                    (it) => `
                    <tr>
                        <td>${it.label}</td>
                        <td>${EUR(it.value)}</td>
                        <td>${PCT(totalNet > 0 ? (it.value / totalNet) * 100 : 0)}</td>
                    </tr>`
                )
                .join("");
            return `
                <div class="cost-table" style="box-shadow:none;border:none;">
                    <table>
                        <thead><tr>
                            <th>Voce</th><th>Importo</th><th>% su spesa netta</th>
                        </tr></thead>
                        <tbody>
                            ${rows}
                            <tr class="total-row">
                                <td>${totalLabel}</td>
                                <td>${EUR(total)}</td>
                                <td>${PCT(totalNet > 0 ? (total / totalNet) * 100 : 0)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        };

        $("#fixedTable").innerHTML = mkTable(
            fixedItems,
            totalFixed,
            "TOTALE COSTI FISSI"
        );
        $("#variableTable").innerHTML = mkTable(
            variableItems,
            totalVariable,
            "TOTALE COSTI VARIABILI"
        );

        return { totalFixed, totalVariable, totalNet };
    }

    // =============================================================
    // RENDERING — Grafico a torta dinamico
    // Tre modalità di aggregazione:
    //   - macro     → raggruppamento per macro categoria (default)
    //   - detailed  → singola voce tariffaria (ASOS, ARIM, σ1/σ2/σ3, UC3/UC6...)
    //   - fixedvar  → costi fissi vs variabili vs imposte
    // In ogni modalità le voci sono singolarmente attivabili/disattivabili
    // cliccando sulla legenda. I pulsanti "Mostra tutto" / "Solo netto
    // imposte" operano sulla modalità attualmente selezionata.
    // =============================================================
    let pieChartInstance = null;

    const PIE_MODES = {
        macro: {
            components: [
                { id: "materia",        label: "Vendita energia (materia)", color: "#2563eb", visible: true,  isTax: false, value: (r) => r.spesa_materia },
                { id: "dispacciamento", label: "Dispacciamento",            color: "#0ea5e9", visible: true,  isTax: false, value: (r) => r.spesa_comm_fissa + r.spesa_dispacciamento_var },
                { id: "rete",           label: "Tariffa uso rete",          color: "#10b981", visible: true,  isTax: false, value: (r) => r.spesa_rete },
                { id: "oneri",          label: "Oneri di sistema",          color: "#f59e0b", visible: true,  isTax: false, value: (r) => r.spesa_oneri_var },
                { id: "accise",         label: "Accise",                    color: "#ef4444", visible: false, isTax: true,  value: (r) => r.accisa_totale },
                { id: "iva",            label: "IVA",                       color: "#8b5cf6", visible: false, isTax: true,  value: (r) => r.iva_totale },
            ],
        },
        detailed: {
            components: [
                { id: "p_fix_v",   label: "Commercializzazione P<sub>FIX,V</sub>",           color: "#1e40af", visible: true,  isTax: false, value: (r) => r.quota_fissa_materia },
                { id: "energia",   label: "Energia (1+λ)(P<sub>INGM</sub>+α)·kWh",           color: "#3b82f6", visible: true,  isTax: false, value: (r) => r.quota_variabile_materia },
                { id: "disp_f",    label: "Dispacciamento DISP<sub>BT,F</sub>",              color: "#0369a1", visible: true,  isTax: false, value: (r) => r.spesa_comm_fissa },
                { id: "disp_v",    label: "Dispacciamento c<sub>DISPd</sub>·kWh",            color: "#0ea5e9", visible: true,  isTax: false, value: (r) => r.spesa_dispacciamento_var },
                { id: "rete_s1",   label: "Rete σ<sub>1</sub> (quota fissa)",                color: "#065f46", visible: true,  isTax: false, value: (r) => r.rete_fissa },
                { id: "rete_s2",   label: "Rete σ<sub>2</sub> · potenza impegnata",          color: "#10b981", visible: true,  isTax: false, value: (r) => r.rete_sigma2 },
                { id: "rete_uc6s", label: "Rete UC6 qualità potenza · potenza",              color: "#34d399", visible: true,  isTax: false, value: (r) => r.rete_uc6s },
                { id: "rete_s3",   label: "Rete σ<sub>3</sub> · kWh",                        color: "#0d9488", visible: true,  isTax: false, value: (r) => r.rete_sigma3 },
                { id: "rete_uc3",  label: "Rete UC3 · kWh",                                  color: "#14b8a6", visible: true,  isTax: false, value: (r) => r.rete_uc3 },
                { id: "rete_uc6p", label: "Rete UC6 qualità energia · kWh",                  color: "#5eead4", visible: true,  isTax: false, value: (r) => r.rete_uc6p },
                { id: "asos",      label: "Oneri A<sub>SOS</sub> · kWh",                     color: "#f59e0b", visible: true,  isTax: false, value: (r) => r.oneri_asos },
                { id: "arim",      label: "Oneri A<sub>RIM</sub> · kWh",                     color: "#f97316", visible: true,  isTax: false, value: (r) => r.oneri_arim },
                { id: "accise",    label: "Accise",                                          color: "#ef4444", visible: false, isTax: true,  value: (r) => r.accisa_totale },
                { id: "iva",       label: "IVA",                                             color: "#8b5cf6", visible: false, isTax: true,  value: (r) => r.iva_totale },
            ],
        },
        fixedvar: {
            components: [
                {
                    id: "fissi",
                    label: "Costi fissi (non dipendono dal consumo)",
                    color: "#1e40af",
                    visible: true,
                    isTax: false,
                    value: (r) =>
                        r.quota_fissa_materia +
                        r.spesa_comm_fissa +
                        r.rete_fissa +
                        r.rete_sigma2 +
                        r.rete_uc6s,
                },
                {
                    id: "variabili",
                    label: "Costi variabili (proporzionali al consumo)",
                    color: "#10b981",
                    visible: true,
                    isTax: false,
                    value: (r) =>
                        r.quota_variabile_materia +
                        r.spesa_dispacciamento_var +
                        r.rete_sigma3 +
                        r.rete_uc3 +
                        r.rete_uc6p +
                        r.oneri_asos +
                        r.oneri_arim,
                },
                {
                    id: "imposte",
                    label: "Imposte (accise + IVA)",
                    color: "#ef4444",
                    visible: false,
                    isTax: true,
                    value: (r) => r.accisa_totale + r.iva_totale,
                },
            ],
        },
    };

    let currentPieMode = "macro";

    function getPieComponents() {
        return PIE_MODES[currentPieMode].components;
    }

    // Ultimo risultato calcolato, necessario per ri-renderizzare al toggle
    let lastResult = null;

    function renderPieChart(r) {
        lastResult = r;

        const components = getPieComponents();

        // Arricchisce ogni componente con il valore corrente
        const enriched = components.map((c) => ({
            ...c,
            value: c.value(r),
        }));

        // Solo quelli visibili e con valore > 0 entrano nel grafico
        const active = enriched.filter((c) => c.visible && c.value > 0);
        const totalActive = active.reduce((s, c) => s + c.value, 0);

        // --- Centro della torta: importo attivo ---
        $("#pieCenter").innerHTML = `
            <div class="pc-label">Totale mostrato</div>
            <div class="pc-value">${EUR(totalActive)}</div>
        `;

        // --- Legenda / toggle ---
        $("#pieLegend").innerHTML = enriched
            .map((c) => {
                const pct =
                    totalActive > 0 && c.visible ? (c.value / totalActive) * 100 : 0;
                const hiddenCls = c.visible ? "" : " is-hidden";
                const pctText = c.visible ? PCT(pct) : "—";
                return `
                    <div class="pie-legend-item${hiddenCls}" data-id="${c.id}" title="Clicca per ${c.visible ? "nascondere" : "mostrare"}">
                        <span class="swatch" style="background:${c.color}"></span>
                        <span class="label">${c.label}</span>
                        <span class="value">${EUR(c.value)}</span>
                        <span class="pct">${pctText}</span>
                    </div>`;
            })
            .join("");

        // Bind click sui toggle
        $$("#pieLegend .pie-legend-item").forEach((el) => {
            el.addEventListener("click", () => {
                const id = el.dataset.id;
                const comp = getPieComponents().find((x) => x.id === id);
                if (!comp) return;
                comp.visible = !comp.visible;
                renderPieChart(lastResult);
            });
        });

        // --- Chart.js ---
        const ctx = $("#pieChart").getContext("2d");

        if (pieChartInstance) {
            pieChartInstance.destroy();
        }

        // Se nessun componente attivo, disegna un placeholder grigio
        const data = active.length
            ? active.map((c) => c.value)
            : [1];
        const bg = active.length
            ? active.map((c) => c.color)
            : ["#e4e8f0"];
        const labels = active.length
            ? active.map((c) => c.label.replace(/<[^>]+>/g, ""))
            : ["Nessuna componente selezionata"];

        pieChartInstance = new Chart(ctx, {
            type: "doughnut",
            data: {
                labels,
                datasets: [
                    {
                        data,
                        backgroundColor: bg,
                        borderColor: "#fff",
                        borderWidth: 3,
                        hoverOffset: 10,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: "62%",
                animation: { duration: 400 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: active.length > 0,
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed;
                                const pct =
                                    totalActive > 0 ? (v / totalActive) * 100 : 0;
                                return ` ${EUR(v)} — ${PCT(pct)}`;
                            },
                        },
                    },
                },
            },
        });
    }

    // Controlli rapidi del grafico (modalità + shortcut imposte)
    function setupPieControls() {
        // Selettore modalità di aggregazione
        $$(".pie-mode-switcher .seg-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const mode = btn.dataset.value;
                if (!PIE_MODES[mode] || mode === currentPieMode) return;
                currentPieMode = mode;
                $$(".pie-mode-switcher .seg-btn").forEach((b) =>
                    b.classList.toggle("active", b.dataset.value === mode)
                );
                if (lastResult) renderPieChart(lastResult);
            });
        });

        // Shortcut mostra tutto / solo netto imposte
        $$(".pie-controls .mini-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const action = btn.dataset.action;
                const comps = getPieComponents();
                if (action === "all") {
                    comps.forEach((c) => (c.visible = true));
                } else if (action === "none") {
                    comps.forEach((c) => (c.visible = !c.isTax));
                }
                if (lastResult) renderPieChart(lastResult);
            });
        });
    }

    // =============================================================
    // RENDERING — Confronto scenari di prezzo energia
    // Mostra 3 mini-donut (prezzo minimo / medio / massimo) per capire
    // come cambia la distribuzione dei costi al variare del P_INGM.
    // Se l'utente ha impostato un prezzo uniforme, viene mostrato un
    // solo scenario (con etichetta "uniforme").
    // =============================================================
    const SCENARIO_COMPONENTS = [
        { id: "materia",        label: "Vendita energia (materia)", color: "#2563eb" },
        { id: "dispacciamento", label: "Dispacciamento",            color: "#0ea5e9" },
        { id: "rete",           label: "Tariffa uso rete",          color: "#10b981" },
        { id: "oneri",          label: "Oneri di sistema",          color: "#f59e0b" },
        { id: "accise",         label: "Accise",                    color: "#ef4444" },
        { id: "iva",            label: "IVA",                       color: "#8b5cf6" },
    ];

    let scenarioChartInstances = [];

    function computeScenarioBill(p, targetPIngm) {
        // Rieseguiamo il calcolo sostituendo il prezzo energia con un
        // valore uniforme, mantenendo invariato tutto il resto (consumo,
        // potenza, tariffe, quote, imposte, ecc.).
        const pScenario = {
            ...p,
            priceMode: "single",
            p_ingm_f0: targetPIngm,
            monthlyPrices: Array(12).fill(targetPIngm),
        };
        return computeBill(pScenario);
    }

    function scenarioSegments(r) {
        return SCENARIO_COMPONENTS.map((c) => {
            let v = 0;
            switch (c.id) {
                case "materia":        v = r.spesa_materia; break;
                case "dispacciamento": v = r.spesa_comm_fissa + r.spesa_dispacciamento_var; break;
                case "rete":           v = r.spesa_rete; break;
                case "oneri":          v = r.spesa_oneri_var; break;
                case "accise":         v = r.accisa_totale; break;
                case "iva":            v = r.iva_totale; break;
            }
            return { ...c, value: v };
        }).filter((s) => s.value > 0);
    }

    function buildScenarios(p, r) {
        // Ricaviamo i prezzi mensili effettivamente in uso
        const prices = p.priceMode === "monthly"
            ? p.monthlyPrices.slice()
            : Array(12).fill(p.p_ingm_f0);

        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        const uniform = p.priceMode === "single" || minP === maxP;

        if (uniform) {
            const price = p.priceMode === "single" ? p.p_ingm_f0 : minP;
            return [{
                key: "uniform",
                title: "Scenario corrente",
                badge: "Uniforme",
                priceLabel: "Prezzo energia",
                priceValue: `${NUM4(price)} €/kWh`,
                result: r,
            }];
        }

        // Media ponderata sui kWh mensili
        const kwhByMonth = p.consumptionMode === "uniform"
            ? Array(12).fill(p.consumo_annuo / 12)
            : p.monthlyKwh.slice();
        const totKwh = kwhByMonth.reduce((s, v) => s + v, 0);
        const avgP = totKwh > 0
            ? prices.reduce((s, pr, i) => s + pr * kwhByMonth[i], 0) / totKwh
            : prices.reduce((s, v) => s + v, 0) / prices.length;

        const minIdx = prices.indexOf(minP);
        const maxIdx = prices.indexOf(maxP);

        return [
            {
                key: "low",
                title: "Prezzo minimo",
                badge: "Basso",
                priceLabel: `Minimo (${MONTHS_LONG[minIdx]})`,
                priceValue: `${NUM4(minP)} €/kWh`,
                result: computeScenarioBill(p, minP),
            },
            {
                key: "avg",
                title: "Prezzo medio",
                badge: "Medio",
                priceLabel: "Media ponderata sui kWh",
                priceValue: `${NUM4(avgP)} €/kWh`,
                result: computeScenarioBill(p, avgP),
            },
            {
                key: "high",
                title: "Prezzo massimo",
                badge: "Alto",
                priceLabel: `Massimo (${MONTHS_LONG[maxIdx]})`,
                priceValue: `${NUM4(maxP)} €/kWh`,
                result: computeScenarioBill(p, maxP),
            },
        ];
    }

    function renderPriceScenarios(p, r) {
        const container = $("#priceScenarios");
        if (!container) return;

        // Distruggi i chart precedenti
        scenarioChartInstances.forEach((c) => c.destroy());
        scenarioChartInstances = [];

        const scenarios = buildScenarios(p, r);
        const isSingle = scenarios.length === 1;

        container.classList.toggle("is-single", isSingle);

        // Aggiorna il sottotitolo della card
        const intro = $("#scenariosIntro");
        if (intro) {
            intro.textContent = isSingle
                ? "Hai impostato un prezzo energia uniforme: la simulazione mostra un unico scenario."
                : "Come cambia la composizione della bolletta al variare del prezzo della materia energia. Tre scenari: prezzo mensile più basso, media ponderata sui kWh, prezzo mensile più alto.";
        }

        // Pre-calcola i segmenti e i totali per ogni scenario
        const prepared = scenarios.map((sc) => {
            const segs = scenarioSegments(sc.result);
            const tot = segs.reduce((s, v) => s + v.value, 0);
            return { ...sc, segments: segs, segmentTotal: tot };
        });

        container.innerHTML = prepared
            .map((sc, idx) => {
                const legend = sc.segments
                    .map((seg) => {
                        const pct = sc.segmentTotal > 0
                            ? (seg.value / sc.segmentTotal) * 100
                            : 0;
                        return `
                            <div class="leg-row">
                                <span class="leg-label" title="${seg.label}">
                                    <span class="leg-swatch" style="background:${seg.color}"></span>
                                    <span>${seg.label}</span>
                                </span>
                                <span class="leg-pct">${PCT(pct)}</span>
                            </div>`;
                    })
                    .join("");

                return `
                    <div class="scenario-item scenario-${sc.key}">
                        <div class="scenario-head">
                            <div class="scenario-title">
                                <span>${sc.title}</span>
                                <span class="scenario-badge">${sc.badge}</span>
                            </div>
                            <div class="scenario-price-label">
                                ${sc.priceLabel}:
                                <span class="scenario-price-value">${sc.priceValue}</span>
                            </div>
                        </div>
                        <div class="scenario-chart-holder">
                            <canvas id="scenarioPie-${idx}"></canvas>
                        </div>
                        <div class="scenario-total">
                            <span class="st-label">Totale bolletta</span>
                            <span class="st-value">${EUR(sc.result.totale_finale)}</span>
                        </div>
                        <div class="scenario-legend">${legend}</div>
                    </div>
                `;
            })
            .join("");

        // Istanzia i mini-donut
        prepared.forEach((sc, idx) => {
            const canvas = document.getElementById(`scenarioPie-${idx}`);
            if (!canvas) return;
            const ctx = canvas.getContext("2d");
            const chart = new Chart(ctx, {
                type: "doughnut",
                data: {
                    labels: sc.segments.map((s) => s.label),
                    datasets: [{
                        data: sc.segments.map((s) => s.value),
                        backgroundColor: sc.segments.map((s) => s.color),
                        borderColor: "#fff",
                        borderWidth: 2,
                        hoverOffset: 6,
                    }],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "58%",
                    animation: { duration: 350 },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const v = ctx.parsed;
                                    const pct = sc.segmentTotal > 0
                                        ? (v / sc.segmentTotal) * 100
                                        : 0;
                                    return ` ${EUR(v)} — ${PCT(pct)}`;
                                },
                            },
                        },
                    },
                },
            });
            scenarioChartInstances.push(chart);
        });
    }

    // =============================================================
    // RENDERING — Riepilogo totali
    // =============================================================
    function renderSummary(p, r) {
        const costoKwh =
            r.consumo_annuo > 0 ? r.totale_finale / r.consumo_annuo : 0;

        const cards = [
            {
                label: "Spesa netta",
                value: EUR(r.spesa_netta),
                sub: "Materia + rete + oneri (senza imposte e sconti)",
            },
            {
                label: "Accise",
                value: EUR(r.accisa_totale),
                sub:
                    r.consumo_annuo > 1800
                        ? `Su ${(r.consumo_annuo - 1800).toFixed(0)} kWh oltre soglia 1800`
                        : "Sotto soglia 1800 kWh",
            },
            {
                label: "Sconto una tantum",
                value: "− " + EUR(p.sconto_una_tantum),
                sub: "Applicato prima dell'IVA",
            },
            {
                label: "Imponibile IVA",
                value: EUR(r.imponibile_iva),
                sub: `Base per IVA ${(p.iva_rate * 100).toFixed(0)}%`,
            },
            {
                label: "IVA",
                value: EUR(r.iva_totale),
                sub: `${(p.iva_rate * 100).toFixed(0)}% sull'imponibile`,
            },
            {
                label: "Costo medio €/kWh",
                value: costoKwh.toFixed(4) + " €/kWh",
                sub: "Totale bolletta / consumo annuo",
            },
            {
                label: "TOTALE COMPLESSIVO",
                value: EUR(r.totale_finale),
                sub: "Importo annuo finale",
                highlight: true,
            },
        ];

        $("#summaryCards").innerHTML = cards
            .map(
                (c) => `
                <div class="summary-card ${c.highlight ? "highlight" : ""}">
                    <div class="label">${c.label}</div>
                    <div class="value">${c.value}</div>
                    <div class="sub">${c.sub}</div>
                </div>
            `
            )
            .join("");
    }

    // =============================================================
    // UI — distribuzione e prezzo mensile
    // =============================================================

    // Costruisce le 12 celle (input) dentro la griglia specificata.
    function buildMonthsGrid(container, values, opts) {
        const { step, decimals, onChange } = opts;
        container.innerHTML = MONTHS.map(
            (m, i) => `
            <div class="month-cell" data-idx="${i}">
                <label>${m}</label>
                <input type="number" step="${step}" value="${values[i].toFixed(decimals)}">
            </div>`
        ).join("");

        container.querySelectorAll(".month-cell input").forEach((input, i) => {
            input.addEventListener("input", () => {
                const v = parseFloat(input.value);
                if (!isNaN(v)) onChange(i, v);
            });
        });
    }

    // Aggiorna (ri-setta i value) delle celle esistenti senza ricrearle,
    // utile quando la modalità uniforme ricalcola le quote a partire dal totale.
    function refreshMonthsGridValues(container, values, decimals) {
        container.querySelectorAll(".month-cell input").forEach((input, i) => {
            if (document.activeElement !== input) {
                input.value = values[i].toFixed(decimals);
            }
        });
    }

    function setGridLocked(container, locked) {
        container.querySelectorAll(".month-cell").forEach((cell) => {
            cell.classList.toggle("is-locked", locked);
            const inp = cell.querySelector("input");
            if (inp) inp.disabled = locked;
        });
    }

    // Distribuisce equamente il consumo totale sui 12 mesi
    function distributeUniform() {
        const total = parseFloat($("#consumo_annuo").value) || 0;
        const share = total / 12;
        for (let i = 0; i < 12; i++) monthlyState.kwh[i] = share;
    }

    // Applica il profilo di consumo dal database: popola i 12 kWh mensili
    // e aggiorna consumo_annuo con il totale del profilo.
    function applyConsumptionProfile(key) {
        const profile = CONSUMPTION_PROFILES[key];
        if (!profile) return false;
        for (let i = 0; i < 12; i++) {
            monthlyState.kwh[i] = profile.kwh[i];
        }
        const total = profile.kwh.reduce((s, v) => s + v, 0);
        const input = $("#consumo_annuo");
        if (input) input.value = total.toFixed(0);
        monthlyState.selectedConsumptionProfile = key;
        return true;
    }

    // Azzera la selezione del profilo (quando i valori vengono modificati a mano)
    function clearSelectedConsumptionProfile() {
        monthlyState.selectedConsumptionProfile = null;
    }

    // Copia il prezzo unico corrente su tutti i mesi
    function distributeUniformPrice() {
        const p = parseFloat($("#p_ingm_f0").value) || 0;
        for (let i = 0; i < 12; i++) monthlyState.prices[i] = p;
    }

    // Preset: applica i prezzi P_INGM mensili di riferimento (anno di default)
    function applyDefaultMonthlyPrices() {
        applyMonthlyPricesFromYear(DEFAULT_PRICE_YEAR);
    }

    // Applica i prezzi PUN di uno specifico anno dalla serie storica.
    // Aggiorna anche monthlyState.selectedPriceYear per riflettere lo stato.
    function applyMonthlyPricesFromYear(year) {
        const prices = getPricesForYear(year);
        if (!prices) return false;
        for (let i = 0; i < 12; i++) {
            monthlyState.prices[i] = prices[i];
        }
        monthlyState.selectedPriceYear = year;
        return true;
    }

    // Quando si entra in "single" mode azzera l'anno (il prezzo uniforme non è più storico)
    function clearSelectedPriceYear() {
        monthlyState.selectedPriceYear = null;
    }

    // Aggiorna il footer della sezione kWh mensili
    function updateKwhFooter() {
        const total = monthlyState.kwh.reduce((s, v) => s + v, 0);
        $("#kwhTotalDisplay").textContent = total.toLocaleString("it-IT", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        const inputAnnuo = parseFloat($("#consumo_annuo").value) || 0;
        const delta = total - inputAnnuo;
        const deltaEl = $("#kwhDelta");
        if (monthlyState.consumptionMode === "custom" && Math.abs(delta) > 0.5) {
            const sign = delta > 0 ? "+" : "";
            deltaEl.textContent = `Δ vs consumo annuo: ${sign}${delta.toFixed(0)} kWh`;
            deltaEl.className =
                "months-footer-delta " + (delta > 0 ? "pos" : "neg");
        } else {
            deltaEl.textContent = "";
            deltaEl.className = "months-footer-delta";
        }
    }

    // Aggiorna footer prezzo medio ponderato
    function updatePriceFooter() {
        const totalKwh = monthlyState.kwh.reduce((s, v) => s + v, 0);
        let avg;
        if (monthlyState.priceMode === "monthly" && totalKwh > 0) {
            const weighted = monthlyState.prices.reduce(
                (s, pr, i) => s + pr * monthlyState.kwh[i],
                0
            );
            avg = weighted / totalKwh;
        } else {
            avg = parseFloat($("#p_ingm_f0").value) || 0;
        }
        $("#priceAvgDisplay").textContent = avg.toLocaleString("it-IT", {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        });
    }

    // =============================================================
    // Grafico a barre del consumo mensile (nella scheda Profilo utenza).
    // Si aggiorna istantaneamente a ogni modifica dei kWh mensili.
    // =============================================================
    let consumptionChartInstance = null;

    function ensureConsumptionChart() {
        if (consumptionChartInstance) return consumptionChartInstance;

        const canvas = $("#consumptionChart");
        if (!canvas) return null;

        consumptionChartInstance = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: MONTHS,
                datasets: [
                    {
                        label: "Consumo mensile (kWh)",
                        data: monthlyState.kwh.slice(),
                        backgroundColor: "rgba(37, 99, 235, 0.55)",
                        borderColor: "#2563eb",
                        borderWidth: 1,
                        borderRadius: 4,
                        hoverBackgroundColor: "rgba(37, 99, 235, 0.85)",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) =>
                                ` ${ctx.parsed.y.toLocaleString("it-IT", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 1,
                                })} kWh`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (v) => v + " kWh",
                            font: { size: 10 },
                        },
                        grid: { color: "rgba(15,23,42,0.05)" },
                    },
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false },
                    },
                },
            },
        });
        return consumptionChartInstance;
    }

    function updateConsumptionChart() {
        const chart = ensureConsumptionChart();
        if (!chart) return;
        chart.data.datasets[0].data = monthlyState.kwh.slice();
        // Colore leggermente diverso in modalità personalizzata per segnalare
        // che i dati sono stati modificati manualmente.
        const custom = monthlyState.consumptionMode === "custom";
        chart.data.datasets[0].backgroundColor = custom
            ? "rgba(14, 165, 233, 0.6)"
            : "rgba(37, 99, 235, 0.55)";
        chart.data.datasets[0].borderColor = custom ? "#0ea5e9" : "#2563eb";
        chart.update();
    }

    // -----------------------------------------------------------------
    // Grafico a barre del prezzo energia mensile (scheda Materia).
    // -----------------------------------------------------------------
    let priceChartInstance = null;

    function ensurePriceChart() {
        if (priceChartInstance) return priceChartInstance;
        const canvas = $("#priceChart");
        if (!canvas) return null;

        priceChartInstance = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: MONTHS,
                datasets: [
                    {
                        label: "Prezzo ingrosso (€/kWh)",
                        data: monthlyState.prices.slice(),
                        backgroundColor: "rgba(245, 158, 11, 0.45)",
                        borderColor: "#f59e0b",
                        borderWidth: 1,
                        borderRadius: 4,
                        hoverBackgroundColor: "rgba(245, 158, 11, 0.8)",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 250 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) =>
                                ` ${ctx.parsed.y.toLocaleString("it-IT", {
                                    minimumFractionDigits: 4,
                                    maximumFractionDigits: 4,
                                })} €/kWh`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (v) => Number(v).toFixed(3),
                            font: { size: 10 },
                        },
                        grid: { color: "rgba(15,23,42,0.05)" },
                    },
                    x: {
                        ticks: { font: { size: 11 } },
                        grid: { display: false },
                    },
                },
            },
        });
        return priceChartInstance;
    }

    function updatePriceChart() {
        const chart = ensurePriceChart();
        if (!chart) return;
        chart.data.datasets[0].data = monthlyState.prices.slice();
        const monthly = monthlyState.priceMode === "monthly";
        chart.data.datasets[0].backgroundColor = monthly
            ? "rgba(245, 158, 11, 0.7)"
            : "rgba(245, 158, 11, 0.4)";
        chart.update();
    }

    // Aggiorna la nota esplicativa sotto la sezione "Calcolo prezzo energia"
    function updatePriceModeNote() {
        const note = $("#priceModeNote");
        if (!note) return;
        if (monthlyState.priceMode === "single") {
            note.innerHTML =
                'In modalità <strong>Prezzo unico</strong> questo valore viene applicato a tutti i 12 mesi. Passa a <strong>Prezzo mensile</strong> per definire un prezzo diverso mese per mese.';
        } else {
            note.innerHTML =
                'In modalità <strong>Prezzo mensile</strong> i 12 valori a fianco sono il riferimento. Il campo qui sopra serve solo come base: modificandolo ora <em>non</em> si propaga ai singoli mesi.';
        }
    }

    function setupMonthlyUI() {
        // Costruzione iniziale delle griglie
        buildMonthsGrid($("#monthsKwhGrid"), monthlyState.kwh, {
            step: "1",
            decimals: 0,
            onChange: (i, v) => {
                monthlyState.kwh[i] = v;
                if (monthlyState.consumptionMode === "custom") {
                    const tot = monthlyState.kwh.reduce((s, x) => s + x, 0);
                    $("#consumo_annuo").value = tot.toFixed(0);
                }
                // Modifica manuale → il profilo preselezionato non è più valido
                clearSelectedConsumptionProfile();
                updateConsumptionProfileState();
                updateKwhFooter();
                updatePriceFooter();
                updateConsumptionChart();
            },
        });

        buildMonthsGrid($("#monthsPriceGrid"), monthlyState.prices, {
            step: "0.0001",
            decimals: 4,
            onChange: (i, v) => {
                monthlyState.prices[i] = v;
                // Modifica manuale → l'anno preselezionato non è più valido
                monthlyState.selectedPriceYear = null;
                updatePriceYearPickerState();
                updatePriceFooter();
                updatePriceChart();
            },
        });

        // Blocco iniziale: modalità uniform / single → input disabilitati
        setGridLocked($("#monthsKwhGrid"), true);
        setGridLocked($("#monthsPriceGrid"), true);

        // --- Segmented controls ---
        $$(".segmented").forEach((seg) => {
            const name = seg.dataset.name;
            // Lo switcher della vista Report è gestito da setupReportView()
            if (name !== "consumptionMode" && name !== "priceMode") return;
            seg.querySelectorAll(".seg-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const value = btn.dataset.value;
                    seg.querySelectorAll(".seg-btn").forEach((b) =>
                        b.classList.toggle("active", b === btn)
                    );

                    if (name === "consumptionMode") {
                        monthlyState.consumptionMode = value;
                        if (value === "uniform") {
                            distributeUniform();
                            clearSelectedConsumptionProfile();
                            refreshMonthsGridValues(
                                $("#monthsKwhGrid"),
                                monthlyState.kwh,
                                0
                            );
                            setGridLocked($("#monthsKwhGrid"), true);
                        } else {
                            setGridLocked($("#monthsKwhGrid"), false);
                        }
                        updateConsumptionProfileState();
                        updateKwhFooter();
                        updatePriceFooter();
                        updateConsumptionChart();
                    } else if (name === "priceMode") {
                        monthlyState.priceMode = value;
                        if (value === "single") {
                            distributeUniformPrice();
                            clearSelectedPriceYear();
                            refreshMonthsGridValues(
                                $("#monthsPriceGrid"),
                                monthlyState.prices,
                                4
                            );
                            setGridLocked($("#monthsPriceGrid"), true);
                        } else {
                            // Passaggio a "Prezzo mensile": applica i preset anno di default
                            applyDefaultMonthlyPrices();
                            refreshMonthsGridValues(
                                $("#monthsPriceGrid"),
                                monthlyState.prices,
                                4
                            );
                            setGridLocked($("#monthsPriceGrid"), false);
                        }
                        updatePriceYearPickerState();
                        updatePriceFooter();
                        updatePriceChart();
                        updatePriceModeNote();
                    }
                });
            });
        });

        // --- Sincronizzazione con consumo_annuo e p_ingm_f0 ---
        $("#consumo_annuo").addEventListener("input", () => {
            if (monthlyState.consumptionMode === "uniform") {
                distributeUniform();
                refreshMonthsGridValues(
                    $("#monthsKwhGrid"),
                    monthlyState.kwh,
                    0
                );
            }
            updateKwhFooter();
            updatePriceFooter();
            updateConsumptionChart();
        });

        $("#p_ingm_f0").addEventListener("input", () => {
            if (monthlyState.priceMode === "single") {
                distributeUniformPrice();
                refreshMonthsGridValues(
                    $("#monthsPriceGrid"),
                    monthlyState.prices,
                    4
                );
                updatePriceChart();
            }
            updatePriceFooter();
        });

        // --- Picker serie storica PUN ---
        setupPriceYearPicker();

        // --- Picker profilo di consumo ---
        setupConsumptionProfilePicker();

        // Inizializzazione coerente con i default
        distributeUniform();
        distributeUniformPrice();
        refreshMonthsGridValues($("#monthsKwhGrid"), monthlyState.kwh, 0);
        refreshMonthsGridValues($("#monthsPriceGrid"), monthlyState.prices, 4);
        updateKwhFooter();
        updatePriceFooter();
        ensureConsumptionChart();
        updateConsumptionChart();
        ensurePriceChart();
        updatePriceChart();
        updatePriceModeNote();
        updatePriceYearPickerState();
        updateConsumptionProfileState();
    }

    // Popola il <select> con gli anni disponibili nella serie storica PUN
    // e collega gli event handler per il cambio anno e per il ripristino.
    function setupPriceYearPicker() {
        const select = $("#priceYearSelect");
        const resetBtn = $("#resetPriceYearBtn");
        if (!select) return;

        // Anni disponibili, ordinati dal più recente al più vecchio
        const years = Object.keys(PUN_HISTORY_MWH)
            .map((y) => parseInt(y, 10))
            .sort((a, b) => b - a);

        // Costruisci le <option>
        select.innerHTML =
            '<option value="">— prezzi personalizzati —</option>' +
            years
                .map((y) => {
                    const isDefault = y === DEFAULT_PRICE_YEAR ? " (default)" : "";
                    return `<option value="${y}">${y}${isDefault}</option>`;
                })
                .join("");

        select.addEventListener("change", () => {
            const v = select.value;
            if (!v) return;
            const year = parseInt(v, 10);
            if (applyMonthlyPricesFromYear(year)) {
                refreshMonthsGridValues(
                    $("#monthsPriceGrid"),
                    monthlyState.prices,
                    4
                );
                updatePriceYearPickerState();
                updatePriceFooter();
                updatePriceChart();
            }
        });

        if (resetBtn) {
            resetBtn.addEventListener("click", () => {
                if (monthlyState.priceMode !== "monthly") return;
                applyDefaultMonthlyPrices();
                refreshMonthsGridValues(
                    $("#monthsPriceGrid"),
                    monthlyState.prices,
                    4
                );
                updatePriceYearPickerState();
                updatePriceFooter();
                updatePriceChart();
            });
        }
    }

    // Sincronizza lo stato del picker (abilitato/disabilitato, valore selezionato)
    function updatePriceYearPickerState() {
        const select = $("#priceYearSelect");
        const resetBtn = $("#resetPriceYearBtn");
        const note = $("#priceYearNote");
        if (!select) return;

        const enabled = monthlyState.priceMode === "monthly";
        select.disabled = !enabled;
        if (resetBtn) resetBtn.disabled = !enabled;

        if (enabled) {
            select.value = monthlyState.selectedPriceYear
                ? String(monthlyState.selectedPriceYear)
                : "";
            if (note) {
                if (monthlyState.selectedPriceYear) {
                    note.innerHTML = `Valori precompilati con il <strong>PUN medio ${monthlyState.selectedPriceYear}</strong>. Modificando un singolo mese l'anno diventa <em>personalizzato</em>.`;
                } else {
                    note.innerHTML =
                        "Valori <strong>personalizzati</strong> (non corrispondono a un anno della serie storica). Seleziona un anno per ripartire dai dati PUN.";
                }
            }
        } else {
            select.value = "";
            if (note) {
                note.innerHTML =
                    "Passa a <strong>Prezzo mensile</strong> per selezionare un anno di riferimento del PUN. I valori restano comunque modificabili manualmente.";
            }
        }
    }

    // Popola il <select> con i profili di consumo disponibili e
    // collega l'handler: selezionando un profilo si passa automaticamente
    // a "Personalizzata" e si caricano i 12 valori mensili.
    function setupConsumptionProfilePicker() {
        const select = $("#consumptionProfileSelect");
        if (!select) return;

        select.innerHTML =
            '<option value="">— consumo personalizzato —</option>' +
            Object.entries(CONSUMPTION_PROFILES)
                .map(
                    ([key, prof]) =>
                        `<option value="${key}">${prof.label}</option>`
                )
                .join("");

        select.addEventListener("change", () => {
            const v = select.value;
            if (!v) return;
            if (!applyConsumptionProfile(v)) return;

            // Passa automaticamente in modalità "Personalizzata"
            monthlyState.consumptionMode = "custom";
            $$(".segmented[data-name='consumptionMode'] .seg-btn").forEach(
                (b) => b.classList.toggle("active", b.dataset.value === "custom")
            );
            setGridLocked($("#monthsKwhGrid"), false);

            refreshMonthsGridValues(
                $("#monthsKwhGrid"),
                monthlyState.kwh,
                0
            );
            updateConsumptionProfileState();
            updateKwhFooter();
            updatePriceFooter();
            updateConsumptionChart();
        });
    }

    // Sincronizza lo stato visuale del picker profilo di consumo
    function updateConsumptionProfileState() {
        const select = $("#consumptionProfileSelect");
        const note = $("#consumptionProfileNote");
        if (!select) return;

        select.value = monthlyState.selectedConsumptionProfile || "";

        if (!note) return;
        if (monthlyState.consumptionMode === "uniform") {
            note.innerHTML =
                "Scegli un profilo di consumo: i 12 valori mensili vengono precompilati e la modalità passa a <strong>Personalizzata</strong>. Restano comunque modificabili manualmente.";
        } else if (monthlyState.selectedConsumptionProfile) {
            const prof =
                CONSUMPTION_PROFILES[monthlyState.selectedConsumptionProfile];
            note.innerHTML = `Profilo attivo: <strong>${prof.label}</strong>. Modificando un mese diventa <em>personalizzato</em>.`;
        } else {
            note.innerHTML =
                "Consumo <strong>personalizzato</strong>. Seleziona un profilo per ripartire dai valori di riferimento.";
        }
    }

    // =============================================================
    // RENDERING — Dettaglio mensile (tabella + grafico)
    // =============================================================
    let monthlyChartInstance = null;
    let monthlyStackedChartInstance = null;

    // Calcola, per ciascun mese, tutte le componenti di costo della bolletta.
    // - Voci "fisse" (quote annue): distribuite uniformemente sui 12 mesi
    // - Voci "variabili" (proporzionali ai kWh): prodotto puntuale per ogni mese
    // - Accise e sconto una tantum: distribuite pro-quota ai kWh mensili
    //   (così la somma sui 12 mesi riproduce esattamente il totale annuo)
    function buildMonthlyBreakdown(p, r) {
        const md = r.monthlyDetail;
        const N = 12;
        const consumo = r.consumo_annuo;

        return md.map((m) => {
            const kwh = m.kwh;
            const share = consumo > 0 ? kwh / consumo : 1 / N;

            const comm_fissa = p.p_fix_v / N;
            const disp_fisso = p.dispbt_f / N;
            const rete_fissa = p.sigma1 / N;
            const rete_potenza =
                ((p.sigma2 + p.uc6s_d) * p.potenza_impegnata) / N;

            const materia = m.costo_materia;
            const disp_var = m.costo_dispacciamento;
            const rete_var = (p.sigma3 + p.uc3 + p.uc6p_d) * kwh;
            const oneri = (p.asos + p.arim) * kwh;

            const accise = r.accisa_totale * share;
            const sconto_m = p.sconto_una_tantum * share;

            const imponibile_m =
                comm_fissa +
                disp_fisso +
                rete_fissa +
                rete_potenza +
                materia +
                disp_var +
                rete_var +
                oneri +
                accise -
                sconto_m;
            const iva = imponibile_m * p.iva_rate;

            return {
                month: m.month,
                kwh,
                prezzo_energia: m.prezzo_energia,
                p_ingm: m.p_ingm,
                comm_fissa,
                disp_fisso,
                rete_fissa,
                rete_potenza,
                materia,
                disp_var,
                rete_var,
                oneri,
                accise,
                iva,
                total: imponibile_m + iva,
            };
        });
    }

    function renderMonthlyDetail(p, r) {
        const md = r.monthlyDetail;

        // --- Tabella ---
        const rows = md
            .map((m) => {
                return `
                <tr>
                    <td>${MONTHS_LONG[m.month]}</td>
                    <td>${m.kwh.toLocaleString("it-IT", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                    })}</td>
                    <td>${NUM4(m.p_ingm)}</td>
                    <td>${NUM4(m.prezzo_energia)}</td>
                    <td>${EUR(m.costo_materia)}</td>
                    <td>${EUR(m.costo_dispacciamento)}</td>
                    <td>${EUR(m.costo_materia + m.costo_dispacciamento)}</td>
                </tr>`;
            })
            .join("");

        const totKwh = md.reduce((s, m) => s + m.kwh, 0);
        const totMateria = md.reduce((s, m) => s + m.costo_materia, 0);
        const totDisp = md.reduce((s, m) => s + m.costo_dispacciamento, 0);
        const avgPrice = totKwh > 0 ? totMateria / totKwh : 0;

        $("#monthlyTable").innerHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Mese</th>
                        <th>Consumo (kWh)</th>
                        <th>P<sub>INGM</sub> (€/kWh)</th>
                        <th>Prezzo materia (€/kWh)</th>
                        <th>Costo materia</th>
                        <th>Costo dispacciamento</th>
                        <th>Totale mese</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                    <tr class="total-row">
                        <td>TOTALE</td>
                        <td>${totKwh.toLocaleString("it-IT", {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                        })}</td>
                        <td>—</td>
                        <td>${NUM4(avgPrice)}</td>
                        <td>${EUR(totMateria)}</td>
                        <td>${EUR(totDisp)}</td>
                        <td>${EUR(totMateria + totDisp)}</td>
                    </tr>
                </tbody>
            </table>
        `;

        // --- Grafico combinato ---
        const ctx = $("#monthlyChart").getContext("2d");
        if (monthlyChartInstance) monthlyChartInstance.destroy();

        monthlyChartInstance = new Chart(ctx, {
            data: {
                labels: MONTHS_LONG,
                datasets: [
                    {
                        type: "bar",
                        label: "Consumo (kWh)",
                        data: md.map((m) => m.kwh),
                        backgroundColor: "rgba(37, 99, 235, 0.55)",
                        borderColor: "#2563eb",
                        borderWidth: 1,
                        yAxisID: "yKwh",
                        order: 2,
                    },
                    {
                        type: "line",
                        label: "Costo materia (€)",
                        data: md.map((m) => m.costo_materia),
                        borderColor: "#f59e0b",
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        borderWidth: 2.5,
                        tension: 0.3,
                        pointRadius: 4,
                        pointBackgroundColor: "#f59e0b",
                        yAxisID: "yEuro",
                        order: 1,
                    },
                    {
                        type: "line",
                        label: "P_INGM (€/kWh)",
                        data: md.map((m) => m.p_ingm),
                        borderColor: "#10b981",
                        backgroundColor: "transparent",
                        borderWidth: 2,
                        borderDash: [4, 4],
                        tension: 0.2,
                        pointRadius: 3,
                        pointBackgroundColor: "#10b981",
                        yAxisID: "yPrice",
                        order: 0,
                        hidden: p.priceMode === "single",
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { boxWidth: 14, padding: 16 },
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                if (ctx.dataset.yAxisID === "yEuro")
                                    return ` ${ctx.dataset.label}: ${EUR(v)}`;
                                if (ctx.dataset.yAxisID === "yPrice")
                                    return ` ${ctx.dataset.label}: ${NUM4(v)} €/kWh`;
                                return ` ${ctx.dataset.label}: ${v.toFixed(0)} kWh`;
                            },
                        },
                    },
                },
                scales: {
                    yKwh: {
                        type: "linear",
                        position: "left",
                        title: { display: true, text: "kWh" },
                        grid: { color: "rgba(15,23,42,0.05)" },
                    },
                    yEuro: {
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "€" },
                        grid: { display: false },
                    },
                    yPrice: {
                        type: "linear",
                        position: "right",
                        display: false,
                    },
                    x: {
                        grid: { display: false },
                    },
                },
            },
        });

        renderMonthlyStackedChart(p, r);
    }

    // Grafico a barre impilate: composizione mensile della bolletta + linea prezzo
    function renderMonthlyStackedChart(p, r) {
        const canvas = $("#monthlyStackedChart");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (monthlyStackedChartInstance) monthlyStackedChartInstance.destroy();

        const breakdown = buildMonthlyBreakdown(p, r);

        // Palette coordinata con le famiglie dei costi:
        //   arancio = vendita/commerciale, blu = dispacciamento,
        //   verde = rete, viola = oneri, grigio = imposte
        const components = [
            { key: "comm_fissa",   label: "Commercializzazione",   color: "#fdba74" },
            { key: "materia",      label: "Materia energia",       color: "#f97316" },
            { key: "disp_fisso",   label: "Dispacciamento fisso",  color: "#93c5fd" },
            { key: "disp_var",     label: "Dispacciamento var.",   color: "#3b82f6" },
            { key: "rete_fissa",   label: "Rete — quota fissa",    color: "#86efac" },
            { key: "rete_potenza", label: "Rete — quota potenza",  color: "#34d399" },
            { key: "rete_var",     label: "Rete — quota variabile", color: "#10b981" },
            { key: "oneri",        label: "Oneri di sistema",      color: "#c084fc" },
            { key: "accise",       label: "Accise",                color: "#94a3b8" },
            { key: "iva",          label: "IVA",                   color: "#475569" },
        ];

        const barDatasets = components.map((c) => ({
            type: "bar",
            label: c.label,
            data: breakdown.map((m) => m[c.key]),
            backgroundColor: c.color,
            borderColor: "rgba(255,255,255,0.5)",
            borderWidth: 0.5,
            stack: "bill",
            yAxisID: "yEuro",
            order: 2,
        }));

        const priceLine = {
            type: "line",
            label: "Prezzo energia (€/kWh)",
            data: breakdown.map((m) => m.prezzo_energia),
            borderColor: "#dc2626",
            backgroundColor: "rgba(220, 38, 38, 0.15)",
            borderWidth: 2.5,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: "#dc2626",
            yAxisID: "yPrice",
            order: 0,
        };

        monthlyStackedChartInstance = new Chart(ctx, {
            data: {
                labels: MONTHS_LONG,
                datasets: [...barDatasets, priceLine],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: {
                            boxWidth: 12,
                            padding: 12,
                            font: { size: 11 },
                        },
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                if (ctx.dataset.yAxisID === "yPrice")
                                    return ` ${ctx.dataset.label}: ${NUM4(v)} €/kWh`;
                                return ` ${ctx.dataset.label}: ${EUR(v)}`;
                            },
                            footer: (items) => {
                                if (!items || items.length === 0) return "";
                                const idx = items[0].dataIndex;
                                const tot = breakdown[idx].total;
                                return `Totale mese: ${EUR(tot)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                    },
                    yEuro: {
                        type: "linear",
                        position: "left",
                        stacked: true,
                        title: { display: true, text: "Spesa mensile (€)" },
                        grid: { color: "rgba(15,23,42,0.05)" },
                        ticks: {
                            callback: (v) => `${v.toFixed(0)} €`,
                        },
                    },
                    yPrice: {
                        type: "linear",
                        position: "right",
                        title: { display: true, text: "€/kWh" },
                        grid: { display: false },
                        ticks: {
                            callback: (v) => v.toFixed(3),
                        },
                    },
                },
            },
        });
    }

    // =============================================================
    // Sotto-schede del form (parametri in input)
    // =============================================================
    function setupSubTabs() {
        const tabBtns = $$(".sub-tab-btn");
        const panels = $$(".sub-panel");
        const prevBtn = $("#prevPanelBtn");
        const nextBtn = $("#nextPanelBtn");

        const panelIds = tabBtns.map((b) => b.dataset.panel);

        function activate(idx) {
            const id = panelIds[idx];
            tabBtns.forEach((b, i) => b.classList.toggle("active", i === idx));
            panels.forEach((p) => p.classList.toggle("active", p.id === id));

            prevBtn.disabled = idx === 0;
            nextBtn.disabled = idx === panelIds.length - 1;

            // Scrollare la barra delle sotto-schede per mantenere l'attivo visibile
            const activeBtn = tabBtns[idx];
            if (activeBtn && activeBtn.scrollIntoView) {
                activeBtn.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                    inline: "center",
                });
            }
        }

        function currentIdx() {
            return tabBtns.findIndex((b) => b.classList.contains("active"));
        }

        tabBtns.forEach((btn, i) => {
            btn.addEventListener("click", () => activate(i));
        });

        prevBtn.addEventListener("click", () => {
            const i = currentIdx();
            if (i > 0) activate(i - 1);
        });

        nextBtn.addEventListener("click", () => {
            const i = currentIdx();
            if (i < panelIds.length - 1) activate(i + 1);
        });

        // Evidenzia la sotto-scheda del campo attualmente focalizzato
        $$(".sub-panel").forEach((panel) => {
            panel.addEventListener("focusin", () => {
                const panelId = panel.id;
                tabBtns.forEach((b) =>
                    b.classList.toggle("has-focus", b.dataset.panel === panelId && !b.classList.contains("active"))
                );
            });
        });

        // Init
        activate(0);
    }

    // =============================================================
    // Tabs
    // =============================================================
    function setupTabs() {
        $$(".tab-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const target = btn.dataset.tab;
                $$(".tab-btn").forEach((b) => b.classList.remove("active"));
                $$(".tab-panel").forEach((p) => p.classList.remove("active"));
                btn.classList.add("active");
                $("#tab-" + target).classList.add("active");

                if (target === "breakdown" && pieChartInstance) {
                    pieChartInstance.resize();
                }
            });
        });
    }

    // Gestisce lo switch Dashboard/Tabella nel report e i click sulle sezioni
    // dell'accordion (espandi/comprimi).
    function setupReportView() {
        const switcher = document.querySelector('.view-switcher[data-name="reportView"]');
        if (switcher) {
            switcher.querySelectorAll(".seg-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const value = btn.dataset.value;
                    switcher
                        .querySelectorAll(".seg-btn")
                        .forEach((b) => b.classList.toggle("active", b === btn));
                    $$("#tab-report .report-view").forEach((v) =>
                        v.classList.remove("active")
                    );
                    const target =
                        value === "table" ? "#reportTable" : "#reportDashboard";
                    const el = document.querySelector(target);
                    if (el) el.classList.add("active");
                });
            });
        }

        // Toggle espansione di una singola sezione (click sulla riga d'intestazione)
        const accordion = $("#reportAccordion");
        if (accordion) {
            accordion.addEventListener("click", (e) => {
                const headerRow = e.target.closest(".acc-header-row");
                if (!headerRow) return;
                const section = headerRow.closest(".acc-section");
                if (!section) return;
                const isOpen = section.classList.toggle("is-open");
                headerRow.setAttribute(
                    "aria-expanded",
                    isOpen ? "true" : "false"
                );
            });
        }

        // Pulsanti "Espandi tutto" / "Comprimi tutto"
        document
            .querySelectorAll('#tab-report [data-acc-action]')
            .forEach((btn) => {
                btn.addEventListener("click", () => {
                    const action = btn.dataset.accAction;
                    const sections = $$("#reportAccordion .acc-section");
                    sections.forEach((s) => {
                        const open = action === "expand";
                        s.classList.toggle("is-open", open);
                        const h = s.querySelector(".acc-header-row");
                        if (h)
                            h.setAttribute(
                                "aria-expanded",
                                open ? "true" : "false"
                            );
                    });
                });
            });
    }

    // =============================================================
    // Reset
    // =============================================================
    function resetDefaults() {
        Object.entries(DEFAULTS).forEach(([k, v]) => {
            const el = document.getElementById(k);
            if (!el) return;
            if (el.type === "checkbox") el.checked = !!v;
            else el.value = v;
        });
    }

    // =============================================================
    // Main flow
    // =============================================================
    function runSimulation() {
        const inputs = readInputs();
        const result = computeBill(inputs);

        // Memorizziamo i riferimenti annuali per permettere al selettore
        // di periodo (tab "Peso delle componenti") di ricalcolare le
        // slice senza rieseguire la simulazione completa.
        lastInputs = inputs;
        lastAnnualResult = result;

        renderReport(inputs, result);
        renderMonthlyDetail(inputs, result);
        renderBreakdownSection(inputs, result);
        renderPriceScenarios(inputs, result);
        renderSummary(inputs, result);

        $("#results").classList.remove("hidden");
        // Scroll dolce verso i risultati
        $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // =============================================================
    // Init
    // =============================================================
    function resetMonthlyState() {
        monthlyState.consumptionMode = "uniform";
        monthlyState.priceMode = "single";
        monthlyState.selectedPriceYear = null;
        monthlyState.selectedConsumptionProfile = null;

        // Riallinea segmented buttons (solo quelli che gestiscono lo stato mensile)
        $$(".segmented").forEach((seg) => {
            const name = seg.dataset.name;
            if (name !== "consumptionMode" && name !== "priceMode") return;
            const target =
                name === "consumptionMode"
                    ? monthlyState.consumptionMode
                    : monthlyState.priceMode;
            seg.querySelectorAll(".seg-btn").forEach((b) =>
                b.classList.toggle("active", b.dataset.value === target)
            );
        });

        distributeUniform();
        distributeUniformPrice();
        refreshMonthsGridValues($("#monthsKwhGrid"), monthlyState.kwh, 0);
        refreshMonthsGridValues($("#monthsPriceGrid"), monthlyState.prices, 4);
        setGridLocked($("#monthsKwhGrid"), true);
        setGridLocked($("#monthsPriceGrid"), true);
        updateKwhFooter();
        updatePriceFooter();
        updateConsumptionChart();
        updatePriceChart();
        updatePriceModeNote();
        updatePriceYearPickerState();
        updateConsumptionProfileState();
    }

    document.addEventListener("DOMContentLoaded", () => {
        setupSubTabs();
        setupTabs();
        setupReportView();
        setupPieControls();
        setupPeriodSelector();
        setupMonthlyUI();

        $("#simForm").addEventListener("submit", (e) => {
            e.preventDefault();
            runSimulation();
        });

        $("#resetBtn").addEventListener("click", () => {
            resetDefaults();
            resetMonthlyState();
        });

        // Esegui il calcolo iniziale con i valori predefiniti
        runSimulation();
    });
})();
