import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
import app

class AccountsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        app.DATABASE = str(Path(self.temp.name) / 'test.sqlite3')
        app.ORIGIN = 'https://example.test'
        app.initialize()
        with app.connection() as db:
            db.execute('INSERT INTO users(id,cpf,name,password,role) VALUES (?,?,?,?,?)', ('admin-test', '11111111111', 'Test Admin', app.hash_password('admin1'), 'admin'))
        self.server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, method='GET', data=None, cookie='', origin='https://example.test'):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        connection.request(method, '/api/' + path, body=json.dumps(data) if data is not None else None, headers={'Origin': origin, 'Cookie': cookie, 'Content-Type': 'application/json'})
        response = connection.getresponse()
        output = (response.status, json.loads(response.read()), response.getheader('Set-Cookie', ''))
        connection.close()
        return output

    def test_account_isolation_and_permissions(self):
        self.assertEqual(self.request('me')[0], 401)
        self.assertEqual(self.request('login', 'POST', {'cpf': '11111111111', 'password': 'bad'}, origin='https://wrong.test')[0], 403)
        status, session, cookie = self.request('login', 'POST', {'cpf': '11111111111', 'password': 'admin1'})
        self.assertEqual(status, 200)
        self.assertNotIn('password', session['user'])
        self.assertIn('HttpOnly', cookie)
        self.assertIn('Secure', cookie)
        self.assertEqual(self.request('users', 'POST', {'cpf': '22222222222', 'name': 'Other User', 'password': 'abc123'}, cookie)[0], 201)
        self.assertEqual(self.request('users', 'POST', {'cpf': '22222222222', 'name': 'Duplicate', 'password': 'abc123'}, cookie)[0], 409)
        _, other, other_cookie = self.request('login', 'POST', {'cpf': '22222222222', 'password': 'abc123'})
        other_id = other['user']['id']
        self.assertEqual(self.request('users', cookie=other_cookie)[0], 403)
        self.assertEqual(self.request('users/admin-test', 'PUT', {'password': 'attack1'}, other_cookie)[0], 403)
        self.assertEqual(self.request('branding', 'PUT', {'name': 'Other Brand', 'role': 'Social worker', 'user_id': 'admin-test'}, other_cookie)[0], 200)
        self.assertEqual(self.request('me', cookie=other_cookie)[1]['branding']['name'], 'Other Brand')
        self.assertEqual(self.request('me', cookie=cookie)[1]['branding']['name'], 'KODE CNIS')
        self.assertEqual(self.request('branding', 'PUT', {'name': 'Test', 'logo': 'data:image/svg+xml;base64,AAAA'}, other_cookie)[0], 400)
        self.assertEqual(self.request('users/admin-test', 'PUT', {'active': False}, cookie)[0], 400)
        self.assertEqual(self.request('password', 'PUT', {'currentPassword': 'abc123', 'password': 'abcdef'}, other_cookie)[0], 400)
        self.assertEqual(self.request('password', 'PUT', {'currentPassword': 'abc123', 'password': 'new123'}, other_cookie)[0], 200)
        self.assertEqual(self.request('users/' + other_id, 'PUT', {'password': 'reset1'}, cookie)[0], 200)
        self.assertEqual(self.request('me', cookie=other_cookie)[0], 401)
        _, _, other_cookie = self.request('login', 'POST', {'cpf': '22222222222', 'password': 'reset1'})
        self.assertEqual(self.request('users/' + other_id, 'PUT', {'active': False}, cookie)[0], 200)
        self.assertEqual(self.request('me', cookie=other_cookie)[0], 401)
        self.assertEqual(self.request('logout', 'POST', {}, cookie)[0], 200)
        self.assertEqual(self.request('me', cookie=cookie)[0], 401)

    def test_edit_user_preserves_identity_and_password(self):
        _, _, cookie = self.request('login', 'POST', {'cpf': '11111111111', 'password': 'admin1'})
        self.request('users', 'POST', {'cpf': '22222222222', 'name': 'Before', 'password': 'abc123'}, cookie)
        _, other, other_cookie = self.request('login', 'POST', {'cpf': '22222222222', 'password': 'abc123'})
        identifier = other['user']['id']
        self.request('branding', 'PUT', {'name': 'Preserved Brand'}, other_cookie)
        self.assertEqual(self.request('users/' + identifier, 'PUT', {'name': 'Corrected', 'cpf': '333.333.333-33'}, other_cookie)[0], 403)
        self.assertEqual(self.request('users/' + identifier, 'PUT', {'name': 'Wrong', 'cpf': '11111111111'}, cookie)[0], 409)
        self.assertEqual(self.request('users/' + identifier, 'PUT', {'name': ' '}, cookie)[0], 400)
        self.assertEqual(self.request('me', cookie=other_cookie)[1]['user']['name'], 'Before')
        self.assertEqual(self.request('users/' + identifier, 'PUT', {'name': 'Corrected', 'cpf': '333.333.333-33'}, cookie)[0], 200)
        self.assertEqual(self.request('me', cookie=other_cookie)[0], 401)
        self.assertEqual(self.request('login', 'POST', {'cpf': '22222222222', 'password': 'abc123'})[0], 401)
        status, edited, _ = self.request('login', 'POST', {'cpf': '33333333333', 'password': 'abc123'})
        self.assertEqual(status, 200)
        self.assertEqual(edited['user']['id'], identifier)
        self.assertEqual(edited['user']['name'], 'Corrected')
        self.assertEqual(edited['branding']['name'], 'Preserved Brand')
        self.assertEqual(self.request('users/admin-test', 'PUT', {'name': 'Admin Corrected', 'cpf': '44444444444'}, cookie)[0], 200)
        self.assertEqual(self.request('me', cookie=cookie)[1]['user']['name'], 'Admin Corrected')

    def test_password_policy_and_login_throttling(self):
        for password in ('123456', 'abcdef', 'a1234'):
            with self.assertRaises(ValueError):
                app.hash_password(password)
        self.assertTrue(app.verify_password('abc123', app.hash_password('abc123')))
        for _ in range(10):
            self.assertEqual(self.request('login', 'POST', {'cpf': '99999999999', 'password': 'wrong1'})[0], 401)
        self.assertEqual(self.request('login', 'POST', {'cpf': '99999999999', 'password': 'wrong1'})[0], 429)

if __name__ == '__main__':
    unittest.main()
