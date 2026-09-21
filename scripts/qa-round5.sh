#!/usr/bin/env bash
# Round 5 QA: platform Control Center — income KPIs, client management actions, time-engine UI
set -u
LOG=/home/z/my-project/tool-results/qa-round5.log
SHOTS=/home/z/my-project/tool-results/qa
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

cd /home/z/my-project
mkdir -p "$SHOTS"

# 0. Seed demo clients, restart server on fresh Prisma client
bun scripts/qa-seed-clients.ts >>"$LOG" 2>&1 && log "demo clients seeded"
log "restarting dev server..."
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null; sleep 2
setsid nohup bun run dev >> dev.log 2>&1 &
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 1
done
log "root responded $code"
[ "$code" != "200" ] && { log "FATAL: dev server not up"; exit 1; }

agent-browser set viewport 1440 900 >/dev/null 2>&1

# 1. Login as platform owner (org left blank — super_admin)
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser fill '#username' 'owner@ni.local' >>"$LOG" 2>&1
agent-browser fill '#password' 'OwnerQa-2026-Pw' >>"$LOG" 2>&1
agent-browser click 'button[type=submit]' >>"$LOG" 2>&1
agent-browser wait 2500 >/dev/null 2>&1
log "post-login url: $(agent-browser eval "location.pathname" 2>>"$LOG")"

# 2. Control Center renders with income row
log "h1: $(agent-browser eval "document.querySelector('h1')?.innerText || 'MISSING'" 2>>"$LOG")"
log "mrr-card: $(agent-browser eval "(()=>{const c=[...document.querySelectorAll('main p')].find(p=>p.textContent==='Estimated MRR');const card=c?.closest('div');return card?.querySelector('.tabular-nums')?.textContent || 'MISSING'})()" 2>>"$LOG")"
log "paused-card: $(agent-browser eval "(()=>{const c=[...document.querySelectorAll('main p')].find(p=>p.textContent==='Paused clients');const card=c?.closest('div');return card?.querySelector('.tabular-nums')?.textContent || 'MISSING'})()" 2>>"$LOG")"
agent-browser eval "window.scrollTo(0,0)" >/dev/null 2>&1
agent-browser screenshot "$SHOTS/round5-control-center-top.png" >/dev/null 2>&1 && log "shot: control-center-top"

# 3. Clients table
log "clients-rows: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));return t?t.querySelectorAll('tbody tr').length:'MISSING'})()" 2>>"$LOG")"
log "kampala-row: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Logistics'));return r?r.textContent.replace(/\s+/g,' ').slice(0,200):'MISSING'})()" 2>>"$LOG")"
log "pearl-row: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Pearl Accounting'));return r?r.textContent.replace(/\s+/g,' ').slice(0,200):'MISSING'})()" 2>>"$LOG")"

# 4. Extend action: +30 days on Kampala Logistics
agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Logistics'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return btn?'menu-opened':'NO-BUTTON'})()" >>"$LOG" 2>&1
agent-browser wait 500 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/round5-manage-menu.png" >/dev/null 2>&1 && log "shot: manage-menu"
log "menu-items: $(agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(i=>i.textContent.trim()).join(' | ')" 2>>"$LOG")"
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('+30 days'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "flash-after-extend: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,140) || 'NO-FLASH'" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round5-after-extend.png" >/dev/null 2>&1 && log "shot: after-extend"

# 5. Suspend (turn off) then reactivate
agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Logistics'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return 'ok'})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('Turn off'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "suspend-flash: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,120) || 'NO-FLASH'" 2>>"$LOG")"
log "kampala-status-badge: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Logistics'));const cell=r?.querySelectorAll('td')[1];return cell?.textContent.trim()||'MISSING'})()" 2>>"$LOG")"

agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Logistics'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return 'ok'})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('Turn back on'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "reactivate-flash: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,120) || 'NO-FLASH'" 2>>"$LOG")"

# 6. Ban via modal (with reason), verify badge, then unban
agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Nile Agri Coop'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return 'ok'})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('Ban client'))?.click()" >/dev/null 2>&1
agent-browser wait 500 >/dev/null 2>&1
agent-browser fill '#ban-reason' 'QA verification ban' >>"$LOG" 2>&1
agent-browser screenshot "$SHOTS/round5-ban-modal.png" >/dev/null 2>&1 && log "shot: ban-modal"
agent-browser eval "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.includes('Ban client'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "ban-flash: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,130) || 'NO-FLASH'" 2>>"$LOG")"
log "nile-badge-after-ban: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Nile Agri Coop'));const cell=r?.querySelectorAll('td')[1];return cell?.textContent.trim()||'MISSING'})()" 2>>"$LOG")"

agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Nile Agri Coop'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return 'ok'})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('Unban'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "unban-flash: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,130) || 'NO-FLASH'" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round5-clients-final.png" >/dev/null 2>&1 && log "shot: clients-final"

# 7. Banned login enforcement: UFMI tenant stays accessible, banned org login blocked is API-level (not probed here)

# 8. Mobile overflow check
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser wait 800 >/dev/null 2>&1
log "mobile-overflow: $(agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round5-mobile.png" >/dev/null 2>&1 && log "shot: mobile"

# 9. Console errors
agent-browser set viewport 1440 900 >/dev/null 2>&1
log "console-errors: $(agent-browser console 2>>"$LOG" | grep -ci error || true)"

log "QA round 5 complete"
