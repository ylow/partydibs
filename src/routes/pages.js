import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL = path.resolve(__dirname, '../../public/index.html');

function partyExists(db) {
  return !!db.prepare('SELECT 1 FROM party WHERE id = 1').get();
}

export function mountPages(app, db) {
  app.get('/', (req, res) => {
    if (!partyExists(db)) return res.redirect('/setup');
    res.sendFile(SHELL);
  });

  app.get('/setup', (req, res) => {
    if (partyExists(db)) return res.redirect('/');
    res.sendFile(SHELL);
  });

  app.get('/admin', (req, res) => {
    if (!partyExists(db)) return res.redirect('/setup');
    res.sendFile(SHELL);
  });
}
