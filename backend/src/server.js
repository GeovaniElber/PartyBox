
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./config/database');

const app = express();

// Middlewares
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173'
}));

app.use(express.json());

// Rota inicial
app.get('/', (req, res) => {
    res.json({
        message: 'API PartyBox está a funcionar!'
    });
});

// Testar ligação à base de dados
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

// Iniciar servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`PartyBox API disponível em http://localhost:${PORT}`);
});
