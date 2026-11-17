// Tempo real (Socket.IO).
//
// O frontend liga-se com:  io(API_URL, { auth: { token } })
// O token é opcional: sem token (visitante) só recebe eventos públicos.
//
// Salas:
//   utilizador:<id>  -> avisos da própria conta (reservas, lista de espera, multas)
//   equipa           -> funcionários e administradores (painéis e listas da loja)
//
// Eventos emitidos (o frontend volta a pedir os dados à API quando os recebe):
//   disponibilidade:alterada  { tema_id }   todos   -> catálogo e calendário do tema
//   temas:alterados           {}            todos   -> catálogo
//   loja:alterada             { area }      equipa  -> painéis, reservas, alugueres, multas
//   conta:alterada            { area }      cliente -> área do cliente

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io = null;

const iniciar = (servidorHttp) => {
    io = new Server(servidorHttp, {
        cors: {
            origin: process.env.CLIENT_URL || 'http://localhost:5173'
        }
    });

    // Identificar o utilizador pelo token (se existir)
    io.use((socket, next) => {
        const token = socket.handshake.auth && socket.handshake.auth.token;

        if (!token) {
            socket.data.utilizador = null;
            return next();
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.data.utilizador = { id: decoded.id, tipo: decoded.tipo };
            next();
        } catch {
            next(new Error('Token inválido ou expirado.'));
        }
    });

    io.on('connection', (socket) => {
        const utilizador = socket.data.utilizador;

        if (!utilizador) return;

        socket.join(`utilizador:${utilizador.id}`);

        if (['funcionario', 'administrador'].includes(utilizador.tipo)) {
            socket.join('equipa');
        }
    });

    return io;
};

// Avisar quem precisa de atualizar o ecrã depois de uma alteração.
//   area      -> 'reservas', 'alugueres', 'multas', 'lista_espera', 'temas', 'utilizadores'
//   temaId    -> a disponibilidade deste tema mudou
//   clienteId -> a área deste cliente mudou
const avisarAlteracao = ({ area, temaId, clienteId } = {}) => {
    if (!io) return;

    if (temaId) {
        io.emit('disponibilidade:alterada', { tema_id: Number(temaId) });
    }

    if (area === 'temas') {
        io.emit('temas:alterados', {});
    }

    io.to('equipa').emit('loja:alterada', { area });

    if (clienteId) {
        io.to(`utilizador:${clienteId}`).emit('conta:alterada', { area });
    }
};

module.exports = {
    iniciar,
    avisarAlteracao
};
