const express = require('express');
const router = express.Router();

const inspecaoController = require('../controllers/inspecaoController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Consultar todas as inspeções (funcionário e administrador)
router.get(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    inspecaoController.listar
);

// Consultar inspeções de um aluguer específico
router.get(
    '/aluguer/:aluguer_id',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    inspecaoController.listarPorAluguer
);

module.exports = router;