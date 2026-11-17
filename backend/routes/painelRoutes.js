const express = require('express');
const router = express.Router();

const painelController = require('../controllers/painelController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Painel de controlo: faturação, temas alugados, clientes multados (administrador)
router.get(
    '/administrador',
    autenticar,
    autorizar('administrador'),
    painelController.painelAdministrador
);

// Painel da loja: contadores, devoluções de hoje e multas por pagar
// (levantamentos de hoje: GET /api/alugueres/levantamentos-hoje)
router.get(
    '/loja',
    autenticar,
    autorizar('funcionario', 'administrador'),
    painelController.painelLoja
);

module.exports = router;
