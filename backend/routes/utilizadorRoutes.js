
const express = require('express');
const router = express.Router();

const utilizadorController = require('../controllers/utilizadorController');
const upload = require('../middlewares/uploadMiddleware');
const { autenticar, autorizar } = require('../middlewares/authMiddleware');

// Registo de cliente com fotografia obrigatória
router.post(
    '/registar',
    upload.single('foto'),
    utilizadorController.registar
);

// Login por email e senha
router.post(
    '/login',
    utilizadorController.login
);

router.get(
    '/perfil',
    autenticar,
    utilizadorController.perfil
);

router.get(
    '/administracao',
    autenticar,
    autorizar('administrador'),
    (req, res) => {
        res.status(200).json({
            mensagem: 'Acesso autorizado à área administrativa!',
            utilizador: req.utilizador
        });
    }
);

module.exports = router;
