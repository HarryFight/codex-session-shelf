#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, File, OpenOptions},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

struct LauncherState {
    child: Mutex<Option<Child>>,
    data_directory: PathBuf,
    log_path: PathBuf,
}

fn data_directory() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("HOME is unavailable")?;
    #[cfg(target_os = "macos")]
    return Ok(PathBuf::from(home).join("Library/Application Support/Codex Session Shelf"));
    #[cfg(not(target_os = "macos"))]
    return Ok(PathBuf::from(home).join(".local/share/codex-session-shelf"));
}

fn log_path() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME").ok_or("HOME is unavailable")?;
    #[cfg(target_os = "macos")]
    return Ok(PathBuf::from(home).join("Library/Logs/Codex Session Shelf/session-shelf-launcher.log"));
    #[cfg(not(target_os = "macos"))]
    return Ok(PathBuf::from(home).join(".local/state/codex-session-shelf/launcher.log"));
}

fn sidecar_path(_app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        return Ok(executable.parent().ok_or("launcher directory is unavailable")?.join("node"));
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(_app.path().resource_dir().map_err(|error| error.to_string())?.join("node"))
    }
}

fn open_log(path: &Path) -> Result<File, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    OpenOptions::new().create(true).append(true).open(path).map_err(|error| error.to_string())
}

fn start_child(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<LauncherState>();
    let mut current = state.child.lock().map_err(|_| "launcher state is unavailable")?;
    if let Some(child) = current.as_mut() {
        if child.try_wait().map_err(|error| error.to_string())?.is_none() {
            return Ok(());
        }
    }
    fs::create_dir_all(&state.data_directory).map_err(|error| error.to_string())?;
    let resource_root = app.path().resource_dir().map_err(|error| error.to_string())?.join("app");
    let stdout = open_log(&state.log_path)?;
    let stderr = stdout.try_clone().map_err(|error| error.to_string())?;
    let child = Command::new(sidecar_path(app)?)
        .arg(resource_root.join("scripts/inject.mjs"))
        .args(["--launch", "--watch", "--open", "--port", "58924", "--service-port", "47824"])
        .current_dir(&resource_root)
        .env("CODEX_SESSION_SHELF_DATA_DIR", &state.data_directory)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|error| error.to_string())?;
    *current = Some(child);
    Ok(())
}

fn stop_child(app: &AppHandle) {
    let state = app.state::<LauncherState>();
    if let Ok(mut current) = state.child.lock() {
        if let Some(child) = current.as_mut() {
            #[cfg(unix)]
            unsafe {
                libc::kill(child.id() as i32, libc::SIGTERM);
            }
            for _ in 0..30 {
                if child.try_wait().ok().flatten().is_some() {
                    *current = None;
                    return;
                }
                thread::sleep(Duration::from_millis(100));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
        *current = None;
    };
}

fn open_shelf(app: &AppHandle) {
    let state = app.state::<LauncherState>();
    let signalled = state.child.lock().ok().and_then(|mut current| {
        let child = current.as_mut()?;
        if child.try_wait().ok().flatten().is_some() {
            return None;
        }
        #[cfg(unix)]
        unsafe {
            libc::kill(child.id() as i32, libc::SIGUSR1);
        }
        Some(())
    }).is_some();
    if !signalled {
        if let Err(error) = start_child(app) {
            eprintln!("Unable to start Codex Session Shelf: {error}");
        }
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| open_shelf(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            let data_directory = data_directory().map_err(std::io::Error::other)?;
            let log_path = log_path().map_err(std::io::Error::other)?;
            app.manage(LauncherState { child: Mutex::new(None), data_directory, log_path });

            let open = MenuItem::with_id(app, "open", "打开会话书架", true, None::<&str>)?;
            let autostart = CheckMenuItem::with_id(
                app,
                "autostart",
                "登录时启动",
                true,
                app.autolaunch().is_enabled().unwrap_or(false),
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "退出会话书架", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &autostart, &quit])?;
            TrayIconBuilder::new()
                .title("书架")
                .tooltip("Codex Session Shelf")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => open_shelf(app),
                    "autostart" => {
                        let manager = app.autolaunch();
                        if manager.is_enabled().unwrap_or(false) { let _ = manager.disable(); } else { let _ = manager.enable(); }
                    }
                    "quit" => {
                        stop_child(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            start_child(app.handle()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build Codex Session Shelf")
        .run(|app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                stop_child(app);
            }
        });
}
