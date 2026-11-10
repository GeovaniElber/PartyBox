const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Configuração do armazenamento
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads/clientes'));
    },

    filename: (req, file, cb) => {
        const extensao = path.extname(file.originalname).toLowerCase();
        const nomeUnico = crypto.randomUUID();

        cb(null, `${nomeUnico}${extensao}`);
    }
});

// Formatos permitidos
const tiposPermitidos = [
    'image/jpeg',
    'image/png',
    'image/webp'
];

// Validar formato da fotografia
const fileFilter = (req, file, cb) => {
    if (tiposPermitidos.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato inválido. Utilize JPG, PNG ou WEBP.'));
    }
};

// Configuração do Multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024
    }
});

module.exports = upload;
