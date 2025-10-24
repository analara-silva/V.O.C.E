import os
import json

user = os.getlogin()
user_path = f"C:\\Users\\{user}\\Downloads\\V.O.C.E\\native_host\\run_host.bat"

manifest_chrome = {
    "name": "com.meutcc.monitor",
    "description": "Host nativo para o TCC de monitoramento",
    "path": user_path,
    "type": "stdio",
    "allowed_origins": ["chrome-extension://<id_da_extensao>/"]
}

manifest_firefox = {
    "name": "com.meutcc.monitor",
    "description": "Host nativo para o TCC de monitoramento",
    "path": user_path,
    "type": "stdio",
    "allowed_extensions": ["moz-extension://monitor-tcc@meuprojeto.com"]
}

# Caminhos
chrome_path = f"C:\\Users\\{user}\\Downloads\\V.O.C.E\\host_manifest\\host_manifest-chrome.json"
firefox_path = f"C:\\Users\\{user}\\Downloads\\V.O.C.E\\host_manifest\\host_manifest-firefox.json"

# Cria diretórios se não existirem
os.makedirs(os.path.dirname(chrome_path), exist_ok=True)
os.makedirs(os.path.dirname(firefox_path), exist_ok=True)

# Escreve os manifests
with open(chrome_path, "w") as f:
    json.dump(manifest_chrome, f, indent=4)

with open(firefox_path, "w") as f:
    json.dump(manifest_firefox, f, indent=4)

print("✅ Manifests do Chrome e Firefox gerados com sucesso!")

content_reg = f"""Windows Registry Editor Version 5.00

; Configuração para Google Chrome
[HKEY_CURRENT_USER\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\com.meutcc.monitor]
@="{chrome_path}"

; Configuração para Mozilla Firefox
[HKEY_CURRENT_USER\\SOFTWARE\\Mozilla\\NativeMessagingHosts\\com.meutcc.monitor]
@="{firefox_path}"
"""

# salva o arquivo .reg
file_reg = os.path.join(os.getcwd(), "instalador_host.reg")
with open(file_reg, "w") as f:
    f.write(content_reg)

print("✅ Arquivo instalador_host.reg gerado com sucesso!")
print(f"📂 Caminho: {file_reg}")