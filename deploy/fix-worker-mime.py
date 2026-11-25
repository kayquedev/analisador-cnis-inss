from pathlib import Path
import shutil

config = Path('/etc/nginx/sites-available/cnis.kodesaude.com.br')
text = config.read_text()
marker = '    location /assets/ {\n'
addition = '        types {\n            application/javascript js mjs;\n            text/css css;\n        }\n'
if addition not in text:
    if text.count(marker) != 1:
        raise SystemExit('Expected one assets location; config left unchanged')
    shutil.copy2(config, str(config) + '.before-worker-mime')
    config.write_text(text.replace(marker, marker + addition, 1))
