
const db = require('../src/config/database');

// Procurar utilizador pelo email
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
        `SELECT id, nome, email, tipo, telefone, foto, ativo
         FROM utilizador
         WHERE id = ?`,
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
        [nome, email, senha_hash, tipo, telefone, foto]
    );

    return resultado.insertId;
};

module.exports = {
    procurarPorEmail,
    procurarPorId,
    criar
};
