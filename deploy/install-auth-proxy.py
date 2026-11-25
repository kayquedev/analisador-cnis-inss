from pathlib import Path
import shutil
config = Path('/etc/nginx/sites-available/cnis.kodesaude.com.br')
text = config.read_text()
marker = '    location / { try_files $uri $uri/ /index.html; }'
addition = '''    location /api/ {
        proxy_pass http://127.0.0.1:8137;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 3m;
    }
'''
if 'proxy_pass http://127.0.0.1:8137' not in text:
    if text.count(marker) != 1:
        raise SystemExit('Expected one SPA location; no changes made.')
    shutil.copy2(config, str(config) + '.before-auth')
    config.write_text(text.replace(marker, addition + marker, 1))
