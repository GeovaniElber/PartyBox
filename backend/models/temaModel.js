const db = require('../src/config/database');

// Listar temas. Visitantes e clientes não veem os temas inativos.
const listarTodos = async ({ incluirInativos = true } = {}) => {
    const [temas] = await db.query(`
        SELECT *
        FROM tema
        ${incluirInativos ? '' : "WHERE estado <> 'inativo'"}
        ORDER BY nome ASC
    `);

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
    const { nome, categoria, descricao, pecas, preco, imagem } = dados;

    const [resultado] = await db.query(
        `INSERT INTO tema
        (nome, categoria, descricao, pecas, preco, imagem)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, categoria, descricao || null, pecas || null, preco, imagem || null]
    );

    return resultado.insertId;
};

// Atualizar tema
const atualizar = async (id, dados) => {
    const { nome, categoria, descricao, pecas, preco, imagem } = dados;

    const [resultado] = await db.query(
        `UPDATE tema
        SET nome = ?, categoria = ?, descricao = ?, pecas = ?, preco = ?, imagem = ?
        WHERE id = ?`,
        [nome, categoria, descricao || null, pecas || null, preco, imagem || null, id]
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

// ---------- Galeria ----------

// Fotografias da galeria de um tema (a imagem principal está em tema.imagem)
const listarImagens = async (temaId) => {
    const [imagens] = await db.query(`
        SELECT id, caminho, ordem
        FROM tema_imagem
        WHERE tema_id = ?
        ORDER BY ordem ASC, id ASC
    `, [temaId]);

    return imagens;
};

const procurarImagem = async (temaId, imagemId) => {
    const [imagens] = await db.query(
        'SELECT * FROM tema_imagem WHERE id = ? AND tema_id = ?',
        [imagemId, temaId]
    );

    return imagens[0];
};

// Acrescentar fotografias no fim da galeria
const adicionarImagens = async (temaId, caminhos) => {
    const [[{ ultima }]] = await db.query(
        'SELECT COALESCE(MAX(ordem), -1) AS ultima FROM tema_imagem WHERE tema_id = ?',
        [temaId]
    );

    const linhas = caminhos.map((caminho, i) => [temaId, caminho, Number(ultima) + 1 + i]);

    await db.query(
        'INSERT INTO tema_imagem (tema_id, caminho, ordem) VALUES ?',
        [linhas]
    );
};

const removerImagem = async (imagemId) => {
    const [resultado] = await db.query('DELETE FROM tema_imagem WHERE id = ?', [imagemId]);

    return resultado.affectedRows;
};

// Trocar a imagem principal com uma fotografia da galeria
const definirPrincipal = async (temaId, imagemId) => {
    const conexao = await db.getConnection();

    try {
        await conexao.beginTransaction();

        const [[tema]] = await conexao.query(
            'SELECT imagem FROM tema WHERE id = ? FOR UPDATE',
            [temaId]
        );

        const [[imagem]] = await conexao.query(
            'SELECT caminho FROM tema_imagem WHERE id = ? AND tema_id = ? FOR UPDATE',
            [imagemId, temaId]
        );

        if (!tema || !imagem) {
            await conexao.rollback();
            return false;
        }

        await conexao.query('UPDATE tema SET imagem = ? WHERE id = ?', [imagem.caminho, temaId]);

        if (tema.imagem) {
            // A antiga principal passa para o lugar da fotografia escolhida
            await conexao.query('UPDATE tema_imagem SET caminho = ? WHERE id = ?', [tema.imagem, imagemId]);
        } else {
            await conexao.query('DELETE FROM tema_imagem WHERE id = ?', [imagemId]);
        }

        await conexao.commit();
        return true;

    } catch (erro) {
        await conexao.rollback();
        throw erro;

    } finally {
        conexao.release();
    }
};

module.exports = {
    listarTodos,
    procurarPorId,
    criar,
    atualizar,
    alterarEstado,
    listarImagens,
    procurarImagem,
    adicionarImagens,
    removerImagem,
    definirPrincipal
};
