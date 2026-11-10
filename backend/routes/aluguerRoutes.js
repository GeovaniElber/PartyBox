
const express = require('express');
const router = express.Router();

const aluguerController = require('../controllers/aluguerController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Listar todos os alugueres (funcionários e administradores)
router.get(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.listar
);

// Consultar alugueres ativos (funcionários e administradores)
router.get(
    '/ativos',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.listarAtivos
);

// Consultar alugueres do próprio cliente
router.get(
    '/meus',
    autenticar,
    autorizar('cliente'),
    aluguerController.meusAlugueres
);

// Registar inspeção de entrega
router.patch(
    '/:id/inspecao-entrega',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.registarInspecaoEntrega
);
// Consultar um aluguer específico
router.get(
    '/:id',
    autenticar,
    aluguerController.consultar
);

// Iniciar aluguer (funcionários e administradores)
router.post(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.criar
);

// Registar devolução (funcionários e administradores)
router.patch(
    '/:id/devolucao',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.registarDevolucao
);

module.exports = router;
