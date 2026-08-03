// MarketAnalyse.app — native window over locally-managed services (spec §7).
// Owns only the Next.js web server (spawned from the repo's standalone build);
// Argus, the odte backend, IBKR Gateway, and the nightly pipeline stay under
// launchd exactly as in dev.
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

const PORT: u16 = 3210;

struct ServerChild(Mutex<Option<Child>>);

fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_millis(300)).is_ok()
}

fn repo_dir() -> PathBuf {
    // $HOME, not a literal home directory: the old fallback shipped one
    // machine's username inside a public repo and resolved to nothing anywhere
    // else. MARKET_ANALYSE_DIR still wins when the checkout lives elsewhere.
    if let Ok(dir) = std::env::var("MARKET_ANALYSE_DIR") {
        return dir.into();
    }
    match std::env::var("HOME") {
        Ok(home) => PathBuf::from(home).join("Market_Analyse"),
        Err(_) => PathBuf::from("Market_Analyse"),
    }
}

fn find_node() -> String {
    for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
        if std::path::Path::new(p).exists() {
            return p.into();
        }
    }
    "node".into()
}

fn spawn_server() -> Option<Child> {
    let repo = repo_dir();
    let dash = repo.join("dashboard");
    // dist-app is the build:standalone output — lives outside .next so that
    // `next dev` (which rewrites .next) can never clobber the app's server.
    let server = dash.join("dist-app/server.js");
    if !server.exists() {
        log::error!("standalone build missing: {}", server.display());
        return None;
    }
    Command::new(find_node())
        .arg(server)
        .current_dir(&dash)
        .env("PORT", PORT.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("ARGUS_DB", repo.join("argus.db"))
        .env("BRIDGE_DIR", repo.join("reports"))
        .env(
            "MARKET_REVIEW_DIR",
            repo.parent().map(|p| p.join("Market_Review")).unwrap_or_default(),
        )
        .spawn()
        .ok()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .manage(ServerChild(Mutex::new(None)))
        .setup(|app| {
            // Reuse an already-running server (e.g. npm run dev on 3210 or a
            // stale instance); otherwise spawn ours and wait until it answers.
            let child = if port_open(PORT) {
                None
            } else {
                let c = spawn_server();
                for _ in 0..75 {
                    if port_open(PORT) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                c
            };
            *app.state::<ServerChild>().0.lock().unwrap() = child;

            // If the server never came up, show the bundled error page instead
            // of a white window pointed at a dead port.
            let url = if port_open(PORT) {
                WebviewUrl::External(format!("http://127.0.0.1:{PORT}").parse().unwrap())
            } else {
                log::error!("dashboard server not reachable on {PORT}");
                WebviewUrl::App("index.html".into())
            };
            WebviewWindowBuilder::new(app, "main", url)
                .title("Market Analyse")
                .inner_size(1440.0, 900.0)
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut c) = app.state::<ServerChild>().0.lock().unwrap().take() {
                    let _ = c.kill();
                    let _ = c.wait();
                }
            }
        });
}
