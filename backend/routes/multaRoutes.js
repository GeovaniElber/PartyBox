const express = require('express');
const router = express.Router();

const multaController = require('../controllers/multaController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Listar multas (?estado=pendente para as por pagar)
router.get(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    multaController.listar
);

// Consultar multas do próprio cliente
router.get(
    '/minhas',
    autenticar,
    autorizar('cliente'),
    multaController.minhasMultas
);

// Consultar uma multa específica
router.get(
    '/:id',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    multaController.consultar
);

// Registar pagamento de multa { forma_pagamento }
router.patch(
    '/:id/pagamento',
    autenticar,
    autorizar('funcionario', 'administrador'),
    multaController.registarPagamento
);

// Anular multa (apenas administrador)
router.patch(
    '/:id/anular',
    autenticar,
    autorizar('administrador'),
    multaController.anular
);

module.exports = router;
