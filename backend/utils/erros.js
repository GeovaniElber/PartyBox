// Erro de regra de negócio, com o código HTTP a devolver ao cliente.
class ErroNegocio extends Error {
    constructor(status, mensagem) {
        super(mensagem);
        this.status = status;
    }
}

// Responder a um erro: regras de negócio com a mensagem própria,
// erros inesperados com 500 e uma mensagem genérica.
const responderErro = (res, erro, mensagemPadrao) => {
    if (erro instanceof ErroNegocio) {
        return res.status(erro.status).json({ mensagem: erro.message });
    }

    console.error(mensagemPadrao, erro);

    return res.status(500).json({ mensagem: mensagemPadrao });
};

// Validar um ID numérico positivo
const idValido = (id) => Number.isInteger(Number(id)) && Number(id) > 0;

module.exports = {
    ErroNegocio,
    responderErro,
    idValido
};
