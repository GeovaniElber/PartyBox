
const db = require('../src/config/database');

// Listar todos os temas
const listarTodos = async () => {
    const [temas] = await db.query(
        'SELECT * FROM tema ORDER BY id DESC'
    );

    return temas;
};

// Procurar tema por ID
const procurarPorId = async (id) => {
    const [temas] = await db.query(
        'SELECT * FROM tema WHERE id = ?',
        [id]
    );

    return temas[0];
};

// Criar tema
const criar = async (dados) => {
    const { nome, descricao, preco, imagem } = dados;

    const [resultado] = await db.query(
        `INSERT INTO tema
        (nome, descricao, preco, imagem)
        VALUES (?, ?, ?, ?)`,
        [nome, descricao, preco, imagem || null]
    );

    return resultado.insertId;
};

// Atualizar tema
const atualizar = async (id, dados) => {
    const { nome, descricao, preco, imagem } = dados;

    const [resultado] = await db.query(
        `UPDATE tema
        SET nome = ?, descricao = ?, preco = ?, imagem = ?
        WHERE id = ?`,
        [nome, descricao, preco, imagem || null, id]
    );

    return resultado.affectedRows;
};

// Alterar estado do tema
const alterarEstado = async (id, estado) => {
    const [resultado] = await db.query(
        'UPDATE tema SET estado = ? WHERE id = ?',
        [estado, id]
    );

    return resultado.affectedRows;
};

module.exports = {
    listarTodos,
    procurarPorId,
    criar,
    atualizar,
    alterarEstado
};
