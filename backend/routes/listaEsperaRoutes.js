const express = require('express');
const router = express.Router();

const listaEsperaController = require('../controllers/listaEsperaController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Listar todos os pedidos (funcionários e administradores)
router.get(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    listaEsperaController.listar
);

// Consultar pedidos do próprio cliente (com o lugar na fila)
router.get(
    '/minhas',
    autenticar,
    autorizar('cliente'),
    listaEsperaController.minhasEntradas
);

// Lugar que o cliente teria na fila: ?tema_id=&data_inicio=&data_fim=
router.get(
    '/posicao',
    autenticar,
    autorizar('cliente'),
    listaEsperaController.consultarPosicao
);

// Consultar um pedido específico
router.get(
    '/:id',
    autenticar,
    listaEsperaController.consultar
);

// Entrar na lista de espera (cliente)
router.post(
    '/',
    autenticar,
    autorizar('cliente'),
    listaEsperaController.criar
);

// Confirmar a oferta quando chega a vez do cliente
router.post(
    '/:id/aceitar',
    autenticar,
    autorizar('cliente'),
    listaEsperaController.aceitar
);

// Recusar a oferta ou sair da fila (o cliente, ou a loja)
router.patch(
    '/:id/cancelar',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    listaEsperaController.cancelar
);

module.exports = router;
