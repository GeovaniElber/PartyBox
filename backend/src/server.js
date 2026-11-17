require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const db = require('./config/database');
const tempoReal = require('./socket');
const { pastaUploads } = require('../middlewares/criarUpload');

const utilizadorRoutes = require('../routes/utilizadorRoutes');
const temaRoutes = require('../routes/temaRoutes');
const reservaRoutes = require('../routes/reservaRoutes');
const aluguerRoutes = require('../routes/aluguerRoutes');
const inspecaoRoutes = require('../routes/inspecaoRoutes');
const multaRoutes = require('../routes/multaRoutes');
const listaEsperaRoutes = require('../routes/listaEsperaRoutes');
const painelRoutes = require('../routes/painelRoutes');

const multaController = require('../controllers/multaController');
const listaEspera = require('../services/listaEsperaService');

const app = express();

// Middlewares
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173'
}));

app.use(express.json());

// Disponibilizar fotografias (backend/uploads)
app.use('/uploads', express.static(pastaUploads));

// Rotas
app.use('/api/utilizadores', utilizadorRoutes);
app.use('/api/temas', temaRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/alugueres', aluguerRoutes);
app.use('/api/inspecoes', inspecaoRoutes);
app.use('/api/multas', multaRoutes);
app.use('/api/lista-espera', listaEsperaRoutes);
app.use('/api/painel', painelRoutes);

// Rota inicial
app.get('/', (req, res) => {
    res.json({
        message: 'API PartyBox está a funcionar!'
    });
});

// Verificar ligação à base de dados
app.get('/api/health', async (req, res) => {
    try {
        await db.query('SELECT 1');

        res.status(200).json({
            status: 'success',
            api: 'online',
            database: 'connected'
        });

    } catch (error) {
        console.error('Erro na ligação à BD:', error.message);

        res.status(500).json({
            status: 'error',
            api: 'online',
            database: 'disconnected'
        });
    }
});

// Rota inexistente
app.use((req, res) => {
    res.status(404).json({ mensagem: 'Rota não encontrada.' });
});

// Erros de upload e outros erros não tratados
app.use((erro, req, res, next) => {
    if (erro instanceof multer.MulterError) {
        const mensagens = {
            LIMIT_FILE_SIZE: 'Cada fotografia pode ter no máximo 2 MB.',
            LIMIT_FILE_COUNT: 'Enviaste demasiadas fotografias.',
            LIMIT_UNEXPECTED_FILE: 'Campo de ficheiro inesperado.'
        };

        return res.status(400).json({ mensagem: mensagens[erro.code] || 'Erro no envio do ficheiro.' });
    }

    if (erro.type === 'entity.parse.failed') {
        return res.status(400).json({ mensagem: 'O corpo do pedido não é JSON válido.' });
    }

    // Erros de validação dos uploads (formato de imagem inválido)
    if (erro.status === 400) {
        return res.status(400).json({ mensagem: erro.message });
    }

    console.error('Erro não tratado:', erro);

    return res.status(500).json({ mensagem: 'Erro interno do servidor.' });
});

// Tarefas automáticas
const executarTarefa = (nome, tarefa) => async () => {
    try {
        const total = await tarefa();

        if (total > 0) {
            console.log(`${nome}: ${total}`);
        }

    } catch (erro) {
        console.error(`Erro na tarefa "${nome}":`, erro);
    }
};

// Marca alugueres atrasados e aplica a multa 48h depois do prazo (a cada 15 minutos)
const verificarMultas = executarTarefa('Multas automáticas criadas', multaController.gerarMultasAutomaticas);

// Termina ofertas da lista de espera fora de prazo e passa as datas ao seguinte (a cada minuto)
const verificarListaEspera = executarTarefa('Ofertas da lista de espera expiradas', listaEspera.expirarOfertas);

// Iniciar servidor HTTP + tempo real (Socket.IO)
const PORT = process.env.PORT || 3000;
const servidor = http.createServer(app);

tempoReal.iniciar(servidor);

servidor.listen(PORT, () => {
    console.log(`PartyBox API disponível em http://localhost:${PORT}`);

    verificarMultas();
    verificarListaEspera();

    setInterval(verificarMultas, 15 * 60 * 1000);
    setInterval(verificarListaEspera, 60 * 1000);
});
