
const express = require('express');
const router = express.Router();

const temaController = require('../controllers/temaController');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');
const uploadTema = require('../middlewares/temaUploadMiddleware');

// Consultar todos os temas
router.get(
    '/',
    autenticar,
    temaController.listar
);

// Consultar um tema específico
router.get(
    '/:id',
    autenticar,
    temaController.consultar
);

// Criar tema (apenas administrador)
router.post(
    '/',
    autenticar,
    autorizar('administrador'),
    uploadTema.single('imagem'),
    temaController.criar
);

// Atualizar tema (apenas administrador)
router.put(
    '/:id',
    autenticar,
    autorizar('administrador'),
    uploadTema.single('imagem'),
    temaController.atualizar
);

// Alterar estado (apenas administrador)
router.patch(
    '/:id/estado',
    autenticar,
    autorizar('administrador'),
    temaController.alterarEstado
);

module.exports = router;
