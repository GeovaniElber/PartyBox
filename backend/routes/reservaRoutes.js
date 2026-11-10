
const express = require('express');
const router = express.Router();

const reservaController = require('../controllers/reservaController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Listar todas as reservas (funcionários e administradores)
router.get(
    '/',
    autenticar,
    autorizar('funcionario', 'administrador'),
    reservaController.listar
);

// Consultar reservas do próprio cliente
router.get(
    '/minhas',
    autenticar,
    autorizar('cliente'),
    reservaController.minhasReservas
);

// Consultar uma reserva específica
router.get(
    '/:id',
    autenticar,
    reservaController.consultar
);


// Criar reserva (cliente, funcionário ou administrador)
router.post(
    '/',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    reservaController.criar
);


// Confirmar ou cancelar reserva (funcionários e administradores)
router.patch(
    '/:id/estado',
    autenticar,
    autorizar('funcionario', 'administrador'),
    reservaController.atualizarEstado
);

module.exports = router;
