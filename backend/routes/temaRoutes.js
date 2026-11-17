const express = require('express');
const router = express.Router();

const temaController = require('../controllers/temaController');
const { autenticar, autenticarOpcional, autorizar } = require('../middlewares/authMiddleware');
const uploadTema = require('../middlewares/temaUploadMiddleware');

// Consultar temas: público (visitantes veem os temas, sem disponibilidade)
router.get(
    '/',
    autenticarOpcional,
    temaController.listar
);

// Consultar um tema com a galeria: público
router.get(
    '/:id',
    autenticarOpcional,
    temaController.consultar
);

// Criar tema (apenas administrador). "imagem" = imagem principal
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

// Alterar estado: ativo, inativo ou manutencao (apenas administrador)
router.patch(
    '/:id/estado',
    autenticar,
    autorizar('administrador'),
    temaController.alterarEstado
);

// Galeria: acrescentar fotografias ("imagens", até 10)
router.post(
    '/:id/imagens',
    autenticar,
    autorizar('administrador'),
    uploadTema.array('imagens', 10),
    temaController.adicionarImagens
);

// Galeria: tornar uma fotografia a imagem principal
router.patch(
    '/:id/imagens/:imagemId/principal',
    autenticar,
    autorizar('administrador'),
    temaController.definirPrincipal
);

// Galeria: remover uma fotografia
router.delete(
    '/:id/imagens/:imagemId',
    autenticar,
    autorizar('administrador'),
    temaController.removerImagem
);

module.exports = router;
