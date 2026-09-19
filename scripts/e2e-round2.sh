#!/bin/bash
# Round 2: verify UFMI ADMIN portal render (longer compile wait), plan order fix, trial notes.
cd /home/z/my-project

setsid nohup ./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 2; CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 4); [ "$CODE" = "200" ] && break; done
echo "SERVER_READY=$CODE"

echo "=== [A] trial request notes (findFirst) ==="
node -e "
const dotenv=require('dotenv');dotenv.config({path:'.env'});
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{const t=await p.trialRequest.findFirst({where:{contactEmail:'pricing-probe@example.test'},orderBy:{createdAt:'desc'}});console.log('notes:',t?.notes ?? 'NULL');await p.\$disconnect();})()
" 2>/dev/null | grep notes

echo "=== [B] browser: UFMI ADMIN login -> portal (10s wait) ==="
agent-browser set viewport 1280 800 > /dev/null 2>&1
agent-browser open http://localhost:3000/login 2>&1 | tail -1
agent-browser wait 1000 > /dev/null 2>&1
agent-browser eval "
(() => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('organization', 'ufmi');
  set('username', 'Admin');
  set('password', 'Admin@UFMI256');
  return 'filled';
})()
" 2>&1 | tail -1
agent-browser click "button[type=submit]" 2>&1 | tail -1
agent-browser wait 10000 > /dev/null 2>&1
agent-browser eval "window.location.pathname" 2>&1 | tail -1
agent-browser screenshot /tmp/qa-shots/ufmi-admin-portal2.png 2>&1 | tail -1

echo "=== [C] admin portal admin-view data check ==="
agent-browser eval "
(() => {
  const body = document.body.innerText;
  return {
    hasUfmiBranding: /UFMI|Federation|Portal/i.test(body),
    hasOverview: /Overview|overview/i.test(body),
    sample: body.slice(0, 220).replace(/\n+/g, ' | '),
  };
})()
" 2>&1 | tail -1

echo "=== [D] plan order on landing ==="
agent-browser open http://localhost:3000/ 2>&1 | tail -1
agent-browser wait 1500 > /dev/null 2>&1
agent-browser eval "
(() => {
  document.getElementById('pricing').scrollIntoView();
  return [...document.querySelectorAll('#pricing article h3')].map((h) => h.textContent).join(',');
})()
" 2>&1 | tail -1
agent-browser wait 700 > /dev/null 2>&1
agent-browser screenshot /tmp/qa-shots/pricing-order.png 2>&1 | tail -1
echo "ROUND2_DONE"
