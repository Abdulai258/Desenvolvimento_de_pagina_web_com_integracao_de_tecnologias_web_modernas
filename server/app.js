const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Banco de dados SQLite
const db = new sqlite3.Database('./server/database.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite em', new Date().toLocaleString('pt-BR', { timeZone: 'Africa/Lusaka' }));
  }
});

// Criar tabelas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      isAdmin INTEGER DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      userId INTEGER,
      nome TEXT NOT NULL,
      email TEXT NOT NULL,
      idade INTEGER,
      sexo TEXT,
      bairro TEXT,
      numeroCasa TEXT,
      celular TEXT,
      produto TEXT NOT NULL,
      problema TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      technicianId INTEGER,
      scheduledVisit DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (technicianId) REFERENCES technicians(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS technicians (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      availability INTEGER DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requestId TEXT,
      message TEXT NOT NULL,
      sender TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requestId) REFERENCES requests(id)
    )
  `);

  // Inserir administradores e técnicos padrão
  const defaultAdmin = { username: 'admin', email: 'admin@example.com', password: 'admin123', isAdmin: 1 };
  db.run(
    `INSERT OR REPLACE INTO users (id, username, email, password, isAdmin, createdAt) 
     VALUES ((SELECT id FROM users WHERE username = ?), ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [defaultAdmin.username, defaultAdmin.username, defaultAdmin.email, defaultAdmin.password, defaultAdmin.isAdmin],
    (err) => {
      if (err) console.error('Erro ao inserir/atualizar admin padrão:', err.message);
    }
  );
  const defaultTechnicians = [
    { name: 'João Silva', email: 'joao@tecnico.com', phone: '+258123456789' },
    { name: 'Maria Oliveira', email: 'maria@tecnico.com', phone: '+258987654321' }
  ];
  defaultTechnicians.forEach(tech => {
    db.run(
      `INSERT OR IGNORE INTO technicians (name, email, phone, availability) VALUES (?, ?, ?, 1)`,
      [tech.name, tech.email, tech.phone],
      (err) => {
        if (err) console.error('Erro ao inserir técnico padrão:', err.message);
      }
    );
  });
});

// Rotas de autenticação
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      console.error('Erro ao buscar usuário:', err.message);
      return res.status(500).json({ message: 'Erro no servidor' });
    }
    if (user && user.password === password) {
      res.json({ message: 'Login bem-sucedido', user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin === 1 } });
    } else {
      res.status(401).json({ message: 'Credenciais inválidas' });
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  db.run(
    `INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, 0)`,
    [username, email, password],
    function (err) {
      if (err) {
        console.error('Erro ao registrar usuário:', err.message);
        return res.status(500).json({ message: 'Username ou e-mail já existe' });
      }
      res.json({ message: 'Usuário cadastrado', user: { id: this.lastID, username, email, isAdmin: 0 } });
    }
  );
});

app.post('/api/auth/register-admin', (req, res) => {
  const { username, email, password } = req.body;
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  db.run(
    `INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, 1)`,
    [username, email, password],
    function (err) {
      if (err) {
        console.error('Erro ao registrar administrador:', err.message);
        return res.status(500).json({ message: 'Username ou e-mail já existe' });
      }
      res.json({ message: 'Administrador cadastrado', user: { id: this.lastID, username, email, isAdmin: 1 } });
    }
  );
});

// Rotas de suporte
app.post('/api/support', (req, res) => {
  const { user, nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema } = req.body;
  if (!user || !user.id) return res.status(401).json({ message: 'Autenticação necessária' });
  const id = uuidv4();
  db.run(
    `INSERT INTO requests (id, userId, nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, user.id, nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema],
    (err) => {
      if (err) {
        console.error('Erro ao salvar solicitação:', err.message);
        return res.status(500).json({ message: 'Erro ao salvar solicitação' });
      }
      res.json({ message: 'Solicitação recebida', requestId: id });
    }
  );
});

app.post('/api/requests', (req, res) => {
  const user = req.body.user;
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  db.all(`
    SELECT r.*, u.username AS clientUsername, t.name AS technicianName
    FROM requests r
    LEFT JOIN users u ON r.userId = u.id
    LEFT JOIN technicians t ON r.technicianId = t.id
    WHERE r.status = 'pending'
  `, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar solicitações:', err.message);
      return res.status(500).json({ message: 'Erro ao listar solicitações' });
    }
    res.json(rows);
  });
});

app.get('/api/technicians', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  db.all(`SELECT * FROM technicians`, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar técnicos:', err.message);
      return res.status(500).json({ message: 'Erro ao listar técnicos' });
    }
    res.json(rows);
  });
});

app.post('/api/add-technician', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { name, email, phone } = req.body;
  db.run(
    `INSERT INTO technicians (name, email, phone, availability) VALUES (?, ?, ?, 1)`,
    [name, email, phone],
    function (err) {
      if (err) {
        console.error('Erro ao adicionar técnico:', err.message);
        return res.status(500).json({ message: 'Erro ao adicionar técnico ou e-mail já existe' });
      }
      res.json({ message: 'Técnico adicionado', id: this.lastID });
    }
  );
});

app.post('/api/assign-technician', (req, res) => {
  const user = req.body.user;
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { requestId, technicianId, scheduledVisit } = req.body;
  db.run(
    `UPDATE requests SET technicianId = ?, scheduledVisit = ? WHERE id = ?`,
    [technicianId, scheduledVisit || null, requestId],
    (err) => {
      if (err) {
        console.error('Erro ao designar técnico:', err.message);
        return res.status(500).json({ message: 'Erro ao designar técnico' });
      }
      db.run(
        `UPDATE technicians SET availability = 0 WHERE id = ?`,
        [technicianId],
        (err) => {
          if (err) {
            console.error('Erro ao atualizar disponibilidade:', err.message);
            return res.status(500).json({ message: 'Erro ao atualizar disponibilidade' });
          }
          res.json({ message: 'Técnico designado com sucesso' });
        }
      );
    }
  );
});

app.post('/api/respond-request', (req, res) => {
  const user = req.body.user;
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  const { requestId, status, technicianId, scheduledVisit } = req.body;
  db.run(
    `UPDATE requests SET status = ?, technicianId = ?, scheduledVisit = ? WHERE id = ?`,
    [status, technicianId || null, scheduledVisit || null, requestId],
    (err) => {
      if (err) {
        console.error('Erro ao responder solicitação:', err.message);
        return res.status(500).json({ message: 'Erro ao responder solicitação' });
      }
      if (technicianId) {
        db.run(
          `UPDATE technicians SET availability = 0 WHERE id = ?`,
          [technicianId],
          (err) => {
            if (err) {
              console.error('Erro ao atualizar disponibilidade do técnico:', err.message);
              return res.status(500).json({ message: 'Erro ao atualizar disponibilidade do técnico' });
            }
            res.json({ message: 'Solicitação respondida com sucesso' });
          }
        );
      } else {
        res.json({ message: 'Solicitação respondida com sucesso' });
      }
    }
  );
});

app.get('/api/chat-history/:requestId', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  const { requestId } = req.params;
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  db.all(
    `SELECT * FROM chat_history WHERE requestId = ? ORDER BY timestamp`,
    [requestId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao obter histórico:', err.message);
        return res.status(500).json({ message: 'Erro ao obter histórico' });
      }
      res.json(rows);
    }
  );
});

app.get('/api/users', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  if (!user || !user.isAdmin) {
    console.log('Acesso negado:', user);
    return res.status(403).json({ message: 'Acesso restrito a administradores' });
  }
  db.all(`SELECT id, username, email, isAdmin FROM users`, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar usuários:', err.message);
      return res.status(500).json({ message: 'Erro ao listar usuários' });
    }
    res.json(rows);
  });
});

app.delete('/api/users/:id', (req, res) => {
  const user = JSON.parse(req.headers['x-user'] || '{}');
  const { id } = req.params;
  if (!user || !user.isAdmin) return res.status(403).json({ message: 'Acesso restrito a administradores' });
  if (user.id === parseInt(id)) return res.status(400).json({ message: 'Você não pode excluir a si mesmo' });
  db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error('Erro ao excluir usuário:', err.message);
      return res.status(500).json({ message: 'Erro ao excluir usuário' });
    }
    if (this.changes === 0) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.json({ message: 'Usuário excluído com sucesso' });
  });
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
    db.run(
      `INSERT INTO chat_history (requestId, message, sender, timestamp) VALUES (?, ?, ?, ?)`,
      [requestId, message, from, new Date().toISOString()],
      (err) => {
        if (err) console.error('Erro ao salvar mensagem:', err.message);
      }
    );
    io.to(userId).emit('message', { from, message, requestId, userId, username, timestamp: new Date().toISOString() });

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
          from: 'bot',
          message: response.reply,
          requestId,
          userId,
          username: 'Bot de Suporte',
          timestamp: new Date().toISOString()
        };
        io.to(userId).emit('privateMessage', botMessage);
        io.to(userId).emit('typing', { typing: false });
        io.to(userId).emit('suggestions', response.suggestions);
        db.run(
          `INSERT INTO chat_history (requestId, message, sender, timestamp) VALUES (?, ?, ?, ?)`,
          [requestId, response.reply, 'bot', new Date().toISOString()],
          (err) => {
            if (err) console.error('Erro ao salvar resposta do bot:', err.message);
          }
        );
      }, 1000);
    }
  });

  socket.on('privateMessage', (data) => {
    const { from, message, userId, username, targetUserId, requestId } = data;
    db.run(
      `INSERT INTO chat_history (requestId, message, sender, timestamp) VALUES (?, ?, ?, ?)`,
      [requestId, message, from, new Date().toISOString()],
      (err) => {
        if (err) console.error('Erro ao salvar mensagem privada:', err.message);
      }
    );
    if (targetUserId) {
      io.to(targetUserId).emit('privateMessage', { from, message, userId, username, targetUserId, requestId, timestamp: new Date().toISOString() });
      if (socket.userId === userId) {
        socket.emit('privateMessage', { from, message, userId, username, targetUserId, requestId, timestamp: new Date().toISOString() });
      }
    }
  });

  socket.on('needHelp', (data) => {
    const { requestId, userId } = data;
    io.emit('alertAdmin', { message: 'Um cliente precisa de ajuda!', requestId, userId, timestamp: new Date().toISOString() });
    db.run(
      `UPDATE requests SET status = 'needs_admin' WHERE id = ?`,
      [requestId],
      (err) => {
        if (err) console.error('Erro ao atualizar status da solicitação:', err.message);
      }
    );
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
    db.run(
      `UPDATE requests SET scheduledVisit = ? WHERE id = ?`,
      [dateTime, requestId],
      (err) => {
        if (err) console.error('Erro ao agendar visita:', err.message);
        io.to(userId).emit('privateMessage', {
          from: 'admin',
          message: `Visita agendada para ${new Date(dateTime).toLocaleString('pt-BR', { timeZone: 'Africa/Lusaka' })}`,
          requestId,
          userId,
          username: 'Admin',
          timestamp: new Date().toISOString()
        });
      }
    );
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