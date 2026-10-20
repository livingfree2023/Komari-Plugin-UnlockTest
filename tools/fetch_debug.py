import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request(
    "https://komari.leohou.org/api/plugin/unlock-test/debug",
    headers={"Authorization": "Bearer komari-WYfvToYPfT8joBHWrSJbb0MuhwKFmBq0"}
)

try:
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    with open("tools/debug_status.json", "w") as f:
        json.dump(data, f, indent=2)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
