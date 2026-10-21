#!/bin/zsh
cd "$(dirname "$0")/interface" || exit 1
node launch.mjs
if [ $? -ne 0 ]; then
  echo 'Press Return to close.'
  read
fi
