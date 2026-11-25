"""Account and branding API. CNIS documents are processed only in the browser."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from http.cookies import SimpleCookie
from contextlib import contextmanager

DATABASE = os.environ.get('CNIS_DATABASE', '/var/lib/kode-cnis/accounts.sqlite3')
ORIGIN = os.environ.get('CNIS_ORIGIN', 'https://cnis.kodesaude.com.br')
SECURE = os.environ.get('CNIS_SECURE_COOKIE', '1') != '0'
COOKIE = 'kode_cnis_session'

@contextmanager
def connection():
    db = sqlite3.connect(DATABASE, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    try:
        with db:
            yield db
    finally:
        db.close()

def initialize():
    Path(DATABASE).parent.mkdir(parents=True, exist_ok=True)
    with connection() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, cpf TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          password TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
          branding TEXT NOT NULL DEFAULT '{"name":"KODE CNIS"}');
        CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, cpf TEXT NOT NULL, at INTEGER NOT NULL);
        ''')

def cpf_value(value):
    cpf = re.sub(r'\D', '', str(value or ''))
    if len(cpf) != 11:
        raise ValueError('Informe um CPF com 11 dígitos.')
    return cpf

def hash_password(password):
    if not isinstance(password, str) or not 6 <= len(password) <= 128 or not re.search(r'[A-Za-z]', password) or not re.search(r'[0-9]', password):
        raise ValueError('A senha deve ter de 6 a 128 caracteres, pelo menos uma letra e um número.')
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
    return f'{salt}:{digest}'

def verify_password(password, saved):
    if not isinstance(password, str) or len(password) > 128:
        return False
    salt, digest = saved.split(':')
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
    return hmac.compare_digest(actual, digest)

def public_user(row):
    return {key: row[key] for key in ('id', 'cpf', 'name', 'role', 'active')}

def clean_branding(data):
    limits = {'name': 100, 'document': 30, 'role': 100, 'council': 80, 'councilNumber': 60}
    output = {}
    for key, limit in limits.items():
        value = data.get(key, '')
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError('Campo de identificação inválido.')
        output[key] = value.strip()
    logo = data.get('logo')
    if logo:
        if not isinstance(logo, str) or not re.match(r'^data:image/(png|jpeg|webp);base64,', logo):
            raise ValueError('Use uma logo PNG, JPG ou WebP.')
        try:
            raw = base64.b64decode(logo.split(',', 1)[1], validate=True)
        except Exception:
            raise ValueError('Imagem inválida.') from None
        if len(raw) > 2 * 1024 * 1024:
            raise ValueError('A logo deve ter até 2 MB.')
        valid = (logo.startswith('data:image/png;') and raw.startswith(b'\x89PNG\r\n\x1a\n')) or (logo.startswith('data:image/jpeg;') and raw.startswith(b'\xff\xd8\xff')) or (logo.startswith('data:image/webp;') and raw.startswith(b'RIFF') and raw[8:12] == b'WEBP')
        if not valid:
            raise ValueError('Formato de imagem inválido.')
        output['logo'] = logo
    return output

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Do not log credentials or personal data.

    def reply(self, status, data, cookie=None):
        # Send only after SQLite commits, so the next request sees the saved session.
        self.pending_response = (status, data, cookie)

    def send_reply(self, status, data, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', cookie)
        self.end_headers()
        self.wfile.write(body)

    def session(self, db):
        cookies = SimpleCookie()
        try:
            cookies.load(self.headers.get('Cookie', ''))
            token = cookies[COOKIE].value
        except Exception:
            return None, None
        digest = hashlib.sha256(token.encode()).hexdigest()
        user = db.execute('SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>? AND u.active=1', (digest, int(time.time()))).fetchone()
        return user, digest

    def cookie(self, token='', age=0):
        return f'{COOKIE}={token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age={age}' + ('; Secure' if SECURE else '')

    def do_GET(self):
        self.dispatch()

    def do_POST(self):
        self.dispatch()

    def do_PUT(self):
        self.dispatch()

    def dispatch(self):
        try:
            if self.command != 'GET' and self.headers.get('Origin') != ORIGIN:
                return self.reply(403, {'error': 'Origem não autorizada.'})
            data = {}
            if self.command != 'GET':
                length = int(self.headers.get('Content-Length', '0'))
                if length > 3000000:
                    return self.reply(413, {'error': 'Arquivo muito grande.'})
                data = json.loads(self.rfile.read(length) or b'{}')
                if not isinstance(data, dict):
                    raise ValueError('Dados inválidos.')
            with connection() as db:
                self.route(db, data)
        except (ValueError, TypeError):
            self.reply(400, {'error': 'Dados inválidos. Confira os campos e o formato da logo.'})
        except sqlite3.IntegrityError:
            self.reply(409, {'error': 'Já existe uma conta com esse CPF.'})
        except Exception:
            self.reply(500, {'error': 'Não foi possível concluir a solicitação.'})
        finally:
            if hasattr(self, 'pending_response'):
                self.send_reply(*self.pending_response)

    def route(self, db, data):
        path = self.path.split('?')[0]
        method = self.command
        now = int(time.time())
        if path == '/api/health' and method == 'GET':
            return self.reply(200, {'ok': True})
        if path == '/api/login' and method == 'POST':
            cpf = cpf_value(data.get('cpf'))
            ip = self.headers.get('X-Real-IP', self.client_address[0])
            db.execute('DELETE FROM attempts WHERE at<?', (now - 900,))
            attempts = db.execute('SELECT COUNT(*) FROM attempts WHERE ip=? OR cpf=?', (ip, cpf)).fetchone()[0]
            if attempts >= 10:
                return self.reply(429, {'error': 'Muitas tentativas. Aguarde 15 minutos e tente novamente.'})
            row = db.execute('SELECT * FROM users WHERE cpf=?', (cpf,)).fetchone()
            # Equal-cost verification even for an unknown CPF.
            saved = row['password'] if row else '00000000000000000000000000000000:' + '0' * 64
            valid = verify_password(data.get('password'), saved)
            if not row or not row['active'] or not valid:
                db.execute('INSERT INTO attempts VALUES (?,?,?)', (ip, cpf, now))
                return self.reply(401, {'error': 'CPF ou senha incorretos.'})
            db.execute('DELETE FROM attempts WHERE ip=? AND cpf=?', (ip, cpf))
            db.execute('DELETE FROM sessions WHERE expires<?', (now,))
            token = secrets.token_urlsafe(32)
            db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), row['id'], now + 43200))
            return self.reply(200, {'user': public_user(row), 'branding': json.loads(row['branding'])}, self.cookie(token, 43200))
        user, token = self.session(db)
        if not user:
            return self.reply(401, {'error': 'Entre com seu CPF e senha.'})
        if path == '/api/me' and method == 'GET':
            return self.reply(200, {'user': public_user(user), 'branding': json.loads(user['branding'])})
        if path == '/api/logout' and method == 'POST':
            db.execute('DELETE FROM sessions WHERE token=?', (token,))
            return self.reply(200, {'ok': True}, self.cookie())
        if path == '/api/branding' and method == 'PUT':
            branding = clean_branding(data)
            db.execute('UPDATE users SET branding=? WHERE id=?', (json.dumps(branding), user['id']))
            return self.reply(200, {'branding': branding})
        if path == '/api/password' and method == 'PUT':
            if not verify_password(data.get('currentPassword'), user['password']):
                return self.reply(400, {'error': 'Senha atual incorreta.'})
            try:
                password = hash_password(data.get('password'))
            except ValueError as error:
                return self.reply(400, {'error': str(error)})
            db.execute('UPDATE users SET password=? WHERE id=?', (password, user['id']))
            db.execute('DELETE FROM sessions WHERE user_id=? AND token<>?', (user['id'], token))
            return self.reply(200, {'ok': True})
        if path.startswith('/api/users'):
            if user['role'] != 'admin':
                return self.reply(403, {'error': 'Apenas administradores podem gerenciar acessos.'})
            if path == '/api/users' and method == 'GET':
                return self.reply(200, {'users': [public_user(row) for row in db.execute('SELECT * FROM users ORDER BY name')]})
            if path == '/api/users' and method == 'POST':
                cpf = cpf_value(data.get('cpf'))
                name = str(data.get('name', '')).strip()[:100]
                if not name:
                    return self.reply(400, {'error': 'Informe o nome do usuário.'})
                role = data.get('role', 'user')
                if role not in ('user', 'admin'):
                    raise ValueError('Perfil inválido.')
                try:
                    password = hash_password(data.get('password'))
                except ValueError as error:
                    return self.reply(400, {'error': str(error)})
                identifier = secrets.token_hex(16)
                db.execute('INSERT INTO users(id,cpf,name,password,role) VALUES (?,?,?,?,?)', (identifier, cpf, name, password, role))
                return self.reply(201, {'ok': True})
            target = path.removeprefix('/api/users/')
            if method == 'PUT' and path.startswith('/api/users/'):
                row = db.execute('SELECT * FROM users WHERE id=?', (target,)).fetchone()
                if not row:
                    return self.reply(404, {'error': 'Usuário não encontrado.'})
                name = data.get('name', row['name'])
                if not isinstance(name, str) or not name.strip() or len(name.strip()) > 100:
                    return self.reply(400, {'error': 'Informe um nome de até 100 caracteres.'})
                cpf = cpf_value(data.get('cpf', row['cpf']))
                if db.execute('SELECT id FROM users WHERE cpf=? AND id<>?', (cpf, target)).fetchone():
                    return self.reply(409, {'error': 'Já existe uma conta com esse CPF.'})
                password = None
                if 'password' in data:
                    try:
                        password = hash_password(data['password'])
                    except ValueError as error:
                        return self.reply(400, {'error': str(error)})
                if 'active' in data:
                    if target == user['id']:
                        return self.reply(400, {'error': 'Não é possível desativar sua própria conta.'})
                    if not isinstance(data['active'], bool):
                        raise ValueError('Status inválido.')
                    db.execute('UPDATE users SET active=? WHERE id=?', (int(data['active']), target))
                if 'password' in data:
                    db.execute('UPDATE users SET password=? WHERE id=?', (password, target))
                db.execute('UPDATE users SET name=?,cpf=? WHERE id=?', (name.strip(), cpf, target))
                if 'active' in data or 'password' in data:
                    db.execute('DELETE FROM sessions WHERE user_id=?', (target,))
                elif cpf != row['cpf']:
                    db.execute('DELETE FROM sessions WHERE user_id=? AND token<>?', (target, token))
                return self.reply(200, {'ok': True})
        return self.reply(404, {'error': 'Recurso não encontrado.'})

if __name__ == '__main__':
    initialize()
    if '--bootstrap' in sys.argv:
        payload = json.load(sys.stdin)
        with connection() as db:
            if db.execute('SELECT 1 FROM users WHERE role=?', ('admin',)).fetchone():
                raise SystemExit('An administrator already exists; no changes made.')
            db.execute('INSERT INTO users(id,cpf,name,password,role) VALUES (?,?,?,?,?)', (secrets.token_hex(16), cpf_value(payload['cpf']), payload.get('name', 'Administrador'), hash_password(payload['password']), 'admin'))
        print('Administrator initialized.')
    else:
        ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('CNIS_PORT', '8137'))), Handler).serve_forever()
