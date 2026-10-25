#!/usr/bin/env bash
# Deploys a new karen-api version. DEVICE_TOKEN comes from Lockbox karen-secrets.
set -euo pipefail
cd "$(dirname "$0")"
Y=${YC:-/home/box/yandex-cloud/bin/yc}; F=b1g8alinqqcfd78onnl6; SA=aje9e3h7ck5je386slg6
VOICE=${VOICE:-alena}; MODEL=${MODEL:-yandexgpt-lite/latest}; KILL=${KILL_SWITCH:-0}
ENV="FOLDER_ID=$F,ALLOWED_ORIGINS=https://paulos99.github.io,MODEL=$MODEL,VOICE=$VOICE,MAX_PER_MIN=30,MAX_PER_HOUR=600,KILL_SWITCH=$KILL"
$Y serverless function version create --function-name karen-api --folder-id $F --runtime nodejs22 --entrypoint index.handler \
  --memory 256m --concurrency 8 --execution-timeout 20s --source-path src --service-account-id $SA --environment "$ENV" --secret name=karen-secrets,key=DEVICE_TOKEN,environment-variable=DEVICE_TOKEN --format json >/tmp/kv.json 2>&1 \
  ; python3 - <<'P'
import re
s=open('/tmp/kv.json').read()
m=re.search(r'"id":\s*"([a-z0-9]+)"',s)
print('deployed version',m.group(1)) if m and '"status": "ACTIVE"' in s else print('DEPLOY FAILED:', re.findall(r'message:.*',s)[:2])
P
rm -f /tmp/kv.json
