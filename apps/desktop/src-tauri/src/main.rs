// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};

mod commands;
mod onnx_engine;
mod window_state;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        // Note: We still use the window-state plugin for basic state persistence,
        // but our custom window_state module handles monitor-aware positioning
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            commands::onnx_start_upload,
            commands::onnx_upload_chunk,
            commands::onnx_finish_upload,
            commands::onnx_get_cached_model,
            commands::onnx_delete_cached_model,
            commands::onnx_initialize,
            commands::onnx_initialize_base64,
            commands::onnx_initialize_from_path,
            commands::onnx_analyze,
            commands::onnx_analyze_batch,
            commands::onnx_dispose,
            commands::onnx_is_initialized,
            commands::onnx_get_provider_info,
            commands::onnx_get_available_providers,
            commands::onnx_set_provider_preference,
            commands::onnx_get_provider_preference,
        ])
        .setup(|app| {
            // Restore window state for the current monitor setup
            if let Some(window) = app.get_webview_window("main") {
                window_state::restore_window_state(&window, app.handle());
            }

            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu, AboutMetadata};
            let handle = app.handle();

            // Create about metadata with app information
            // Version comes from Cargo.toml automatically, detailed build info is in the app footer
            let about_metadata = AboutMetadata {
                name: Some("Kaya".to_string()),
                version: Some(env!("CARGO_PKG_VERSION").to_string()),
                copyright: Some("© 2025 Kaya Team".to_string()),
                license: Some("AGPL-3.0".to_string()),
                website: Some("https://github.com/kaya-go/kaya".to_string()),
                website_label: Some("GitHub Repository".to_string()),
                comments: Some("A beautiful Go game application with AI analysis powered by KataGo".to_string()),
                ..Default::default()
            };

            let check_update = MenuItem::with_id(
                handle,
                "check_update",
                "Check for Updates...",
                true,
                None::<&str>,
            )?;

            #[cfg(target_os = "macos")]
            {
                // Create the application menu (Kaya)
                let app_menu = Submenu::new(handle, "Kaya", true)?;
                app_menu.append(&PredefinedMenuItem::about(
                    handle,
                    None::<&str>,
                    Some(about_metadata.clone()),
                )?)?;
                app_menu.append(&PredefinedMenuItem::separator(handle)?)?;
                app_menu.append(&check_update)?;
                app_menu.append(&PredefinedMenuItem::separator(handle)?)?;
                app_menu.append(&PredefinedMenuItem::services(handle, None::<&str>)?)?;
                app_menu.append(&PredefinedMenuItem::separator(handle)?)?;
                app_menu.append(&PredefinedMenuItem::hide(handle, None::<&str>)?)?;
                app_menu.append(&PredefinedMenuItem::hide_others(handle, None::<&str>)?)?;
                app_menu.append(&PredefinedMenuItem::show_all(handle, None::<&str>)?)?;
                app_menu.append(&PredefinedMenuItem::separator(handle)?)?;
                app_menu.append(&PredefinedMenuItem::quit(handle, None::<&str>)?)?;

                let menu = Menu::with_items(handle, &[&app_menu])?;
                app.set_menu(menu)?;
            }

            // On Linux/Windows, show an About menu with update check and about info
            #[cfg(not(target_os = "macos"))]
            {
                let about_menu = Submenu::new(handle, "About", true)?;
                about_menu.append(&PredefinedMenuItem::about(handle, None::<&str>, Some(about_metadata))?)?;
                about_menu.append(&PredefinedMenuItem::separator(handle)?)?;
                about_menu.append(&check_update)?;

                let menu = Menu::with_items(handle, &[&about_menu])?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "check_update" {
                let _ = app.emit("check-update", ());
            }
        })
        .on_window_event(|window, event| {
            // Save window state when the window is about to close
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    window_state::save_window_state_from_window(window, window.app_handle());
                }
            }
            // Also save on move/resize for more frequent persistence
            if let tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) = event {
                if window.label() == "main" {
                    window_state::save_window_state_from_window(window, window.app_handle());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
