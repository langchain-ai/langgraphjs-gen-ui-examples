#!/bin/bash
sudo chown -R node:node node_modules
sudo chown -R node:node .pnpm-store

FILE=".env"

if [ ! -f "$FILE" ]; then
    echo "$FILE doesn't exist. Creating..."
    cp .env.example .env
    echo "$FILE file created."
else
    echo "$FILE already created."
fi

sudo corepack enable
pnpm i