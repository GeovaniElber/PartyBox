
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const path = require('path');

const utilizadorRoutes = require('../routes/utilizadorRoutes');
const temaRoutes = require('../routes/temaRoutes');
const reservaRoutes = require('../routes/reservaRoutes');
const aluguerRoutes = require('../routes/aluguerRoutes');
const inspecaoRoutes = require('../routes/inspecaoRoutes');
const multaRoutes = require('../routes/multaRoutes');
const notificacaoRoutes = require('../routes/notificacaoRoutes');

const multaController = require('../controllers/multaController');

const app = express();

// Middlewares
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173'
}));

app.use(express.json());

// Disponibilizar fotografias
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Rotas
app.use('/api/utilizadores', utilizadorRoutes);
app.use('/api/temas', temaRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api/alugueres', aluguerRoutes);
app.use('/api/inspecoes', inspecaoRoutes);
app.use('/api/multas', multaRoutes);
app.use('/api/notificacoes', notificacaoRoutes);

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

// Verificação automática de multas
const executarVerificacaoMultas = async () => {
    try {
        const total = await multaController.gerarMultasAutomaticas();

        if (total > 0) {
            console.log(`${total} multa(s) automática(s) criada(s).`);
        }

    } catch (erro) {
        console.error('Erro na verificação automática de multas:', erro);
    }
};

// Iniciar servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`PartyBox API disponível em http://localhost:${PORT}`);

    // Executar verificação ao iniciar
    executarVerificacaoMultas();

    // Repetir a cada hora
    setInterval(executarVerificacaoMultas, 60 * 60 * 1000);
});
