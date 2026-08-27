const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'studio.json');
fs.mkdirSync(dataDir, { recursive: true });

function defaultDb() {
  return {
    users: [
      {
        id: 1,
        username: 'admin',
        name: 'Studio Admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString(),
        last_login: null
      }
    ],
    _seq: { users: 1 }
  };
}

function load() {
  if (!fs.existsSync(dbFile)) {
    const d = defaultDb();
    save(d);
    return d;
  }
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}

function save(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

module.exports = { load, save };
