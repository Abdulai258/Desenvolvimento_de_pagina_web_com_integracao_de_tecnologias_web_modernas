const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Diretório de dados
const dataDir = path.join(__dirname, 'data');
const usersFile = path.join(dataDir, 'users.json');
const requestsFile = path.join(dataDir, 'requests.json');
const techniciansFile = path.join(dataDir, 'technicians.json');
const chatHistoryFile = path.join(dataDir, 'chat_history.json');

// Funções auxiliares para manipulação de JSON
const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify([]));
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const writeJsonFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Middleware para verificar autenticação
const requireAuth = (req, res, next) => {
  const user = req.body.user || JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.id) {
    return res.status(401).json({ message: 'Autenticação necessária' });
  }
  req.user = user;
  next();
};

// Middleware para verificar administrador
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ message: 'Acesso restrito a administradores' });
  }
  next();
};

// Middleware para impedir administradores
const restrictAdmin = (req, res, next) => {
  if (req.user.isAdmin) {
    return res.status(403).json({ message: 'Administradores não podem acessar esta funcionalidade' });
  }
  next();
};

// Middleware para superadmin (apenas admin com ID 1)
const requireSuperAdmin = (req, res, next) => {
  if (req.user.id !== 1) {
    return res.status(403).json({ message: 'Acesso restrito ao superadministrador' });
  }
  next();
};

// Rota para login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Tentativa de login no servidor:', { username, password });
  const users = readJsonFile(usersFile);
  const user = users.find(u => u.username === username);
  console.log('Usuário encontrado:', user);
  if (user && user.password === password) {
    res.json({ message: 'Login bem-sucedido', user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin === 1 }, redirect: user.isAdmin ? '/admin.html' : '/index.html' });
  } else {
    res.status(401).json({ message: 'Credenciais inválidas' });
  }
});

// Rota para cadastro
router.post('/auth/register', (req, res) => {
  const { username, email, password, isAdmin = 0 } = req.body;
  const users = readJsonFile(usersFile);
  if (users.some(u => u.username === username || u.email === email)) {
    console.error('Username ou e-mail já existe');
    return res.status(500).json({ message: 'Username ou e-mail já existe' });
  }
  const newUser = {
    id: users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    username,
    email,
    password,
    isAdmin,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeJsonFile(usersFile, users);
  res.json({ message: 'Usuário cadastrado', user: { id: newUser.id, username, email, isAdmin } });
});

// Rota para recuperação de senha
router.post('/auth/reset-password', (req, res) => {
  const { email } = req.body;
  const users = readJsonFile(usersFile);
  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(404).json({ message: 'E-mail não encontrado' });
  }
  const token = Math.random().toString(36).substring(2);
  console.log(`Token de recuperação para ${email}: ${token}`);
  res.json({ message: 'Link de recuperação enviado' });
});

// Rota para atualizar perfil
router.put('/api/profile', requireAuth, (req, res) => {
  const { username, email, password } = req.body;
  const userId = req.user.id;
  let users = readJsonFile(usersFile);
  const existingUser = users.find(u => (u.username === username || u.email === email) && u.id !== userId);
  if (existingUser) {
    return res.status(400).json({ message: 'Username ou e-mail já está em uso' });
  }
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  user.username = username;
  user.email = email;
  if (password) user.password = password;
  writeJsonFile(usersFile, users);
  res.json({ message: 'Perfil atualizado' });
});

// Rota para enviar solicitação de suporte
router.post('/support', requireAuth, restrictAdmin, (req, res) => {
  const { nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema } = req.body;
  const id = Date.now().toString();
  const requests = readJsonFile(requestsFile);
  const newRequest = {
    id,
    userId: req.user.id,
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
    createdAt: new Date().toISOString()
  };
  requests.push(newRequest);
  writeJsonFile(requestsFile, requests);
  res.json({ message: 'Solicitação recebida', requestId: id });
});

// Rota para listar solicitações
router.post('/requests', requireAuth, requireAdmin, (req, res) => {
  const requests = readJsonFile(requestsFile);
  res.json(requests);
});

// Rota para solicitações por usuário
router.get('/requests', requireAuth, (req, res) => {
  const userId = parseInt(req.query.userId) || req.user.id;
  const requests = readJsonFile(requestsFile);
  const userRequests = requests.filter(r => r.userId === userId);
  res.json(userRequests);
});

// Rota para responder solicitação
router.post('/respond-request', requireAuth, requireAdmin, (req, res) => {
  const { requestId, message, technicianId } = req.body;
  const status = technicianId ? 'assigned' : 'responded';
  const requests = readJsonFile(requestsFile);
  const technicians = readJsonFile(techniciansFile);
  const request = requests.find(r => r.id === requestId);
  if (!request) return res.status(404).json({ message: 'Solicitação não encontrada' });
  request.status = status;
  request.technicianId = technicianId || null;
  request.response = message;
  request.respondedAt = new Date().toISOString();
  writeJsonFile(requestsFile, requests);
  if (technicianId) {
    const technician = technicians.find(t => t.id === technicianId);
    if (technician) {
      technician.available = 0;
      writeJsonFile(techniciansFile, technicians);
    }
  }
  res.json({ message: 'Resposta enviada' });
});

// Rota para atualizar status da visita do técnico
router.post('/technician-status', requireAuth, requireAdmin, (req, res) => {
  const { requestId, technicianStatus, technicianId } = req.body;
  const requests = readJsonFile(requestsFile);
  const technicians = readJsonFile(techniciansFile);
  const request = requests.find(r => r.id === requestId);
  if (!request) return res.status(404).json({ message: 'Solicitação não encontrada' });
  request.technicianStatus = technicianStatus;
  request.status = 'completed';
  writeJsonFile(requestsFile, requests);
  if (technicianStatus === 'Resolvido') {
    const technician = technicians.find(t => t.id === technicianId);
    if (technician) {
      technician.available = 1;
      writeJsonFile(techniciansFile, technicians);
    }
  }
  res.json({ message: 'Status da visita atualizado' });
});

// Rota para gerar relatórios de solicitações
router.get('/reports', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate, status } = req.query;
  let requests = readJsonFile(requestsFile);
  if (startDate) {
    requests = requests.filter(r => new Date(r.createdAt) >= new Date(startDate));
  }
  if (endDate) {
    requests = requests.filter(r => new Date(r.createdAt) <= new Date(endDate));
  }
  if (status) {
    requests = requests.filter(r => r.status === status);
  }
  res.json(requests);
});

// Rota para limpar histórico de chat
router.delete('/chat-history', requireAuth, requireAdmin, (req, res) => {
  writeJsonFile(chatHistoryFile, []);
  res.json({ message: 'Histórico de chat limpo' });
});

// Rota para listar usuários
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = readJsonFile(usersFile);
  res.json(users.map(u => ({ id: u.id, username: u.username, email: u.email, password: u.password, createdAt: u.createdAt })));
});

// Rota para adicionar usuário
router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, email, password } = req.body;
  const users = readJsonFile(usersFile);
  if (users.some(u => u.username === username || u.email === email)) {
    return res.status(500).json({ message: 'Username ou e-mail já existe' });
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
  res.json({ message: 'Usuário adicionado' });
});

// Rota para remover usuário
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  let users = readJsonFile(usersFile);
  const user = users.find(u => u.id === parseInt(id));
  if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
  if (user.isAdmin) return res.status(403).json({ message: 'Não é possível remover administradores' });
  users = users.filter(u => u.id !== parseInt(id));
  writeJsonFile(usersFile, users);
  res.json({ message: 'Usuário removido' });
});

// Rota para obter histórico de chat
router.get('/chat-history', requireAuth, requireAdmin, (req, res) => {
  const chatHistory = readJsonFile(chatHistoryFile);
  res.json(chatHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
});

// Rota para obter histórico de chat por solicitação
router.get('/chat-history/:requestId', requireAuth, requireAdmin, (req, res) => {
  const { requestId } = req.params;
  const chatHistory = readJsonFile(chatHistoryFile);
  const history = chatHistory.filter(ch => ch.requestId === requestId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json(history);
});

// Rota para listar técnicos
router.get('/technicians', requireAuth, requireAdmin, (req, res) => {
  const technicians = readJsonFile(techniciansFile);
  res.json(technicians);
});

// Rota para adicionar técnico
router.post('/technicians', requireAuth, requireAdmin, (req, res) => {
  const { name, contact, specialty } = req.body;
  const technicians = readJsonFile(techniciansFile);
  const newTechnician = {
    id: technicians.length ? Math.max(...technicians.map(t => t.id)) + 1 : 1,
    name,
    contact,
    specialty,
    available: 1,
    createdAt: new Date().toISOString()
  };
  technicians.push(newTechnician);
  writeJsonFile(techniciansFile, technicians);
  res.json({ message: 'Técnico adicionado' });
});

// Rota para remover técnico
router.delete('/technicians/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  let technicians = readJsonFile(techniciansFile);
  technicians = technicians.filter(t => t.id !== parseInt(id));
  writeJsonFile(techniciansFile, technicians);
  res.json({ message: 'Técnico removido' });
});

module.exports = router;