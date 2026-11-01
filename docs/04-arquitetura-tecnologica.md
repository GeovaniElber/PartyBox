
# 04 — Arquitetura Tecnológica

## 4.1. Arquitetura Geral

O PartyBox seguirá uma arquitetura cliente-servidor, organizada em três componentes principais:

- **Frontend:** responsável pela interface e interação com os utilizadores.
- **Backend:** responsável pela lógica de negócio, autenticação e processamento dos pedidos.
- **Base de Dados:** responsável pelo armazenamento e gestão da informação.

## 4.2. Tecnologias

| Componente | Tecnologia |
|---|---|
| Frontend | React |
| Linguagem | JavaScript |
| Backend | Node.js |
| Base de Dados | MySQL |
| Comunicação | API REST |
| Versionamento | Git e GitHub |
| Editor | Visual Studio Code |

## 4.3. Comunicação entre Componentes

1. O utilizador interage com o frontend.
2. O frontend envia pedidos para o backend através da API REST.
3. O backend processa os pedidos e aplica as regras de negócio.
4. Quando necessário, o backend comunica com a base de dados MySQL.
5. O backend devolve uma resposta ao frontend.

## 4.4. Organização do Projeto

O projeto será organizado em duas áreas principais:

- **Frontend:** interface, páginas, componentes e comunicação com a API.
- **Backend:** rotas, controladores, serviços, autenticação e ligação à base de dados.

## 4.5. Segurança

- Autenticação de utilizadores.
- Controlo de acesso por perfil.
- Validação dos dados recebidos pela API.
- Proteção das credenciais e configurações através de variáveis de ambiente.

## 4.6. Estado
Arquitetura tecnológica definida inicialmente. A estrutura poderá ser ajustada durante o desenvolvimento.
