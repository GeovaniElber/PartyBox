// Avisos aos utilizadores por email (nodemailer) e WhatsApp (WhatsApp Cloud API da Meta).
//
// Sem configuração no .env, os avisos são escritos na consola em vez de enviados,
// para se poder desenvolver sem contas de email ou WhatsApp.
// Um aviso que falha nunca interrompe a operação que o originou.

const nodemailer = require('nodemailer');
const db = require('../src/config/database');

let transporter = null;

const emailConfigurado = () =>
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);

const whatsappConfigurado = () =>
    Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

const obterTransporter = () => {
    if (!transporter) {
        const porta = Number(process.env.SMTP_PORT || 587);

        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: porta,
            secure: porta === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            }
        });
    }

    return transporter;
};

// Escapar texto para HTML
const escaparHtml = (texto) => String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Modelo simples de email com as cores da PartyBox
const modeloEmail = (nome, assunto, mensagem, ligacao) => {
    const paragrafos = escaparHtml(mensagem)
        .split('\n')
        .filter(Boolean)
        .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1C1B22">${p}</p>`)
        .join('');

    const botao = ligacao
        ? `<p style="margin:22px 0"><a href="${escaparHtml(ligacao.url)}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#5B3FD9;color:#FFFFFF;font-weight:600;text-decoration:none">${escaparHtml(ligacao.texto)}</a></p>`
        : '';

    return `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#FAF7F2;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="margin:0 0 24px;font-size:22px;font-weight:800;color:#2A1B6B">PartyBox</p>
<div style="background:#FFFFFF;border-radius:16px;padding:28px">
<p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1C1B22">${escaparHtml(assunto)}</p>
${nome ? `<p style="margin:0 0 14px;font-size:15px;color:#1C1B22">Olá, ${escaparHtml(nome)}.</p>` : ''}
${paragrafos}${botao}
</div>
<p style="margin:20px 0 0;font-size:12px;color:#5E5A66">Recebeu este email porque tem conta na PartyBox.</p>
</div></body></html>`;
};

// Enviar email
const enviarEmail = async ({ para, nome, assunto, mensagem, ligacao }) => {
    if (!para) return false;

    const texto = [
        nome ? `Olá, ${nome}.` : null,
        mensagem,
        ligacao ? `${ligacao.texto}: ${ligacao.url}` : null
    ].filter(Boolean).join('\n\n');

    if (!emailConfigurado()) {
        console.log(`[email não enviado: SMTP por configurar] Para ${para} · ${assunto}\n${texto}\n`);
        return false;
    }

    await obterTransporter().sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: para,
        subject: `PartyBox · ${assunto}`,
        text: texto,
        html: modeloEmail(nome, assunto, mensagem, ligacao)
    });

    return true;
};

// Converter o telefone para o formato internacional sem "+" (ex.: 351912345678)
const normalizarTelefone = (telefone) => {
    if (!telefone) return null;

    let digitos = String(telefone).replace(/\D/g, '');

    if (digitos.startsWith('00')) digitos = digitos.slice(2);

    // Número português sem indicativo
    if (digitos.length === 9 && digitos.startsWith('9')) {
        digitos = `351${digitos}`;
    }

    return digitos.length >= 10 ? digitos : null;
};

// Enviar mensagem por WhatsApp.
// Mensagens iniciadas pela empresa precisam de um modelo aprovado pela Meta.
// Com WHATSAPP_TEMPLATE definido, envia esse modelo com o texto no parâmetro {{1}}.
// Sem modelo, envia texto livre (só funciona se o cliente escreveu à loja nas últimas 24h).
const enviarWhatsApp = async ({ telefone, assunto, mensagem }) => {
    const numero = normalizarTelefone(telefone);

    if (!numero) return false;

    const texto = `PartyBox · ${assunto}\n\n${mensagem}`;

    if (!whatsappConfigurado()) {
        console.log(`[WhatsApp não enviado: API por configurar] Para +${numero}\n${texto}\n`);
        return false;
    }

    const versao = process.env.WHATSAPP_API_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${versao}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const corpo = process.env.WHATSAPP_TEMPLATE
        ? {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'template',
            template: {
                name: process.env.WHATSAPP_TEMPLATE,
                language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_PT' },
                components: [{
                    type: 'body',
                    // Os parâmetros dos modelos não aceitam mudanças de linha
                    parameters: [{ type: 'text', text: `${assunto}: ${mensagem}`.replace(/\s*\n+\s*/g, ' ') }]
                }]
            }
        }
        : {
            messaging_product: 'whatsapp',
            to: numero,
            type: 'text',
            text: { body: texto }
        };

    const resposta = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(corpo)
    });

    if (!resposta.ok) {
        throw new Error(`WhatsApp API respondeu ${resposta.status}: ${await resposta.text()}`);
    }

    return true;
};

// Avisar um utilizador por email e WhatsApp.
// canais: ['email', 'whatsapp'] por omissão. Nunca lança erro.
const notificar = async (utilizador, { assunto, mensagem, ligacao, canais = ['email', 'whatsapp'] }) => {
    if (!utilizador) return;

    const envios = [];

    if (canais.includes('email')) {
        envios.push(['email', enviarEmail({
            para: utilizador.email,
            nome: utilizador.nome,
            assunto,
            mensagem,
            ligacao
        })]);
    }

    if (canais.includes('whatsapp')) {
        envios.push(['WhatsApp', enviarWhatsApp({
            telefone: utilizador.telefone,
            assunto,
            mensagem: ligacao ? `${mensagem}\n${ligacao.url}` : mensagem
        })]);
    }

    const resultados = await Promise.allSettled(envios.map(([, p]) => p));

    resultados.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error(`Falha ao enviar ${envios[i][0]} para o utilizador ${utilizador.id}:`, r.reason.message || r.reason);
        }
    });
};

// Avisar um utilizador a partir do ID. Nunca lança erro.
const notificarPorId = async (utilizadorId, aviso) => {
    try {
        const [linhas] = await db.query(
            'SELECT id, nome, email, telefone FROM utilizador WHERE id = ?',
            [utilizadorId]
        );

        await notificar(linhas[0], aviso);

    } catch (erro) {
        console.error(`Erro ao preparar aviso para o utilizador ${utilizadorId}:`, erro.message);
    }
};

module.exports = {
    notificar,
    notificarPorId,
    enviarEmail,
    enviarWhatsApp,
    normalizarTelefone
};
