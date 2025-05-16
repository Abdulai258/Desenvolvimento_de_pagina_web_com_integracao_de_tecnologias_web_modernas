Suporte Técnico - Sistema de Atendimento
Bem-vindo ao Suporte Técnico, um sistema web de atendimento ao cliente com chat em tempo real, gerenciador de solicitações e painel de administração. Este projeto utiliza Node.js, Express, Socket.IO e SQLite para fornecer uma solução completa de suporte técnico.
Visão Geral
O sistema permite que clientes enviem solicitações de suporte, interajam com um bot inteligente via chat em tempo real e escalonem problemas para administradores. O painel de administração oferece ferramentas para gerenciar solicitações, visualizar dados de clientes, histórico de chats e designar técnicos para visitas.

Data de Criação: 14/05/2025
Tecnologias: Node.js, Express, Socket.IO, SQLite, Bootstrap, HTML, CSS, JavaScript
Funcionalidades Principais:
Registro e login de usuários e administradores.
Chat em tempo real com bot inteligente.
Escalonamento de problemas para administradores.
Gerenciamento de solicitações pendentes.
Designação de técnicos e agendamento de visitas.



/Desenvolvimento_de_pagina_web_com_integracao_de_tecnologias_web_modernas
├── public/
│   ├── index.html      # Página inicial com formulário de suporte
│   ├── chat.html       # Interface de chat do cliente
│   ├── admin.html      # Painel do administrador
│   ├── login.html      # Página de login
│   └── register.html   # Página de cadastro
│── server/
│   ├── app.js          # Lógica do servidor e banco de dados
│   └── data. 
├── package.json
├──  routers.js
└── node_modules/       # Dependências instaladas (gerada por npm)

Pré-requisitos

Node.js: v18 ou superior (recomendado v20 LTS)
npm: Vem com o Node.js
Sistema Operacional: Windows, macOS ou Linux

Instalação

Clone o repositório (ou copie os arquivos manualmente):
git clone https://github.com/seu-usuario/projeto-pagina-web.git
cd projeto-pagina-web


Instale as dependências:
npm install

Certifique-se de que as dependências express, socket.io, sqlite3 e uuid sejam instaladas.

Verifique a estrutura:

O arquivo app.js deve estar em server/.
Os arquivos HTML devem estar em public/.



Configuração

Inicie o servidor:
npm start

O servidor será iniciado na porta 3000 (acessível em http://localhost:3000).

Criação do Banco de Dados:

Ao iniciar o servidor, o arquivo database.db será criado automaticamente na pasta server/ com as tabelas necessárias (users, requests, technicians, chat_history).
Um administrador padrão (admin/admin123) e dois técnicos padrão (João Silva, Maria Oliveira) são inseridos.



Uso
Como Cliente

Acesse o site:

Abra http://localhost:3000 no navegador.


Cadastre-se ou Faça Login:

Use register.html para criar uma conta.
Faça login em login.html com as credenciais cadastradas.


Envie uma Solicitação:

Na página inicial (index.html), preencha o formulário com seus dados e o problema.
Após enviar, você será redirecionado para o chat.html para interagir com o bot.


Use o Chat:

Digite mensagens (ex.: "roteador não conecta") e receba respostas automáticas.
Clique em sugestões para enviar mensagens predefinidas.
Use "Ainda preciso de ajuda" para escalonar ao administrador.



Como Administrador

Faça Login:

Use admin/admin123 em login.html para acessar o painel.


Gerencie Solicitações:

Em admin.html, visualize a lista de solicitações pendentes.
Clique em "Visualizar" para ver detalhes, histórico de chat e opções de ação.


Comunique-se com o Cliente:

Envie mensagens no chat em tempo real.
Solicite mais informações com o botão correspondente.
Agende visitas definindo uma data/hora.


Designar Técnico:

Selecione um técnico disponível na lista.
Atribua a solicitação e (opcionalmente) agende uma visita.
O sistema registra a designação e atualiza a disponibilidade do técnico.



Funcionalidades Detalhadas

Bot Inteligente: Responde a palavras-chave (ex.: "roteador", "computador") com sugestões clicáveis.
Tempo Real: Comunicação via WebSocket com indicador "Bot está digitando...".
Persistência: Histórico salvo no SQLite.
Painel de Administração: Lista solicitações, dados de clientes, chat e designação de técnicos.

Contribuição

Fork o repositório.
Crie uma branch para sua feature: git checkout -b feature/nova-funcionalidade.
Commit suas mudanças: git commit -m "Adiciona nova funcionalidade".
Envie para o repositório: git push origin feature/nova-funcionalidade.
Abra um Pull Request.

Licença
Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes (caso aplicável, adicione um arquivo LICENSE com a licença escolhida).
Contato

E-mail: kennysaide2003@gmail.com
Telefone: +258 852992717
Data: 14/05/2025, 22:46 CAT

Agradecemos por usar o Suporte Técnico! 🚀
