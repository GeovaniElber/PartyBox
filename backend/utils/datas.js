// Funções de datas partilhadas.
// O mysql2 devolve as colunas DATE/DATETIME como objetos Date na hora local do servidor.

const pad = (n) => String(n).padStart(2, '0');

// Converter um valor (Date ou texto) em Date
const paraData = (valor) => {
    if (valor instanceof Date) return valor;

    if (typeof valor === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
            return new Date(`${valor}T00:00:00`);
        }

        return new Date(valor.replace(' ', 'T'));
    }

    return new Date(valor);
};

// AAAA-MM-DD
const paraISO = (valor) => {
    const d = paraData(valor);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// DD/MM/AAAA
const formatarData = (valor) => {
    const d = paraData(valor);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// DD/MM/AAAA, HH:mm
const formatarDataHora = (valor) => {
    const d = paraData(valor);
    return `${formatarData(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// "20/11/2026" ou "20/11/2026 a 22/11/2026"
const formatarPeriodo = (inicio, fim) => {
    return paraISO(inicio) === paraISO(fim)
        ? formatarData(inicio)
        : `${formatarData(inicio)} a ${formatarData(fim)}`;
};

// Data de hoje em Portugal (AAAA-MM-DD)
const hojeISO = () => new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Lisbon'
});

// Validar formato e existência de uma data AAAA-MM-DD
const dataValida = (data) => {
    if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return false;
    }

    const [ano, mes, dia] = data.split('-').map(Number);
    const objeto = new Date(Date.UTC(ano, mes - 1, dia));

    return (
        objeto.getUTCFullYear() === ano &&
        objeto.getUTCMonth() === mes - 1 &&
        objeto.getUTCDate() === dia
    );
};

module.exports = {
    paraData,
    paraISO,
    formatarData,
    formatarDataHora,
    formatarPeriodo,
    hojeISO,
    dataValida
};
