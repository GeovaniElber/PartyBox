
const express = require('express');
const router = express.Router();

const {
    autenticar,
    autorizar
} = require('../middlewares/authMiddleware');

const notificacaoController = require('../controllers/notificacaoController');

// Todas as rotas exigem autenticação
router.use(autenticar);

// Listar notificações do utilizador autenticado
router.get('/minhas', notificacaoController.minhasNotificacoes);

// Contar notificações não lidas
router.get('/nao-lidas', notificacaoController.contarNaoLidas);

// Criar notificação (funcionário/administrador)
router.post(
    '/',
    autorizar('funcionario', 'administrador'),
    notificacaoController.criar
);

// Marcar notificação como lida
router.patch('/:id/lida', notificacaoController.marcarComoLida);

// Consultar uma notificação
router.get('/:id', notificacaoController.consultar);

module.exports = router;
