#!/usr/bin/env bash
# Round 3 QA: pricing toggles (hardened state), login, mobile overflow, console
set -u
LOG=/home/z/my-project/tool-results/qa-round3.log
SHOTS=/home/z/my-project/tool-results/qa
: > "$LOG"
log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

cd /home/z/my-project
code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null)
log "root responded $code"
[ "$code" != "200" ] && { log "FATAL: dev server not up"; exit 1; }

agent-browser set viewport 1440 900 >/dev/null 2>&1
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1

# 1. Hero sanity
log "hero: $(agent-browser eval "document.querySelector('h1')?.innerText?.replace(/\n/g,' / ') || 'MISSING'" 2>>"$LOG")"

# 2. Pricing section — annual default
agent-browser eval "document.querySelector('#pricing').scrollIntoView()" >/dev/null 2>&1
agent-browser wait 1300 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/round3-pricing-annual.png" >/dev/null 2>&1 && log "shot: round3-pricing-annual"
log "annual business: $(agent-browser eval "(()=>{const c=[...document.querySelectorAll('#pricing article')].find(a=>a.textContent.includes('Business'));return c?.querySelector('p')?.nextElementSibling?.textContent?.slice(0,120)||c?.textContent?.slice(0,160)})()" 2>>"$LOG")"

# 3. Toggle -> Quarterly (real click)
agent-browser eval "[...document.querySelectorAll('#pricing button')].find(b=>b.textContent.includes('Quarterly'))?.click()" >/dev/null 2>&1
agent-browser wait 600 >/dev/null 2>&1
log "quarterly business: $(agent-browser eval "(()=>{const c=[...document.querySelectorAll('#pricing article')].find(a=>a.textContent.includes('Business'));return c?.textContent?.match(/UGX [0-9,]+ \/ month/)?.[0] + ' | billed ' + (c?.textContent?.match(/Billed UGX [0-9,]+/)?.[0]||''))()?.replace('null','NO-MATCH')})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round3-pricing-quarterly.png" >/dev/null 2>&1 && log "shot: round3-pricing-quarterly"

# 4. Toggle -> Monthly
agent-browser eval "[...document.querySelectorAll('#pricing button')].find(b=>b.textContent.trim().startsWith('Monthly'))?.click()" >/dev/null 2>&1
agent-browser wait 600 >/dev/null 2>&1
log "monthly business: $(agent-browser eval "(()=>{const c=[...document.querySelectorAll('#pricing article')].find(a=>a.textContent.includes('Business'));return (c?.textContent?.match(/UGX [0-9,]+ \/ month/)?.[0] + ' | billed ' + (c?.textContent?.match(/Billed UGX [0-9,]+/)?.[0]||''))?.replace('null','NO-MATCH')})()" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round3-pricing-monthly.png" >/dev/null 2>&1 && log "shot: round3-pricing-monthly"

# 5. CTA link carries the selected interval
log "cta-href: $(agent-browser eval "document.querySelector('#pricing article a[href*=plan]')?.getAttribute('href')" 2>>"$LOG")"

# 6. UFMI exposure check on landing
log "ufmi-strings: $(agent-browser eval "document.body.innerText.match(/UFMI/g)?.length || 0" 2>>"$LOG")"

# 7. Console errors
log "console-errors: $(agent-browser console 2>>"$LOG" | grep -ci "error" || true)"

# 8. Login page
agent-browser open http://localhost:3000/login >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
log "login-form: $(agent-browser eval "!!document.querySelector('input[type=password]') ? 'present' : 'MISSING'" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round3-login.png" >/dev/null 2>&1 && log "shot: round3-login"

# 9. Mobile viewport: overflow + hamburger + pricing stack
agent-browser set viewport 390 844 >/dev/null 2>&1
agent-browser open http://localhost:3000/ >/dev/null 2>&1
agent-browser wait 1500 >/dev/null 2>&1
log "mobile overflowGap: $(agent-browser eval "document.documentElement.scrollWidth - document.documentElement.clientWidth" 2>>"$LOG")"
agent-browser eval "[...document.querySelectorAll('header button')].pop()?.click()" >/dev/null 2>&1
agent-browser wait 500 >/dev/null 2>&1
log "mobile-menu: $(agent-browser eval "!!document.querySelector('nav[aria-label=\"Mobile navigation\"]') ? 'open' : 'MISSING'" 2>>"$LOG")"
agent-browser screenshot "$SHOTS/round3-mobile-menu.png" >/dev/null 2>&1 && log "shot: round3-mobile-menu"
agent-browser eval "[...document.querySelectorAll('nav[aria-label=\"Mobile navigation\"] a')].find(a=>a.textContent==='Pricing')?.click()" >/dev/null 2>&1
agent-browser wait 1200 >/dev/null 2>&1
agent-browser screenshot "$SHOTS/round3-mobile-pricing.png" >/dev/null 2>&1 && log "shot: round3-mobile-pricing"
log "mobile pricing cards: $(agent-browser eval "document.querySelectorAll('#pricing article').length" 2>>"$LOG")"

log "DONE"
