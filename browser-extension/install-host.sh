#!/bin/bash

HOST_NAME="com.emreconf.confpass"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_JSON="$SCRIPT_DIR/native-messaging-host.json"

if [ ! -f "$HOST_JSON" ]; then
    echo "native-messaging-host.json bulunamadı!"
    exit 1
fi

if [[ "$OSTYPE" == "darwin"* ]]; then
    CHROME_PATH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    EDGE_PATH="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CHROME_PATH="$HOME/.config/google-chrome/NativeMessagingHosts"
    EDGE_PATH="$HOME/.config/microsoft-edge/NativeMessagingHosts"
fi

if [ -d "$CHROME_PATH" ]; then
    cp "$HOST_JSON" "$CHROME_PATH/$HOST_NAME.json"
    echo "Chrome native messaging host kaydedildi"
fi

if [ -d "$EDGE_PATH" ]; then
    cp "$HOST_JSON" "$EDGE_PATH/$HOST_NAME.json"
    echo "Edge native messaging host kaydedildi"
fi

echo "Native messaging host kurulumu tamamlandı!"
