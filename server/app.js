const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '.'))); // Serve arquivos estáticos da raiz do projeto

// Rota para servir o index.html na raiz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Diretório de dados
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Arquivos JSON
const usersFile = path.join(dataDir, 'users.json');
const requestsFile = path.join(dataDir, 'requests.json');
const techniciansFile = path.join(dataDir, 'technicians.json');
const chatHistoryFile = path.join(dataDir, 'chat_history.json');

// Funções auxiliares para manipulação de JSON
const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([]));
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.error(`Erro ao ler o arquivo ${filePath}:`, error.message);
    return [];
  }
};

const writeJsonFile = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Erro ao escrever no arquivo ${filePath}:`, error.message);
  }
};

// Inicializar arquivos JSON com dados padrão
const initializeData = () => {
  // Inicializar users.json
  if (!fs.existsSync(usersFile)) {
    const defaultAdmin = {
      id: 1,
      username: 'admin',
      email: 'admin@example.com',
      password: 'admin123',
      isAdmin: 1,
      createdAt: new Date().toISOString()
    };
    writeJsonFile(usersFile, [defaultAdmin]);
  }

  // Inicializar technicians.json
  if (!fs.existsSync(techniciansFile)) {
    const defaultTechnicians = [
      { id: 1, name: 'João Silva', email: 'joao@tecnico.com', phone: '+258123456789', availability: 1, specialty: 'Redes', createdAt: new Date().toISOString() },
      { id: 2, name: 'Maria Oliveira', email: 'maria@tecnico.com', phone: '+258987654321', availability: 1, specialty: 'Hardware', createdAt: new Date().toISOString() }
    ];
    writeJsonFile(techniciansFile, defaultTechnicians);
  }

  // Inicializar requests.json e chat_history.json
  if (!fs.existsSync(requestsFile)) {
    writeJsonFile(requestsFile, []);
  }
  if (!fs.existsSync(chatHistoryFile)) {
    writeJsonFile(chatHistoryFile, []);
  }

  console.log('Arquivos JSON inicializados em', new Date().toLocaleString('pt-BR', { timeZone: 'Africa/Lusaka' }));
};

// Inicializar os dados
initializeData();

// Rota de ping para verificar se o servidor está ativo
app.get('/api/ping', (req, res) => {
  res.json({ status: 'Servidor está ativo' });
});

// Rotas de autenticação
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Tentativa de login:', { username });
  const users = readJsonFile(usersFile);
  const user = users.find(u => u.username === username);
  if (user) {
    if (user.password === password) {
      console.log('Login bem-sucedido para:', username);
      res.json({ message: 'Login bem-sucedido', user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin === 1 } });
    } else {
      console.log('Senha incorreta para:', username);
      res.status(401).json({ message: 'Senha incorreta' });
    }
  } else {
    console.log('Usuário não encontrado:', username);
    res.status(401).json({ message: 'Usuário não encontrado' });
  }
});

app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  const users = readJsonFile(usersFile);
  if (users.some(u => u.username === username || u.email === email)) {
    return res.status(400).json({ message: 'Username ou e-mail já existe' });
  }
  const newUser = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    username,
    email,
    password,
    isAdmin: 0,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeJsonFile(usersFile, users);
  res.json({ message: 'Usuário cadastrado', user: { id: newUser.id, username, email, isAdmin: 0 } });
});

app.post('/api/auth/register-admin', (req, res) => {
  const { username, email, password } = req.body;
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const users = readJsonFile(usersFile);
  if (users.some(u => u.username === username || u.email === email)) {
    return res.status(400).json({ message: 'Username ou e-mail já existe' });
  }
  const newAdmin = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    username,
    email,
    password,
    isAdmin: 1,
    createdAt: new Date().toISOString()
  };
  users.push(newAdmin);
  writeJsonFile(usersFile, users);
  res.json({ message: 'Administrador cadastrado', user: { id: newAdmin.id, username, email, isAdmin: 1 } });
});

// Rotas de suporte
app.post('/api/support', (req, res) => {
  const { user, nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema } = req.body;
  if (!user || !user.id) return res.status(401).json({ message: 'Autenticação necessária' });
  const requests = readJsonFile(requestsFile);
  const id = uuidv4();
  const newRequest = {
    id,
    userId: user.id,
    nome,
    email,
    idade,
    sexo,
    bairro,
    numeroCasa,
    celular,
    produto,
    problema,
    status: 'pending',
    technicianId: null,
    scheduledVisit: null,
    createdAt: new Date().toISOString()
  };
  requests.push(newRequest);
  writeJsonFile(requestsFile, requests);
  io.emit('newRequest', newRequest); // Notificar o admin sobre nova solicitação
  res.json({ message: 'Solicitação recebida', requestId: id });
});

app.get('/api/requests', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const requests = readJsonFile(requestsFile);
  const users = readJsonFile(usersFile);
  const technicians = readJsonFile(techniciansFile);
  const enrichedRequests = requests
    .filter(r => r.status === 'pending' || r.status === 'needs_admin') // Mostrar solicitações pendentes e que precisam de ajuda
    .map(r => ({
      ...r,
      clientUsername: users.find(u => u.id === r.userId)?.username || 'Desconhecido',
      technicianName: technicians.find(t => t.id === r.technicianId)?.name || null
    }));
  console.log('Solicitações retornadas para o admin:', enrichedRequests);
  res.json(enrichedRequests);
});

app.post('/api/requests', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const requests = readJsonFile(requestsFile);
  const users = readJsonFile(usersFile);
  const technicians = readJsonFile(techniciansFile);
  const enrichedRequests = requests
    .filter(r => r.status === 'pending' || r.status === 'needs_admin')
    .map(r => ({
      ...r,
      clientUsername: users.find(u => u.id === r.userId)?.username || 'Desconhecido',
      technicianName: technicians.find(t => t.id === r.technicianId)?.name || null
    }));
  res.json(enrichedRequests);
});

app.get('/api/technicians', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const technicians = readJsonFile(techniciansFile);
  res.json(technicians);
});

app.post('/api/add-technician', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { name, email, phone, specialty } = req.body;
  const technicians = readJsonFile(techniciansFile);
  if (technicians.some(t => t.email === email)) {
    return res.status(400).json({ message: 'E-mail já existe' });
  }
  const newTechnician = {
    id: technicians.length ? Math.max(...technicians.map(t => t.id)) + 1 : 1,
    name,
    email,
    phone,
    specialty: specialty || 'Geral',
    availability: 1,
    createdAt: new Date().toISOString()
  };
  technicians.push(newTechnician);
  writeJsonFile(techniciansFile, technicians);
  res.json({ message: 'Técnico adicionado', id: newTechnician.id });
});

app.post('/api/assign-technician', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { requestId, technicianId, scheduledVisit } = req.body;
  const requests = readJsonFile(requestsFile);
  const technicians = readJsonFile(techniciansFile);
  const request = requests.find(r => r.id === requestId);
  if (!request) return res.status(404).json({ message: 'Solicitação não encontrada' });
  request.technicianId = technicianId;
  request.scheduledVisit = scheduledVisit || null;
  writeJsonFile(requestsFile, requests);
  const technician = technicians.find(t => t.id === technicianId);
  if (technician) {
    technician.availability = 0;
    writeJsonFile(techniciansFile, technicians);
  }
  res.json({ message: 'Técnico designado com sucesso' });
});

app.post('/api/respond-request', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { requestId, status, technicianId, scheduledVisit } = req.body;
  const requests = readJsonFile(requestsFile);
  const technicians = readJsonFile(techniciansFile);
  const request = requests.find(r => r.id === requestId);
  if (!request) return res.status(404).json({ message: 'Solicitação não encontrada' });
  request.status = status;
  request.technicianId = technicianId || null;
  request.scheduledVisit = scheduledVisit || null;
  writeJsonFile(requestsFile, requests);
  if (technicianId) {
    const technician = technicians.find(t => t.id === technicianId);
    if (technician) {
      technician.availability = 0;
      writeJsonFile(techniciansFile, technicians);
    }
  }
  res.json({ message: 'Solicitação respondida com sucesso' });
});

app.get('/api/chat-history/:requestId', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  const { requestId } = req.params;
  if (!user || (!user.isAdmin && user.id !== parseInt(req.params.userId))) return res.status(403).json({ message: 'Acesso restrito' });
  const chatHistory = readJsonFile(chatHistoryFile);
  const history = chatHistory
    .filter(ch => ch.requestId === requestId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json(history);
});

app.get('/api/users', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) {
    console.log('Acesso negado:', user);
    return res.status(403).json({ message: 'Acesso restrito a administradores' });
  }
  const users = readJsonFile(usersFile);
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, isAdmin: u.isAdmin })));
});

app.post('/api/users/update', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { id, username, email, password, isAdmin } = req.body;
  if (!id || !username || !email) return res.status(400).json({ message: 'ID, username e email são obrigatórios' });

  const users = readJsonFile(usersFile);
  const userIndex = users.findIndex(u => u.id === parseInt(id));
  if (userIndex === -1) return res.status(404).json({ message: 'Usuário não encontrado' });

  const existingUser = users[userIndex];
  const updatedUser = {
    ...existingUser,
    username,
    email,
    isAdmin: isAdmin === '1' ? 1 : 0,
    ...(password && { password })
  };

  users[userIndex] = updatedUser;
  writeJsonFile(usersFile, users);
  res.json({ message: 'Usuário atualizado com sucesso' });
});

app.post('/api/users/delete', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: 'ID é obrigatório' });

  const users = readJsonFile(usersFile);
  const initialLength = users.length;
  if (parseInt(id) === user.id) return res.status(400).json({ message: 'Você não pode excluir a si mesmo' });

  const filteredUsers = users.filter(u => u.id !== parseInt(id));
  if (filteredUsers.length === initialLength) return res.status(404).json({ message: 'Usuário não encontrado' });

  writeJsonFile(usersFile, filteredUsers);
  res.json({ message: 'Usuário excluído com sucesso' });
});

// WebSocket
io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id);

  socket.on('setUserId', (userId, callback) => {
    socket.userId = userId;
    socket.join(userId);
    console.log(`Usuário ${userId} conectado`);
    callback({ status: 'success', userId });
  });

  socket.on('message', (data) => {
    const { from, message, requestId, userId, username } = data;
    const chatHistory = readJsonFile(chatHistoryFile);
    const newMessage = {
      id: chatHistory.length ? Math.max(...chatHistory.map(ch => ch.id)) + 1 : 1,
      requestId,
      message,
      sender: from,
      timestamp: new Date().toISOString()
    };
    chatHistory.push(newMessage);
    writeJsonFile(chatHistoryFile, chatHistory);
    io.to(userId).emit('message', { from, message, requestId, userId, username, timestamp: newMessage.timestamp });

    if (from === 'user') {
      const lowercaseMessage = message.toLowerCase();
      let responseKey = 'default';
      if (lowercaseMessage.includes('olá') || lowercaseMessage.includes('oi')) responseKey = 'saudacao';
      else if (lowercaseMessage.includes('roteador')) responseKey = lowercaseMessage.includes('configurar') ? 'configurar roteador' : lowercaseMessage.includes('não conecta') ? 'roteador não conecta' : 'roteador';
      else if (lowercaseMessage.includes('computador')) responseKey = lowercaseMessage.includes('lento') ? 'computador lento' : 'computador';
      else if (lowercaseMessage.includes('impressora')) responseKey = lowercaseMessage.includes('não imprime') ? 'impressora não imprime' : 'impressora';

      const response = responses[responseKey];
      io.to(userId).emit('typing', { typing: true });

      setTimeout(() => {
        const botMessage = {
          id: chatHistory.length + 1,
          from: 'bot',
          message: response.reply,
          requestId,
          userId,
          username: 'Bot de Suporte',
          timestamp: new Date().toISOString()
        };
        chatHistory.push(botMessage);
        writeJsonFile(chatHistoryFile, chatHistory);
        io.to(userId).emit('privateMessage', botMessage);
        io.to(userId).emit('typing', { typing: false });
        io.to(userId).emit('suggestions', response.suggestions);
      }, 1000);
    }
  });

  socket.on('privateMessage', (data) => {
    const { from, message, userId, username, targetUserId, requestId } = data;
    const chatHistory = readJsonFile(chatHistoryFile);
    const newMessage = {
      id: chatHistory.length ? Math.max(...chatHistory.map(ch => ch.id)) + 1 : 1,
      requestId,
      message,
      sender: from,
      timestamp: new Date().toISOString()
    };
    chatHistory.push(newMessage);
    writeJsonFile(chatHistoryFile, chatHistory);

    // Enviar mensagem para o destinatário e o remetente
    const recipientId = from === 'admin' ? targetUserId : '1'; // '1' é o ID do admin
    io.to(recipientId).emit('privateMessage', { from, message, userId, username, targetUserId: recipientId, requestId, timestamp: newMessage.timestamp });
    if (socket.userId === userId) {
      socket.emit('privateMessage', { from, message, userId, username, targetUserId: recipientId, requestId, timestamp: newMessage.timestamp });
    }
  });

  socket.on('needHelp', (data) => {
    const { requestId, userId } = data;
    const requests = readJsonFile(requestsFile);
    const request = requests.find(r => r.id === requestId);
    if (request) {
      request.status = 'needs_admin';
      writeJsonFile(requestsFile, requests);
    }
    // Enviar notificação apenas para administradores
    const users = readJsonFile(usersFile);
    const adminIds = users.filter(u => u.isAdmin === 1).map(u => u.id.toString());
    adminIds.forEach(adminId => {
      io.to(adminId).emit('alertAdmin', { message: 'Um cliente precisa de ajuda!', requestId, userId, timestamp: new Date().toISOString() });
    });
  });

  socket.on('requestInfo', (data) => {
    const { requestId, userId, message } = data;
    io.to(userId).emit('privateMessage', {
      from: 'admin',
      message: `Solicitação de mais informações: ${message}`,
      requestId,
      userId,
      username: 'Admin',
      timestamp: new Date().toISOString()
    });
  });

  socket.on('scheduleVisit', (data) => {
    const { requestId, userId, dateTime } = data;
    const requests = readJsonFile(requestsFile);
    const request = requests.find(r => r.id === requestId);
    if (request) {
      request.scheduledVisit = dateTime;
      writeJsonFile(requestsFile, requests);
      io.to(userId).emit('privateMessage', {
        from: 'admin',
        message: `Visita agendada para ${new Date(dateTime).toLocaleString('pt-BR', { timeZone: 'Africa/Lusaka' })}`,
        requestId,
        userId,
        username: 'Admin',
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT} em`, new Date().toLocaleString('pt-BR', { timeZone: 'Africa/Lusaka' }));
});

const responses = {
  saudacao: { reply: 'Olá! Como posso ajudar você hoje?', suggestions: ['roteador', 'computador', 'impressora'] },
  roteador: { reply: 'Por favor, reinicie o roteador e verifique as conexões.', suggestions: ['configurar roteador', 'roteador não conecta'] },
  'configurar roteador': { reply: 'Entre em contato para configuração manual ou reinicie o dispositivo.', suggestions: ['roteador não conecta'] },
  'roteador não conecta': { reply: 'Verifique o cabo ou redefina as configurações de fábrica.', suggestions: ['configurar roteador'] },
  computador: { reply: 'Descreva o problema com o computador para mais ajuda.', suggestions: ['computador lento'] },
  'computador lento': { reply: 'Limpe o disco e feche programas desnecessários.', suggestions: ['computador'] },
  impressora: { reply: 'Verifique se há papel ou tinta, e reinicie a impressora.', suggestions: ['impressora não imprime'] },
  'impressora não imprime': { reply: 'Certifique-se de que o driver está atualizado.', suggestions: ['impressora'] },
  default: { reply: 'Desculpe, não entendi. Pode descrever o problema?', suggestions: ['roteador', 'computador', 'impressora'] }
};