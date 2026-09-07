import { NextResponse } from "next/server";

// Strona logowania dla trybu AUTH_MODE=accounts (patrz lib/session.ts,
// middleware.ts). Gdy ten tryb nie jest włączony, ta strona i tak nie
// jest nigdzie używana (middleware w trybie Basic Auth w ogóle jej nie
// wymaga) — istnienie tego pliku nic nie zmienia w dotychczasowym
// działaniu, dopóki Kamil świadomie nie ustawi AUTH_MODE=accounts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Logowanie — FFP Cost Control</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon-192.png" type="image/png">
<meta name="theme-color" content="#0f6e4f">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 360px; background: #fff; border-radius: 16px;
    box-shadow: 0 8px 30px rgba(15,110,79,0.10); padding: 32px 28px;
  }
  h1 { font-size: 19px; margin: 0 0 4px; color: #0f2c22; }
  p.sub { margin: 0 0 24px; font-size: 13px; color: #6b7a75; }
  label { display: block; font-size: 13px; color: #33453e; margin-bottom: 6px; font-weight: 600; }
  input {
    width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #d9e2de;
    font-size: 15px; margin-bottom: 16px; background: #fbfdfc;
  }
  input:focus { outline: none; border-color: #0f6e4f; box-shadow: 0 0 0 3px rgba(15,110,79,0.15); }
  button {
    width: 100%; padding: 13px; border-radius: 10px; border: none; background: #0f6e4f;
    color: #fff; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button:disabled { opacity: 0.6; cursor: default; }
  .err {
    display: none; background: #fdeceb; color: #a5342a; border-radius: 8px; padding: 10px 12px;
    font-size: 13px; margin-bottom: 16px;
  }
</style>
</head>
<body>
  <form class="card" id="loginForm" autocomplete="on">
    <h1>FFP Cost Control</h1>
    <p class="sub">Zaloguj się, aby kontynuować.</p>
    <div class="err" id="err"></div>
    <label for="username">Login</label>
    <input id="username" name="username" autocomplete="username" required>
    <label for="password">Hasło</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit" id="submitBtn">Zaloguj</button>
  </form>
<script>
(function(){
  var form = document.getElementById('loginForm');
  var err = document.getElementById('err');
  var btn = document.getElementById('submitBtn');
  var params = new URLSearchParams(window.location.search);
  var rawNext = params.get('next') || '/';
  // Tylko ścieżka względna w obrębie tej appki (nigdy zewnętrzny adres) —
  // "next" pochodzi z parametru URL, którego treść mógł ustawić ktokolwiek
  // linkujący do strony logowania, nie tylko middleware.ts.
  var next = (rawNext.indexOf('/') === 0 && rawNext.indexOf('//') !== 0) ? rawNext : '/';
  form.addEventListener('submit', function(e){
    e.preventDefault();
    err.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Logowanie…';
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    }).then(function(r){ return r.json().then(function(data){ return { ok: r.ok, data: data }; }); })
      .then(function(res){
        if (!res.ok) {
          err.textContent = res.data && res.data.error === 'invalid_credentials'
            ? 'Nieprawidłowy login lub hasło.'
            : 'Nie udało się zalogować. Spróbuj ponownie.';
          err.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Zaloguj';
          return;
        }
        window.location.href = next;
      })
      .catch(function(){
        err.textContent = 'Błąd połączenia. Spróbuj ponownie.';
        err.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Zaloguj';
      });
  });
})();
</script>
</body>
</html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, must-revalidate"
    }
  });
}
