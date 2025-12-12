import sys
import json
import os
import struct

CONFIG_PATH = r"C:\\Program Files\\V.O.C.E\\config.json"

def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = int.from_bytes(raw_length, byteorder="little")
    data = sys.stdin.buffer.read(length).decode("utf-8")
    return json.loads(data)

def send_message(msg):
    encoded = json.dumps(msg).encode("utf-8")
    sys.stdout.buffer.write(len(encoded).to_bytes(4, byteorder="little"))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

while True:
    message = read_message()
    if not message:
        break

    cmd = message.get("cmd")

    # 1 — pegar backend_url do config.json
    if cmd == "get_backend_url":
        if os.path.exists(CONFIG_PATH):
            config = json.load(open(CONFIG_PATH, "r", encoding="utf-8"))
            send_message({
                "status": "ok",
                "backend_url": config.get("backend_url")
            })
        else:
            send_message({
                "status": "error",
                "error": "config_not_found"
            })

    # 2 — pegar nome de usuário
    elif cmd == "get_username":
        try:
            username = os.getlogin()
            send_message({"status": "ok", "username": username})
        except Exception as e:
            send_message({"status": "error", "message": str(e)})

    else:
        send_message({"status": "error", "message": "unknown_command"})
