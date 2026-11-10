
const express = require('express');
const router = express.Router();

const multaController = require('../controllers/multaController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Listar todas as multas
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

// Atualizar estado da multa
router.patch(
    '/:id/estado',
    autenticar,
    autorizar('funcionario', 'administrador'),
    multaController.atualizarEstado
);

module.exports = router;
