
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const pastaTemas = path.join(__dirname, '../uploads/temas');

// Criar a pasta automaticamente, caso não exista
fs.mkdirSync(pastaTemas, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, pastaTemas);
    },

    filename: (req, file, cb) => {
        const extensao = path.extname(file.originalname).toLowerCase();
        const nomeUnico = crypto.randomUUID();

        cb(null, `${nomeUnico}${extensao}`);
    }
});

const tiposPermitidos = [
    'image/jpeg',
    'image/png',
    'image/webp'
];

const fileFilter = (req, file, cb) => {
    if (tiposPermitidos.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato inválido. Utilize JPG, PNG ou WEBP.'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024
    }
});

module.exports = upload;
