const painelModel = require('../models/painelModel');
const aluguerModel = require('../models/aluguerModel');
const multaModel = require('../models/multaModel');
const { responderErro } = require('../utils/erros');
const { paraISO } = require('../utils/datas');

const pad = (n) => String(n).padStart(2, '0');

// Preencher os dias sem faturação com 0 (últimos N dias, do mais antigo ao mais recente)
const serieDiaria = (linhas, dias) => {
    const valores = new Map(linhas.map((l) => [l.dia, Number(l.valor)]));
    const serie = [];

    for (let i = dias - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dia = paraISO(d);
        serie.push({ dia, valor: valores.get(dia) || 0 });
    }

    return serie;
};

// Preencher os meses sem faturação com 0 (últimos N meses)
const serieMensal = (linhas, meses) => {
    const valores = new Map(linhas.map((l) => [l.mes, Number(l.valor)]));
    const serie = [];

    for (let i = meses - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const mes = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        serie.push({ mes, valor: valores.get(mes) || 0 });
    }

    return serie;
};

// Painel de controlo do administrador:
// temas alugados, clientes multados, faturação atual e média (diária e mensal).
const painelAdministrador = async (req, res) => {
    try {
        const [totais, porDia, porMes, contadores, temasAlugados, clientesMultados, atividade] = await Promise.all([
            painelModel.faturacao(),
            painelModel.faturacaoPorDia(30),
            painelModel.faturacaoPorMes(12),
            painelModel.contadores(),
            aluguerModel.listarAtivos(),
            painelModel.clientesMultados(),
            painelModel.atividadeRecente(10)
        ]);

        const hoje = new Date();
        const diaDoMes = hoje.getDate();

        // Média mensal: últimos 12 meses fechados, contando só os meses desde a primeira receita
        let mesesComHistorico = 0;

        if (totais.primeira_receita) {
            const primeira = new Date(totais.primeira_receita);
            const mesesDesde =
                (hoje.getFullYear() - primeira.getFullYear()) * 12 +
                (hoje.getMonth() - primeira.getMonth());
            mesesComHistorico = Math.min(12, Math.max(0, mesesDesde));
        }

        const arredondar = (v) => Math.round(Number(v) * 100) / 100;

        return res.status(200).json({
            faturacao: {
                hoje: arredondar(totais.hoje),
                mes: arredondar(totais.mes),
                media_diaria: arredondar(Number(totais.mes) / diaDoMes),
                media_mensal: mesesComHistorico > 0
                    ? arredondar(Number(totais.ultimos_12_meses) / mesesComHistorico)
                    : arredondar(totais.mes),
                criterio:
                    'Inclui alugueres pagos no levantamento e multas pagas. ' +
                    'Média diária = faturação do mês ÷ dias decorridos. ' +
                    'Média mensal = média dos últimos 12 meses fechados.',
                serie_diaria: serieDiaria(porDia, 30),
                serie_mensal: serieMensal(porMes, 12)
            },
            contadores,
            temas_alugados: temasAlugados,
            clientes_multados: clientesMultados.map((c) => ({
                ...c,
                multas: Number(c.multas),
                valor_total: Number(c.valor_total)
            })),
            atividade
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao carregar o painel de controlo.');
    }
};

// Painel do funcionário (e tarefas de hoje do administrador)
const painelLoja = async (req, res) => {
    try {
        const [contadores, devolucoes, multas] = await Promise.all([
            painelModel.contadores(),
            painelModel.devolucoesHoje(),
            multaModel.listarPendentes()
        ]);

        return res.status(200).json({
            contadores,
            devolucoes: devolucoes.map((d) => ({
                ...d,
                // Horas que faltam para a multa automática (48h depois do prazo)
                horas_para_multa: Number(d.horas_atraso) >= 0
                    ? Math.max(0, 48 - Number(d.horas_atraso))
                    : null
            })),
            multas
        });

    } catch (erro) {
        return responderErro(res, erro, 'Erro ao carregar o painel.');
    }
};

module.exports = {
    painelAdministrador,
    painelLoja
};
