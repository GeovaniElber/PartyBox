const express = require('express');
const router = express.Router();

const aluguerController = require('../controllers/aluguerController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');
const uploadInspecao = require('../middlewares/inspecaoUploadMiddleware');

// Listar todos os alugueres (funcionários e administradores)
router.get(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.listar
);

// Alugueres por devolver: ativos e atrasados (tela "Registar devolução")
router.get(
    '/ativos',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.listarAtivos
);

// Levantamentos de hoje (tela "Registar aluguer")
router.get(
    '/levantamentos-hoje',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.levantamentosHoje
);

// Consultar alugueres do próprio cliente
router.get(
    '/meus',
    autenticar,
    autorizar('cliente'),
    aluguerController.meusAlugueres
);

// Consultar um aluguer específico
router.get(
    '/:id',
    autenticar,
    aluguerController.consultar
);

// Iniciar aluguer a partir de uma reserva confirmada (verifica multas)
router.post(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    aluguerController.criar
);

// Inspeção antes da festa + pagamento (multipart, fotos até 6)
router.patch(
    '/:id/inspecao-entrega',
    autenticar,
    autorizar('funcionario', 'administrador'),
    uploadInspecao.array('fotos', 6),
    aluguerController.registarInspecaoEntrega
);

// Devolução + inspeção depois da festa (multipart, fotos até 6)
router.patch(
    '/:id/devolucao',
    autenticar,
    autorizar('funcionario', 'administrador'),
    uploadInspecao.array('fotos', 6),
    aluguerController.registarDevolucao
);

module.exports = router;
