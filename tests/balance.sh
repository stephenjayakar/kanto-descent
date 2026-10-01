#!/bin/sh
# usage: tests/balance.sh "<query>" seconds  -> runs the smart bot from a dev room and reports
B=tests/b.sh
$B "{\"cmd\":\"goto\",\"url\":\"http://localhost:8092/?$1\"}" >/dev/null
$B '{"cmd":"wait","ms":2500}' >/dev/null
$B '{"cmd":"eval","js":"G.meta.history=[]; import(\"./src/dev/autoplay.js\").then(m=>{window.__stop=m.start({smart:true})}); 1"}' >/dev/null
sleep $2
$B '{"cmd":"eval","js":"({log: window.__autolog.filter(x=>!x.startsWith(\"STUCK\")).slice(-12), hist: G.meta.history.map(h=>[h.level,h.biome,h.room,h.time,h.won]), lvl: G.run.level, hp: G.run.hp|0, boons: G.run.boons.map(b=>b.key)})"}'
