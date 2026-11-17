const db = require('../src/config/database');

// Campos públicos de um utilizador (nunca devolver senha_hash nem tokens)
const CAMPOS = 'id, nome, email, tipo, telefone, foto, ativo, criado_em';

// Procurar utilizador pelo email (inclui senha_hash: só para o login)
const procurarPorEmail = async (email) => {
    const [rows] = await db.execute(
        'SELECT * FROM utilizador WHERE email = ?',
        [email]
    );

    return rows[0];
};

// Procurar utilizador pelo ID
const procurarPorId = async (id) => {
    const [rows] = await db.execute(
        `SELECT ${CAMPOS} FROM utilizador WHERE id = ?`,
        [id]
    );

    return rows[0];
};

// Procurar utilizador pelo ID com a senha (alterar palavra-passe)
const procurarComSenha = async (id) => {
    const [rows] = await db.execute(
        'SELECT id, senha_hash FROM utilizador WHERE id = ?',
        [id]
    );

    return rows[0];
};

// Criar novo utilizador
const criar = async (dados) => {
    const {
        nome,
        email,
        senha_hash,
        tipo,
        telefone,
        foto
    } = dados;

    const [resultado] = await db.execute(
        `INSERT INTO utilizador
        (nome, email, senha_hash, tipo, telefone, foto)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, email, senha_hash, tipo, telefone || null, foto || null]
    );

    return resultado.insertId;
};

// Alterar os dados pessoais (nome, email, telefone e fotografia)
const atualizarPerfil = async (id, { nome, email, telefone, foto }) => {
    const [resultado] = await db.execute(
        `UPDATE utilizador
         SET nome = ?, email = ?, telefone = ?, foto = ?
         WHERE id = ?`,
        [nome, email, telefone, foto, id]
    );

    return resultado.affectedRows;
};

// Guardar nova palavra-passe e invalidar qualquer link de recuperação
const atualizarSenha = async (id, senhaHash) => {
    const [resultado] = await db.execute(
        `UPDATE utilizador
         SET senha_hash = ?, reset_token_hash = NULL, reset_expira_em = NULL
         WHERE id = ?`,
        [senhaHash, id]
    );

    return resultado.affectedRows;
};

// Guardar o hash do token de recuperação e a validade
const guardarTokenReset = async (id, tokenHash, expiraEm) => {
    await db.execute(
        `UPDATE utilizador
         SET reset_token_hash = ?, reset_expira_em = ?
         WHERE id = ?`,
        [tokenHash, expiraEm, id]
    );
};

// Procurar utilizador ativo com um token de recuperação válido
const procurarPorTokenReset = async (tokenHash) => {
    const [rows] = await db.execute(
        `SELECT ${CAMPOS}
         FROM utilizador
         WHERE reset_token_hash = ?
           AND reset_expira_em > NOW()
           AND ativo = 1`,
        [tokenHash]
    );

    return rows[0];
};

// Listar utilizadores de um tipo, com pesquisa por nome, email ou telefone.
// Para clientes, inclui o resumo de multas e alugueres (tela "Gerir clientes").
const listar = async ({ tipo, pesquisa }) => {
    const filtros = ['u.tipo = ?'];
    const valores = [tipo];

    if (pesquisa) {
        filtros.push('(u.nome LIKE ? OR u.email LIKE ? OR u.telefone LIKE ?)');
        const termo = `%${pesquisa}%`;
        valores.push(termo, termo, termo);
    }

    const resumoCliente = tipo === 'cliente'
        ? `,
            (SELECT COUNT(*) FROM multa m
              INNER JOIN aluguer a ON m.aluguer_id = a.id
              INNER JOIN reserva r ON a.reserva_id = r.id
              WHERE r.cliente_id = u.id AND m.estado = 'pendente') AS multas_pendentes,
            (SELECT COALESCE(SUM(m.valor), 0) FROM multa m
              INNER JOIN aluguer a ON m.aluguer_id = a.id
              INNER JOIN reserva r ON a.reserva_id = r.id
              WHERE r.cliente_id = u.id AND m.estado = 'pendente') AS valor_multas_pendentes,
            (SELECT COUNT(*) FROM aluguer a
              INNER JOIN reserva r ON a.reserva_id = r.id
              WHERE r.cliente_id = u.id AND a.estado IN ('ativo', 'atrasado', 'devolvido')) AS total_alugueres`
        : '';

    const [rows] = await db.query(`
        SELECT ${CAMPOS.split(', ').map((c) => `u.${c}`).join(', ')}${resumoCliente}
        FROM utilizador u
        WHERE ${filtros.join(' AND ')}
        ORDER BY u.nome ASC
    `, valores);

    return rows;
};

// Ativar ou desativar uma conta
const alterarAtivo = async (id, ativo) => {
    const [resultado] = await db.execute(
        'UPDATE utilizador SET ativo = ? WHERE id = ?',
        [ativo ? 1 : 0, id]
    );

    return resultado.affectedRows;
};

module.exports = {
    procurarPorEmail,
    procurarPorId,
    procurarComSenha,
    criar,
    atualizarPerfil,
    atualizarSenha,
    guardarTokenReset,
    procurarPorTokenReset,
    listar,
    alterarAtivo
};
