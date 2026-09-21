#!/usr/bin/env bash
# Round 4 QA: privacy/terms pages, footer legal column, super-admin Control Center journey
set -u
LOG=/home/z/my-project/tool-results/qa-round4.log
SHOTS=/home/z/my-project/tool-results/qa
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

cd /home/z/my-project
code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
log "root responded $code"
[ "$code" != "200" ] && { log "FATAL: dev server not up"; exit 1; }

agent-browser set viewport 1440 900 >/dev/null 2>&1

# 1. Platform gate BEFORE login (unauthenticated access must not leak data)
agent-browser open http://localhost:3000/platform >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "platform-anon: $(agent-browser eval "document.body.innerText.slice(0,160).replace(/\n/g,' | ')" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round4-platform-anon.png" >/dev/null 2>&1 && log "shot: round4-platform-anon"

# 2. Privacy page
agent-browser open http://localhost:3000/privacy >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
log "privacy-h1: $(agent-browser eval "document.querySelector('h1')?.innerText || 'MISSING'" 2>>"$LOG")"
log "privacy-sections: $(agent-browser eval "document.querySelectorAll('main section').length" 2>>"$LOG")"
log "privacy-ufmi: $(agent-browser eval "document.body.innerText.match(/UFMI/g)?.length || 0" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round4-privacy.png" >/dev/null 2>&1 && log "shot: round4-privacy"

# 3. Terms page
agent-browser open http://localhost:3000/terms >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
log "terms-h1: $(agent-browser eval "document.querySelector('h1')?.innerText || 'MISSING'" 2>>"$LOG")"
log "terms-sections: $(agent-browser eval "document.querySelectorAll('main section').length" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round4-terms.png" >/dev/null 2>&1 && log "shot: round4-terms"

# 4. Landing footer Legal column
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser eval "document.querySelector('footer').scrollIntoView({block:'end'})" >/dev/null 2>&1
agent-browser wait 800 >/dev/null 2>&1
log "footer-legal: $(agent-browser eval "(()=>{const n=document.querySelector('nav[aria-label=\"Legal\"]');return n? [...n.querySelectorAll('a')].map(a=>a.getAttribute('href')).join(','):'MISSING'})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round4-footer-legal.png" >/dev/null 2>&1 && log "shot: round4-footer-legal"

# 5. Super-admin login journey (React-safe fill: native setter + input event)
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser eval "
  const set=(sel,val)=>{const el=document.querySelector(sel);const proto=Object.getPrototypeOf(el);const desc=Object.getOwnPropertyDescriptor(proto,'value');desc.set.call(el,val);el.dispatchEvent(new Event('input',{bubbles:true}))};
  set('#organization','');
  set('#username','owner@ni.local');
  set('#password','Z2KF-Syy9-kRK2-yccp');
  'filled'
" >/dev/null 2>&1
agent-browser eval "document.querySelector('form button[type=submit]')?.click() || document.querySelector('form')?.requestSubmit()" >/dev/null 2>&1
agent-browser wait 2500 >/dev/null 2>&1
log "post-login-path: $(agent-browser eval "location.pathname" 2>>"$LOG")"
log "platform-authed: $(agent-browser eval "document.body.innerText.slice(0,300).replace(/\n/g,' | ')" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round4-platform-control-center.png" >/dev/null 2>&1 && log "shot: round4-platform-control-center"

# 6. Console errors across the journey
log "console-errors: $(agent-browser console 2>>"$LOG" | grep -ci "error" || true)"

# 7. Mobile: privacy overflow
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser open http://localhost:3000/privacy >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
log "privacy mobile overflowGap: $(agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>>"$LOG")"

log "DONE"
