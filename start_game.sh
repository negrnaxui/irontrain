#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
    exec python3 ./server.py
elif command -v python >/dev/null 2>&1; then
    exec python ./server.py
else
    echo "Python 3 was not found. Install Python 3 and run this script again."
    echo "https://www.python.org/downloads/"
    read -r -p "Press Enter to close..."
    exit 1
fi
