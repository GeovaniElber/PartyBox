const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const pastaUploads = path.join(__dirname, '../uploads');

const tiposPermitidos = [
    'image/jpeg',
    'image/png',
    'image/webp'
];

// Criar um middleware de upload de imagens para uma subpasta de uploads/
// (clientes, temas, inspecoes). A pasta é criada se não existir.
const criarUpload = (subpasta) => {
    const destino = path.join(pastaUploads, subpasta);
    fs.mkdirSync(destino, { recursive: true });

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, destino),

        filename: (req, file, cb) => {
            const extensao = path.extname(file.originalname).toLowerCase();
            cb(null, `${crypto.randomUUID()}${extensao}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        if (tiposPermitidos.includes(file.mimetype)) {
            cb(null, true);
        } else {
            const erro = new Error('Formato inválido. Utilize JPG, PNG ou WEBP.');
            erro.status = 400;
            cb(erro);
        }
    };

    return multer({
        storage,
        fileFilter,
        limits: { fileSize: 2 * 1024 * 1024 }
    });
};

// Apagar um ficheiro enviado (por exemplo, quando a validação falha).
// Nunca lança erro.
const removerFicheiro = (subpasta, nome) => {
    if (!nome) return;

    const caminho = path.join(pastaUploads, subpasta, path.basename(nome));

    fs.unlink(caminho, () => {});
};

// Apagar todos os ficheiros de um pedido (req.file e req.files)
const removerFicheirosDoPedido = (req) => {
    const ficheiros = [
        ...(req.file ? [req.file] : []),
        ...(Array.isArray(req.files) ? req.files : [])
    ];

    for (const f of ficheiros) {
        fs.unlink(f.path, () => {});
    }
};

module.exports = {
    criarUpload,
    removerFicheiro,
    removerFicheirosDoPedido,
    pastaUploads
};
