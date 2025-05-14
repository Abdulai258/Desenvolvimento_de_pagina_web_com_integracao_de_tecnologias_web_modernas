const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const router = express.Router();

// Conectar ao banco de dados
const db = new sqlite3.Database('./server/database.db');

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
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err) {
      console.error('Erro ao verificar usuário:', err.message);
      return res.status(500).json({ message: 'Erro no servidor' });
    }
    console.log('Usuário encontrado no banco:', user);
    if (user && user.password === password) {
      res.json({ message: 'Login bem-sucedido', user: { id: user.id, username: user.username, email: user.email, isAdmin: user.isAdmin === 1 }, redirect: user.isAdmin ? '/admin.html' : '/index.html' });
    } else {
      res.status(401).json({ message: 'Credenciais inválidas' });
    }
  });
});

// Rota para cadastro
router.post('/auth/register', (req, res) => {
  const { username, email, password, isAdmin = 0 } = req.body;
  db.run(
    `INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, ?)`,
    [username, email, password, isAdmin],
    function (err) {
      if (err) {
        console.error('Erro ao cadastrar usuário:', err.message);
        return res.status(500).json({ message: 'Username ou e-mail já existe' });
      }
      res.json({ message: 'Usuário cadastrado', user: { id: this.lastID, username, email, isAdmin } });
    }
  );
});

// Rota para recuperação de senha
router.post('/auth/reset-password', (req, res) => {
  const { email } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) {
      console.error('Erro ao verificar e-mail:', err.message);
      return res.status(500).json({ message: 'Erro no servidor' });
    }
    if (!user) {
      return res.status(404).json({ message: 'E-mail não encontrado' });
    }
    const token = Math.random().toString(36).substring(2);
    db.run(
      `INSERT INTO password_resets (userId, token, expires) VALUES (?, ?, ?)`,
      [user.id, token, Date.now() + 3600000],
      (err) => {
        if (err) {
          console.error('Erro ao salvar token:', err.message);
          return res.status(500).json({ message: 'Erro ao processar solicitação' });
        }
        console.log(`Token de recuperação para ${email}: ${token}`);
        res.json({ message: 'Link de recuperação enviado' });
      }
    );
  });
});

// Rota para atualizar perfil
router.put('/api/profile', requireAuth, (req, res) => {
  const { username, email, password } = req.body;
  const userId = req.user.id;

  // Verificar se username ou e-mail já existem (excluindo o próprio usuário)
  db.get(
    `SELECT id FROM users WHERE (username = ? OR email = ?) AND id != ?`,
    [username, email, userId],
    (err, existingUser) => {
      if (err) {
        console.error('Erro ao verificar duplicatas:', err.message);
        return res.status(500).json({ message: 'Erro ao atualizar perfil' });
      }
      if (existingUser) {
        return res.status(400).json({ message: 'Username ou e-mail já está em uso' });
      }

      // Preparar atualização
      const updates = [];
      const params = [username, email, userId];

      updates.push(`username = ?`, `email = ?`);
      if (password) {
        updates.push(`password = ?`);
        params.push(password);
      }

      db.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
        params,
        (err) => {
          if (err) {
            console.error('Erro ao atualizar perfil:', err.message);
            return res.status(500).json({ message: 'Erro ao atualizar perfil' });
          }
          res.json({ message: 'Perfil atualizado' });
        }
      );
    }
  );
});

// Rota para enviar solicitação de suporte
router.post('/support', requireAuth, restrictAdmin, (req, res) => {
  const { nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema } = req.body;
  const id = Date.now().toString();
  db.run(
    `INSERT INTO requests (id, userId, nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.id, nome, email, idade, sexo, bairro, numeroCasa, celular, produto, problema],
    (err) => {
      if (err) {
        console.error('Erro ao salvar solicitação:', err.message);
        return res.status(500).json({ message: 'Erro ao salvar solicitação' });
      }
      res.json({ message: 'Solicitação recebida', requestId: id });
    }
  );
});

// Rota para listar solicitações
router.post('/requests', requireAuth, requireAdmin, (req, res) => {
  db.all(`SELECT * FROM requests`, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar solicitações:', err.message);
      return res.status(500).json({ message: 'Erro ao listar solicitações' });
    }
    res.json(rows);
  });
});

// Rota para solicitações por usuário
router.get('/requests', requireAuth, (req, res) => {
  const userId = req.query.userId || req.user.id;
  db.all(`SELECT * FROM requests WHERE userId = ?`, [userId], (err, rows) => {
    if (err) {
      console.error('Erro ao listar solicitações:', err.message);
      return res.status(500).json({ message: 'Erro ao listar solicitações' });
    }
    res.json(rows);
  });
});

// Rota para responder solicitação
router.post('/respond-request', requireAuth, requireAdmin, (req, res) => {
  const { requestId, message, technicianId } = req.body;
  const status = technicianId ? 'assigned' : 'responded';
  db.run(
    `UPDATE requests SET status = ?, technicianId = ?, response = ?, respondedAt = ? WHERE id = ?`,
    [status, technicianId || null, message, new Date().toISOString(), requestId],
    (err) => {
      if (err) {
        console.error('Erro ao responder solicitação:', err.message);
        return res.status(500).json({ message: 'Erro ao responder solicitação' });
      }
      if (technicianId) {
        db.run(
          `UPDATE technicians SET available = 0 WHERE id = ?`,
          [technicianId],
          (err) => {
            if (err) console.error('Erro ao atualizar disponibilidade do técnico:', err.message);
          }
        );
      }
      res.json({ message: 'Resposta enviada' });
    }
  );
});

// Rota para atualizar status da visita do técnico
router.post('/technician-status', requireAuth, requireAdmin, (req, res) => {
  const { requestId, technicianStatus, technicianId } = req.body;
  db.run(
    `UPDATE requests SET technicianStatus = ?, status = ? WHERE id = ?`,
    [technicianStatus, 'completed', requestId],
    (err) => {
      if (err) {
        console.error('Erro ao atualizar status da visita:', err.message);
        return res.status(500).json({ message: 'Erro ao atualizar status da visita' });
      }
      if (technicianStatus === 'Resolvido') {
        db.run(
          `UPDATE technicians SET available = 1 WHERE id = ?`,
          [technicianId],
          (err) => {
            if (err) console.error('Erro ao atualizar disponibilidade do técnico:', err.message);
          }
        );
      }
      res.json({ message: 'Status da visita atualizado' });
    }
  );
});

// Rota para gerar relatórios de solicitações
router.get('/reports', requireAuth, requireAdmin, (req, res) => {
  const { startDate, endDate, status } = req.query;
  let query = `SELECT * FROM requests WHERE 1=1`;
  const params = [];
  if (startDate) {
    query += ` AND createdAt >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND createdAt <= ?`;
    params.push(endDate);
  }
  if (status) {
    query += ` AND status = ?`;
    params.push(status);
  }
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Erro ao gerar relatório:', err.message);
      return res.status(500).json({ message: 'Erro ao gerar relatório' });
    }
    res.json(rows);
  });
});

// Rota para limpar histórico de chat
router.delete('/chat-history', requireAuth, requireAdmin, (req, res) => {
  db.run(`DELETE FROM chat_history`, [], (err) => {
    if (err) {
      console.error('Erro ao limpar histórico:', err.message);
      return res.status(500).json({ message: 'Erro ao limpar histórico' });
    }
    res.json({ message: 'Histórico de chat limpo' });
  });
});

// Rota para listar usuários
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  db.all(`SELECT id, username, email, password, createdAt FROM users`, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar usuários:', err.message);
      return res.status(500).json({ message: 'Erro ao listar usuários' });
    }
    res.json(rows);
  });
});

// Rota para adicionar usuário
router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, email, password } = req.body;
  db.run(
    `INSERT INTO users (username, email, password, isAdmin) VALUES (?, ?, ?, 0)`,
    [username, email, password],
    (err) => {
      if (err) {
        console.error('Erro ao adicionar usuário:', err.message);
        return res.status(500).json({ message: 'Erro ao adicionar usuário' });
      }
      res.json({ message: 'Usuário adicionado' });
    }
  );
});

// Rota para remover usuário
router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM users WHERE id = ? AND isAdmin = 0`, [id], (err) => {
    if (err) {
      console.error('Erro ao remover usuário:', err.message);
      return res.status(500).json({ message: 'Erro ao remover usuário' });
    }
    res.json({ message: 'Usuário removido' });
  });
});

// Rota para obter histórico de chat
router.get('/chat-history', requireAuth, requireAdmin, (req, res) => {
  db.all(
    `SELECT * FROM chat_history ORDER BY timestamp`,
    [],
    (err, rows) => {
      if (err) {
        console.error('Erro ao obter histórico:', err.message);
        return res.status(500).json({ message: 'Erro ao obter histórico' });
      }
      res.json(rows);
    }
  );
});

// Rota para obter histórico de chat por solicitação
router.get('/chat-history/:requestId', requireAuth, requireAdmin, (req, res) => {
  const { requestId } = req.params;
  db.all(
    `SELECT * FROM chat_history WHERE requestId = ? ORDER BY timestamp`,
    [requestId],
    (err, rows) => {
      if (err) {
        console.error('Erro ao obter histórico da solicitação:', err.message);
        return res.status(500).json({ message: 'Erro ao obter histórico' });
      }
      res.json(rows);
    }
  );
});

// Rota para listar técnicos
router.get('/technicians', requireAuth, requireAdmin, (req, res) => {
  db.all(`SELECT * FROM technicians`, [], (err, rows) => {
    if (err) {
      console.error('Erro ao listar técnicos:', err.message);
      return res.status(500).json({ message: 'Erro ao listar técnicos' });
    }
    res.json(rows);
  });
});

// Rota para adicionar técnico
router.post('/technicians', requireAuth, requireAdmin, (req, res) => {
  const { name, contact, specialty } = req.body;
  db.run(
    `INSERT INTO technicians (name, contact, specialty, available) VALUES (?, ?, ?, 1)`,
    [name, contact, specialty],
    (err) => {
      if (err) {
        console.error('Erro ao adicionar técnico:', err.message);
        return res.status(500).json({ message: 'Erro ao adicionar técnico' });
      }
      res.json({ message: 'Técnico adicionado' });
    }
  );
});

// Rota para remover técnico
router.delete('/technicians/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM technicians WHERE id = ?`, [id], (err) => {
    if (err) {
      console.error('Erro ao remover técnico:', err.message);
      return res.status(500).json({ message: 'Erro ao remover técnico' });
    }
    res.json({ message: 'Técnico removido' });
  });
});

module.exports = router;