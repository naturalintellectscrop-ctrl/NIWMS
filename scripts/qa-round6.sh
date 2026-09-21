#!/usr/bin/env bash
# Round 6 QA: 2-week trial visibility + UFMI no-payment (complimentary) special case
set -u
LOG=/home/z/my-project/tool-results/qa-round6.log
SHOTS=/home/z/my-project/tool-results/qa
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

cd /home/z/my-project
mkdir -p "$SHOTS"

agent-browser set viewport 1440 900 >/dev/null 2>&1

# 1. Platform owner → Control Center
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser fill '#username' 'owner@ni.local' >>"$LOG" 2>&1
agent-browser fill '#password' 'OwnerQa-2026-Pw' >>"$LOG" 2>&1
agent-browser click 'button[type=submit]' >>"$LOG" 2>&1
agent-browser wait 2500 >/dev/null 2>&1
log "owner post-login url: $(agent-browser eval "location.pathname" 2>>"$LOG")"

# 2. UFMI row: Complimentary plan chip + No-payment-required time frame
log "ufmi-row: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Movie Industry'));return r?r.textContent.replace(/\s+/g,' ').slice(0,260):'MISSING'})()" 2>>"$LOG")"

# 3. Filter chips (Complimentary present + count)
log "filter-chips: $(agent-browser eval "[...document.querySelectorAll('main button')].filter(b=>['All','Active','Trial','Paused','Off','Banned','Complimentary'].includes(b.textContent.trim().replace(/\\d+$/,'').trim())).map(b=>b.textContent.trim()).join(' | ')" 2>>"$LOG")"

# 4. MRR hint mentions complimentary exclusion
log "mrr-hint: $(agent-browser eval "(()=>{const c=[...document.querySelectorAll('main p')].find(p=>p.textContent==='Estimated MRR');const card=c?.closest('div').parentElement;return card?.querySelector('.text-xs')?.textContent || 'MISSING'})()" 2>>"$LOG")"

# 5. UFMI manage menu: should offer REMOVE no-payment flag (not mark)
agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Movie Industry'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return btn?'menu-opened':'NO-BUTTON'})()" >/dev/null 2>&1
agent-browser wait 500 >/dev/null 2>&1
log "ufmi-menu: $(agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].map(i=>i.textContent.trim()).join(' | ')" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round6-ufmi-row-menu.png" >/dev/null 2>&1 && log "shot: ufmi-row-menu"
agent-browser eval "(()=>{document.querySelector('[aria-hidden][tabindex=\"-1\"]')?.click();return 'closed'})()" >/dev/null 2>&1

# 6. Toggle test on a trial org (Kampala Greenservices): mark exempt → rescue; then revert → recompute
agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Greenservices'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return 'ok'})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('Mark as no-payment'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "exempt-flash: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,150) || 'NO-FLASH'" 2>>"$LOG")"
log "greenservices-after-exempt: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Greenservices'));return r?r.textContent.replace(/\s+/g,' ').slice(0,200):'MISSING'})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round6-exempt-granted.png" >/dev/null 2>&1 && log "shot: exempt-granted"

agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Greenservices'));const btn=r&&[...r.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('Actions'));btn?.click();return 'ok'})()" >/dev/null 2>&1
agent-browser wait 400 >/dev/null 2>&1
agent-browser eval "[...document.querySelectorAll('[role=menu] [role=menuitem]')].find(i=>i.textContent.includes('Remove no-payment flag'))?.click()" >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "revoke-flash: $(agent-browser eval "document.querySelector('[role=status]')?.textContent?.slice(0,150) || 'NO-FLASH'" 2>>"$LOG")"
log "greenservices-after-revoke: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));const r=t&&[...t.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('Kampala Greenservices'));return r?r.textContent.replace(/\s+/g,' ').slice(0,200):'MISSING'})()" 2>>"$LOG")"

# 7. Complimentary filter chip works
agent-browser eval "[...document.querySelectorAll('main button')].find(b=>b.textContent.includes('Complimentary'))?.click()" >/dev/null 2>&1
agent-browser wait 600 >/dev/null 2>&1
log "exempt-filter-rows: $(agent-browser eval "(()=>{const tables=[...document.querySelectorAll('section table')];const t=tables.find(x=>x.textContent.includes('Time frame'));return t?t.querySelectorAll('tbody tr').length:'MISSING'})()" 2>>"$LOG")"
agent-browser eval "[...document.querySelectorAll('main button')].find(b=>b.textContent.trim().startsWith('All'))?.click()" >/dev/null 2>&1

# 8. UFMI admin login (real legacy credential) — exempt org with expired trial clock must log in
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1000 >/dev/null 2>&1
# logout owner first via API + fresh page
agent-browser eval "fetch('/api/auth/logout',{method:'POST'}).then(()=>'logged-out')" >/dev/null 2>&1
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser fill '#organization' 'ufmi' >>"$LOG" 2>&1
agent-browser fill '#username' 'Admin' >>"$LOG" 2>&1
agent-browser fill '#password' 'Admin@UFMI256' >>"$LOG" 2>&1
agent-browser click 'button[type=submit]' >>"$LOG" 2>&1
agent-browser wait 2500 >/dev/null 2>&1
log "ufmi post-login url: $(agent-browser eval "location.pathname" 2>>"$LOG")"
log "ufmi me: $(agent-browser eval "fetch('/api/auth/me',{credentials:'include'}).then(r=>r.json()).then(j=>JSON.stringify({lifecycle:j.lifecycleStatus,mode:j.billingMode,trial:j.trialEndsAt,org:j.organizationName})).catch(e=>'ERR')" 2>>"$LOG")"
# UFMI admin visiting billing sees the complimentary card
agent-browser open http://localhost:3000/app/billing >/dev/null 2>&1
agent-browser wait 1800 >/dev/null 2>&1
log "ufmi-billing-h1: $(agent-browser eval "document.querySelector('h1')?.innerText || 'MISSING'" 2>>"$LOG")"
log "ufmi-billing-card: $(agent-browser eval "(()=>{const p=[...document.querySelectorAll('main h2')].find(h=>h.textContent.includes('No payment required'));return p?'COMPLIMENTARY-CARD-RENDERED':'MISSING'})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round6-ufmi-billing.png" >/dev/null 2>&1 && log "shot: ufmi-billing"

# 9. Trial admin: sidebar chip shows countdown, billing page shows 14-day trial copy
agent-browser eval "fetch('/api/auth/logout',{method:'POST'})" >/dev/null 2>&1
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser fill '#organization' 'synthetic-org-a' >>"$LOG" 2>&1
agent-browser fill '#username' 'syntheticorga.orgadmin@example.test' >>"$LOG" 2>&1
agent-browser fill '#password' 'Ni#Synthetic2026' >>"$LOG" 2>&1
agent-browser click 'button[type=submit]' >>"$LOG" 2>&1
agent-browser wait 3000 >/dev/null 2>&1
log "trial post-login url: $(agent-browser eval "location.pathname" 2>>"$LOG")"
log "trial-sidebar-chip: $(agent-browser eval "(()=>{const links=[...document.querySelectorAll('a[href=\"/app/billing\"]')];return links.map(l=>l.textContent.trim()).join(' :: ') || 'MISSING'})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round6-trial-sidebar.png" >/dev/null 2>&1 && log "shot: trial-sidebar"
agent-browser open http://localhost:3000/app/billing >/dev/null 2>&1
agent-browser wait 1800 >/dev/null 2>&1
log "trial-billing-lifecycle: $(agent-browser eval "(()=>{const p=[...document.querySelectorAll('main p')].find(x=>x.textContent.includes('14-day free trial'));return p?p.textContent.trim().slice(0,160):'MISSING'})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round6-trial-billing.png" >/dev/null 2>&1 && log "shot: trial-billing"

# 10. Mobile overflow check on control center
agent-browser eval "fetch('/api/auth/logout',{method:'POST'})" >/dev/null 2>&1
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1000 >/dev/null 2>&1
agent-browser fill '#username' 'owner@ni.local' >>"$LOG" 2>&1
agent-browser fill '#password' 'OwnerQa-2026-Pw' >>"$LOG" 2>&1
agent-browser click 'button[type=submit]' >>"$LOG" 2>&1
agent-browser wait 2500 >/dev/null 2>&1
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser wait 800 >/dev/null 2>&1
log "mobile-overflow: $(agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round6-mobile-platform.png" >/dev/null 2>&1 && log "shot: mobile-platform"

# 11. Console errors + UFMI string sweep
agent-browser set viewport 1440 900 >/dev/null 2>&1
log "console-errors: $(agent-browser console 2>>"$LOG" | grep -ci error || true)"
log "console-total: $(agent-browser console 2>>"$LOG" | wc -l)"

log "QA round 6 complete"
