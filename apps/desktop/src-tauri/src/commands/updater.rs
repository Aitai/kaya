//! Pre-flight check for the in-app updater.
//!
//! Installing an update on macOS is two renames: the running bundle is moved
//! out to a temp directory, and the freshly downloaded one is moved into its
//! place. Both need a writable parent directory, and two common situations
//! don't have one:
//!
//! - the app is running straight from the mounted `.dmg`, which is read-only;
//! - Gatekeeper translocated it — an app launched from a quarantined location
//!   without being moved by Finder runs from a random read-only mount under
//!   `/private/var/folders/.../AppTranslocation/`.
//!
//! In both cases the rename fails with `EROFS`/`EPERM` after the whole 110 MB
//! payload has been downloaded, and the user is told the update failed with no
//! way to act on it. Checking first costs nothing and lets the app say the one
//! thing that helps: move Kaya to Applications and reopen it.

/// Why an in-place update can't run. `None` when it can.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePreflight {
    pub can_install: bool,
    /// `"translocated"` or `"readOnly"` — a key the frontend maps to a message.
    pub reason: Option<String>,
    /// The bundle the updater would replace, for the message.
    pub path: String,
}

impl UpdatePreflight {
    fn ok(path: String) -> Self {
        Self { can_install: true, reason: None, path }
    }

    #[cfg(target_os = "macos")]
    fn blocked(reason: &str, path: String) -> Self {
        Self { can_install: false, reason: Some(reason.to_string()), path }
    }
}

/// The bundle the updater replaces, for this process.
#[cfg(desktop)]
fn bundle_path() -> Option<std::path::PathBuf> {
    bundle_from_exe(&std::env::current_exe().ok()?)
}

/// `Foo.app` on macOS, the executable's own directory elsewhere. Mirrors the
/// plugin's `extract_path`; kept pure so the bundle layout can be tested.
#[cfg(desktop)]
fn bundle_from_exe(exe: &std::path::Path) -> Option<std::path::PathBuf> {
    let dir = exe.parent()?;

    #[cfg(target_os = "macos")]
    if dir.ends_with("Contents/MacOS") {
        return dir.parent()?.parent().map(std::path::Path::to_path_buf);
    }

    Some(dir.to_path_buf())
}

/// Stub for mobile: there is no in-app updater there.
#[cfg(not(desktop))]
#[tauri::command]
pub fn update_preflight() -> UpdatePreflight {
    UpdatePreflight::ok(String::new())
}

/// Windows hands the payload to an elevating NSIS installer, and the Linux
/// AppImage path has no failure that can be told apart from an ordinary
/// permission error without guessing. Nothing to check on either.
#[cfg(all(desktop, not(target_os = "macos")))]
#[tauri::command]
pub fn update_preflight() -> UpdatePreflight {
    UpdatePreflight::ok(bundle_path().map(|p| p.display().to_string()).unwrap_or_default())
}

/// Can the updater replace this install in place?
#[cfg(all(desktop, target_os = "macos"))]
#[tauri::command]
pub fn update_preflight() -> UpdatePreflight {
    let Some(bundle) = bundle_path() else {
        return UpdatePreflight::ok(String::new());
    };
    let path = bundle.display().to_string();

    if path.contains("/AppTranslocation/") {
        return UpdatePreflight::blocked("translocated", path);
    }

    // The rename happens in the parent directory, so that is what has to be
    // writable — the bundle's own permissions say nothing about it.
    let Some(parent) = bundle.parent() else {
        return UpdatePreflight::ok(path);
    };

    let probe = parent.join(format!(".kaya-update-check-{}", std::process::id()));
    match std::fs::File::create(&probe) {
        Ok(_) => {
            let _ = std::fs::remove_file(&probe);
            UpdatePreflight::ok(path)
        }
        Err(_) => UpdatePreflight::blocked("readOnly", path),
    }
}

#[cfg(all(test, desktop, target_os = "macos"))]
mod tests {
    use super::bundle_from_exe;
    use std::path::{Path, PathBuf};

    #[test]
    fn resolves_the_app_bundle_from_the_executable() {
        assert_eq!(
            bundle_from_exe(Path::new("/Applications/Kaya.app/Contents/MacOS/kaya")),
            Some(PathBuf::from("/Applications/Kaya.app"))
        );
    }

    #[test]
    fn a_loose_binary_keeps_its_own_directory() {
        assert_eq!(
            bundle_from_exe(Path::new("/usr/local/bin/kaya")),
            Some(PathBuf::from("/usr/local/bin"))
        );
    }

    #[test]
    fn a_translocated_bundle_is_still_recognised() {
        let exe = "/private/var/folders/ab/cd/T/AppTranslocation/1234/d/Kaya.app/Contents/MacOS/kaya";
        let bundle = bundle_from_exe(Path::new(exe)).expect("bundle");
        assert!(bundle.display().to_string().contains("/AppTranslocation/"));
        assert!(bundle.ends_with("Kaya.app"));
    }
}
