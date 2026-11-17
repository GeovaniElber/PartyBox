const express = require('express');
const router = express.Router();

const utilizadorController = require('../controllers/utilizadorController');
const upload = require('../middlewares/uploadMiddleware');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// ---------- Público ----------

// Registo de cliente (todos os campos obrigatórios, incluindo a fotografia)
router.post(
    '/registar',
    upload.single('foto'),
    utilizadorController.registar
);

// Login por email e palavra-passe (clientes, atendedores e administração)
router.post(
    '/login',
    utilizadorController.login
);

// Recuperar palavra-passe: envia um link por email { email }
router.post(
    '/recuperar-senha',
    utilizadorController.pedirRecuperacao
);

// Definir palavra-passe nova com o token do link { token, senha }
router.post(
    '/redefinir-senha',
    utilizadorController.redefinirSenha
);

// ---------- Conta do utilizador autenticado ----------

// Consultar dados
router.get(
    '/perfil',
    autenticar,
    utilizadorController.perfil
);

// Alterar dados (multipart: nome, email, telefone, foto opcional)
router.put(
    '/perfil',
    autenticar,
    upload.single('foto'),
    utilizadorController.atualizarPerfil
);

// Alterar palavra-passe { senha_atual, senha_nova }
router.patch(
    '/perfil/senha',
    autenticar,
    utilizadorController.alterarSenha
);

// Descarregar os meus dados (JSON)
router.get(
    '/perfil/exportar',
    autenticar,
    utilizadorController.exportarDados
);

// ---------- Gestão ----------

// Listar clientes ou atendedores: ?tipo=cliente|funcionario&pesquisa=
router.get(
    '/',
    autenticar,
    autorizar('administrador'),
    utilizadorController.listar
);

// Criar cliente ao balcão (multipart: nome, email, telefone, foto)
router.post(
    '/clientes',
    autenticar,
    autorizar('funcionario', 'administrador'),
    upload.single('foto'),
    utilizadorController.criarCliente
);

// Criar atendedor (apenas administrador) { nome, email, telefone }
router.post(
    '/funcionarios',
    autenticar,
    autorizar('administrador'),
    utilizadorController.criarFuncionario
);

// Consultar um utilizador com o histórico
router.get(
    '/:id',
    autenticar,
    autorizar('administrador'),
    utilizadorController.consultar
);

// Ativar ou desativar conta { ativo: true|false }
router.patch(
    '/:id/ativo',
    autenticar,
    autorizar('administrador'),
    utilizadorController.alterarAtivo
);

module.exports = router;
