
const utilizadorModel = require('../models/utilizadorModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// REGISTAR CLIENTE
const registar = async (req, res) => {
    try {
        const { nome, email, senha, telefone } = req.body;

        // Validar campos obrigatórios
        if (!nome || !email || !senha) {
            return res.status(400).json({
                mensagem: 'Nome, email e senha são obrigatórios.'
            });
        }

        // Validar fotografia
        if (!req.file) {
            return res.status(400).json({
                mensagem: 'A fotografia é obrigatória.'
            });
        }

        // Validar tamanho da senha
        if (senha.length < 8) {
            return res.status(400).json({
                mensagem: 'A senha deve ter pelo menos 8 caracteres.'
            });
        }

        // Normalizar email
        const emailNormalizado = email.trim().toLowerCase();

        // Verificar email existente
        const utilizadorExistente =
            await utilizadorModel.procurarPorEmail(emailNormalizado);

        if (utilizadorExistente) {
            return res.status(409).json({
                mensagem: 'Este email já está registado.'
            });
        }

        // Gerar hash da senha
        const senhaHash = await bcrypt.hash(senha, 12);

        // Registar cliente
        const id = await utilizadorModel.criar({
            nome: nome.trim(),
            email: emailNormalizado,
            senha_hash: senhaHash,
            tipo: 'cliente',
            telefone: telefone || null,
            foto: req.file.filename
        });

        return res.status(201).json({
            mensagem: 'Cliente registado com sucesso!',
            utilizador: {
                id,
                nome: nome.trim(),
                email: emailNormalizado,
                tipo: 'cliente',
                telefone: telefone || null,
                foto: req.file.filename
            }
        });

    } catch (erro) {
        console.error('Erro no registo:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao registar utilizador.'
        });
    }
};


// LOGIN
const login = async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({
                mensagem: 'Email e senha são obrigatórios.'
            });
        }

        const emailNormalizado = email.trim().toLowerCase();

        // Procurar utilizador
        const utilizador =
            await utilizadorModel.procurarPorEmail(emailNormalizado);

        if (!utilizador) {
            return res.status(401).json({
                mensagem: 'Email ou senha incorretos.'
            });
        }

        // Verificar se a conta está ativa
        if (!utilizador.ativo) {
            return res.status(403).json({
                mensagem: 'Esta conta encontra-se inativa.'
            });
        }

        // Comparar senha com hash
        const senhaValida = await bcrypt.compare(
            senha,
            utilizador.senha_hash
        );

        if (!senhaValida) {
            return res.status(401).json({
                mensagem: 'Email ou senha incorretos.'
            });
        }

        // Verificar configuração JWT
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET não está configurado.');
        }

        // Gerar token
        const token = jwt.sign(
            {
                id: utilizador.id,
                tipo: utilizador.tipo
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '8h'
            }
        );

        return res.status(200).json({
            mensagem: 'Login efetuado com sucesso!',
            token,
            utilizador: {
                id: utilizador.id,
                nome: utilizador.nome,
                email: utilizador.email,
                tipo: utilizador.tipo,
                telefone: utilizador.telefone,
                foto: utilizador.foto
            }
        });

    } catch (erro) {
        console.error('Erro no login:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao efetuar login.'
        });
    }
};

const perfil = async (req, res) => {
    try {
        const utilizador = await utilizadorModel.procurarPorId(
            req.utilizador.id
        );

        if (!utilizador) {
            return res.status(404).json({
                mensagem: 'Utilizador não encontrado.'
            });
        }

        return res.status(200).json({
            mensagem: 'Perfil carregado com sucesso!',
            utilizador
        });

    } catch (erro) {
        console.error('Erro ao consultar perfil:', erro);

        return res.status(500).json({
            mensagem: 'Erro interno ao consultar perfil.'
        });
    }
};



module.exports = {
    registar,
    login,
    perfil
};

