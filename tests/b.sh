#!/bin/sh
# usage: tests/b.sh '{"cmd":"eval","js":"1+1"}'
curl -s -X POST --data "$1" http://127.0.0.1:9533
echo
