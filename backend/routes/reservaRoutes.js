const express = require('express');
const router = express.Router();

const reservaController = require('../controllers/reservaController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Listar reservas (?estado=pendente para a tela "Confirmar reservas")
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

// Consultar disponibilidade de um tema por período
router.get(
    '/disponibilidade',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    reservaController.consultarDisponibilidade
);

// Disponibilidade de todos os temas num dia: ?data=AAAA-MM-DD
router.get(
    '/disponibilidade-dia',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    reservaController.disponibilidadeDoDia
);

// Dias ocupados de um tema num mês: ?tema_id=&mes=AAAA-MM
router.get(
    '/ocupacao',
    autenticar,
    autorizar('cliente', 'funcionario', 'administrador'),
    reservaController.consultarOcupacao
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

// Confirmar, recusar ou cancelar reserva (funcionários e administradores)
router.patch(
    '/:id/estado',
    autenticar,
    autorizar('funcionario', 'administrador'),
    reservaController.atualizarEstado
);

// O cliente cancela a própria reserva
router.patch(
    '/:id/cancelar',
    autenticar,
    autorizar('cliente'),
    reservaController.cancelarMinha
);

module.exports = router;
