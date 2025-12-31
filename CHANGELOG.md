# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-12-31

### <!-- 0 -->🚀 Features

- *(ui)* Enable undo/redo keyboard shortcuts globally ([dfbb57d](https://github.com/kaya-go/kaya/commit/dfbb57da0e66525d6ce5aefa74623ba18a1b853a))

- *(ui)* Add subtle outlines to game tree stones for better visibility ([9e7c784](https://github.com/kaya-go/kaya/commit/9e7c78429d7a5d3ac889fa3cfbd29ad33328978e))

- *(ui)* Add drag-to-paint and toggle markers for edit tools ([016abf6](https://github.com/kaya-go/kaya/commit/016abf6f4985adf26116c679fa0e13d5a6ce5873))

### <!-- 1 -->🐛 Bug Fixes

- Pin linuxdeploy version for Linux AppImage EGL fix ([26c6984](https://github.com/kaya-go/kaya/commit/26c69842c33e038e0c70e0b1186058e4c595d359))

- *(ci)* Add linux appimage EGL fix to release workflow ([346c4bc](https://github.com/kaya-go/kaya/commit/346c4bcd61236f7c4557a42d4854437c671f5ad5))

- *(ui)* Only process left-click for drag-to-paint markers ([7715d9d](https://github.com/kaya-go/kaya/commit/7715d9d942f2c05f752bd4571aa73f737ce286ec))

### <!-- 6 -->🧪 Testing

- *(e2e)* Add gameplay and edit tools tests ([45c4834](https://github.com/kaya-go/kaya/commit/45c48340271c3f6e75e937f01eb5594fd6b5dc27))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Ignore ONNX Runtime WASM files copied from node_modules ([002e44c](https://github.com/kaya-go/kaya/commit/002e44ce99f1871f178cd048b9585960b2e42c6b))

- Release v0.2.0 ([924be08](https://github.com/kaya-go/kaya/commit/924be080aca6c37b6302e9e43e9350be15f24847))

## [0.1.12] - 2025-12-30

### <!-- 0 -->🚀 Features

- *(desktop)* Add about metadata with description and github link ([bef3344](https://github.com/kaya-go/kaya/commit/bef3344e465211652826e18b04fd6f9fad29ea61))

- *(desktop)* Add custom about dialog with version info and github links ([bffb2b7](https://github.com/kaya-go/kaya/commit/bffb2b7df9c8e4e652ef1583698e858b835f20f5))

- *(ui)* Add About dialog accessible from footer and menu ([1f2d1c6](https://github.com/kaya-go/kaya/commit/1f2d1c622a4b361a448e2ef1441dd7e047417e72))

- *(web)* Add PWA support for installable web app ([5deb058](https://github.com/kaya-go/kaya/commit/5deb058acc346bdd96d864ddc37e795546994250))

- *(ui)* Require model download before enabling analysis mode ([993f6f7](https://github.com/kaya-go/kaya/commit/993f6f79b2aac473a5280a34be5f39261067ea3d))

### <!-- 1 -->🐛 Bug Fixes

- *(desktop)* Remove empty File menu on Linux/Windows ([f605944](https://github.com/kaya-go/kaya/commit/f6059446ab194f7b04c01e9ba1b3ba170ca821fd))

- *(ci)* Read version from package.json instead of gitignored version.json ([f2f6349](https://github.com/kaya-go/kaya/commit/f2f6349c6983da2f039139c3ce2d1b740a0baa82))

- *(ci)* Add tauri signing keys to nightly builds ([3486723](https://github.com/kaya-go/kaya/commit/3486723a97ca9755d3caa9e8697fb9c9367fd7c8))

- *(ci)* Use numeric date suffix for nightly version (MSI compatibility) ([6c4df53](https://github.com/kaya-go/kaya/commit/6c4df5387329f46a063411ce7d2b009da3630732))

- *(ci)* Skip msi build for nightly, use nsis exe only ([7e20b15](https://github.com/kaya-go/kaya/commit/7e20b15227270a25674466389561ba8f151393a6))

- *(ci)* Use standard version from package.json for nightly builds ([a267adb](https://github.com/kaya-go/kaya/commit/a267adb0200b9d9f657e1432d648ff2a930a43cc))

- *(web)* Disable google analytics on localhost ([3b45a4d](https://github.com/kaya-go/kaya/commit/3b45a4d5533e6a2b9d14050b0769ab40996ee012))

- *(desktop)* Rename help menu to about on linux/windows ([ffba96a](https://github.com/kaya-go/kaya/commit/ffba96a11f7b48429abbb395400f26e62dc0b6de))

- *(desktop)* Fix about dialog icon path and add icon to public ([93854d1](https://github.com/kaya-go/kaya/commit/93854d18bb18181fff6d02ccf923d826469cfc55))

- *(desktop)* Update analytics page_location to match GA4 data stream URL ([b95056b](https://github.com/kaya-go/kaya/commit/b95056b7ff45d27ef2ac35b4065a00cd0065e29a))

- *(web)* Resolve service worker reload conflict causing black screen ([f2c6b7e](https://github.com/kaya-go/kaya/commit/f2c6b7ef504269de6208f42441b2a502897afa09))

### <!-- 3 -->📚 Documentation

- Clarify git commit behavior in agent rules ([3e3b23c](https://github.com/kaya-go/kaya/commit/3e3b23c5feb66d1363fe8476285a2b5cebbb0c10))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Add nightly build workflow for linux, macos, and windows ([0aa460e](https://github.com/kaya-go/kaya/commit/0aa460e86a3ef9c85aa4472e1341eb6a3776e08e))

- Remove msi build, use nsis exe only for windows ([9e131c1](https://github.com/kaya-go/kaya/commit/9e131c1549df99e8335eca713c3d6220a821bd96))

- Release v0.1.12 ([38c6ad5](https://github.com/kaya-go/kaya/commit/38c6ad595ab7254c98e2613286f3cae96ab81828))

## [0.1.11] - 2025-12-29

### <!-- 1 -->🐛 Bug Fixes

- *(ui)* Fix comment editing not working with shared context ([dfcbb02](https://github.com/kaya-go/kaya/commit/dfcbb02c8dfc5f1459ad20bfeea203bc10079fbb))

- *(desktop)* Downgrade ndarray to 0.16 to match ort crate ([d10fac4](https://github.com/kaya-go/kaya/commit/d10fac44a09c4a99742a6b1952085c142be18a69))

### <!-- 2 -->🚜 Refactor

- *(e2e)* Split tests into separate files by feature ([da9a8fe](https://github.com/kaya-go/kaya/commit/da9a8fe98aebd1cf9ec8f89a929d8ac6773f486b))

- *(scripts)* Add tauri:check script for rust compilation check ([b22b09e](https://github.com/kaya-go/kaya/commit/b22b09efa7335def6c8d470664b57b5d646811a2))

### <!-- 6 -->🧪 Testing

- Add unit tests and e2e tests with playwright ([a2b0c50](https://github.com/kaya-go/kaya/commit/a2b0c50a85c25e7835f57c8ec8e2e0c4ff9b91a8))

- *(e2e)* Add comment editing tests ([7749b9f](https://github.com/kaya-go/kaya/commit/7749b9fb973e7cd846e5171635e7e1bfee63a996))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- *(ci)* Add github automation workflows and policies ([2ae303e](https://github.com/kaya-go/kaya/commit/2ae303ed87e84270f7896359385dea518528c959))

- Remove optional scope validation from PR title check ([e3b6a27](https://github.com/kaya-go/kaya/commit/e3b6a27eedab7a2e2f48cb0dfef7e95f2e815385))

- Remove unnecessary newline in PR title check workflow ([3e81d2d](https://github.com/kaya-go/kaya/commit/3e81d2dc2a09a8f96dc71568f9f7b875e9f75528))

- *(ci)* Bump actions/labeler from 5 to 6 ([#16](https://github.com/kaya-go/kaya/issues/16))

- *(ci)* Bump actions/checkout from 4 to 6 ([#18](https://github.com/kaya-go/kaya/issues/18))

- *(ci)* Bump github/codeql-action from 3 to 4 ([#17](https://github.com/kaya-go/kaya/issues/17))

- *(ci)* Bump actions/first-interaction from 1 to 3 ([#19](https://github.com/kaya-go/kaya/issues/19))

- *(ci)* Bump mozilla-actions/sccache-action from 0.0.6 to 0.0.9 ([#21](https://github.com/kaya-go/kaya/issues/21))

- *(ci)* Bump actions/stale from 9 to 10 ([#20](https://github.com/kaya-go/kaya/issues/20))

- Remove CodeQL security analysis workflow ([12ddf53](https://github.com/kaya-go/kaya/commit/12ddf530ee379315169cc44296137db857e36dbc))

- Add rust/tauri compilation check to PR builds ([772bb0a](https://github.com/kaya-go/kaya/commit/772bb0a875cb2e51f214c3d940b224cef13b6ef9))

- Release v0.1.11 ([53a81ad](https://github.com/kaya-go/kaya/commit/53a81ad1d3a6e98387afeb61b250fe0f9d817bc8))

## [0.1.10] - 2025-12-29

### <!-- 0 -->🚀 Features

- Add macOS code signing and notarization ([c554c02](https://github.com/kaya-go/kaya/commit/c554c0283882075ec0b08216d1fdbaf62946a650))

### <!-- 2 -->🚜 Refactor

- *(ui)* Redesign analysis panel toolbar layout ([b048998](https://github.com/kaya-go/kaya/commit/b04899812ecb5583580916b7acca095ea1e1a715))

### <!-- 3 -->📚 Documentation

- Remove xattr workaround instructions now that dmg is signed ([f8c20aa](https://github.com/kaya-go/kaya/commit/f8c20aabe7b8f9f32066dacf67c58de4d49dd390))

- Update issue template links in readme ([36c5c22](https://github.com/kaya-go/kaya/commit/36c5c22b429fc272c8bc31316404e78818947422))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Add rpm to release artifacts and downloads table ([1b58a0d](https://github.com/kaya-go/kaya/commit/1b58a0d9119b22b438030147baa540a6695b35c6))

- Add PR title validation for conventional commits ([464eefa](https://github.com/kaya-go/kaya/commit/464eefa66c2d2e152659b10928e37dc64caffffd))

- Release v0.1.10 ([6f2d5be](https://github.com/kaya-go/kaya/commit/6f2d5be0cc0e7e873f597d65aaee6a81f5d1e093))

## [0.1.9] - 2025-12-28

### <!-- 0 -->🚀 Features

- *(ui)* Add translations and keyboard shortcut for suggest move button ([b0e85ba](https://github.com/kaya-go/kaya/commit/b0e85badec2adf4a5117be71eb59c09792b90e6f))

- *(ui)* Auto-trigger suggest move after engine initialization ([562ff50](https://github.com/kaya-go/kaya/commit/562ff50a07db194d59810b80fc4f989dfbf0572b))

- *(ui)* Add analysis mode indicator with toggle logic ([c5f26ca](https://github.com/kaya-go/kaya/commit/c5f26ca4cf9a6a459db481d3802c8f8d02aafbfe))

### <!-- 1 -->🐛 Bug Fixes

- *(ui)* Play sound when AI suggests a move ([c8c01fa](https://github.com/kaya-go/kaya/commit/c8c01fa0986e6278102d41836942dec7c2869c1f))

- *(ui)* Lower status bar hide breakpoint from 1440px to 1024px ([6f1075b](https://github.com/kaya-go/kaya/commit/6f1075b893f953dc9e20529d298f526c2e5d9409))

- *(desktop)* Strip html comments from changelog in updater ([de0fcd1](https://github.com/kaya-go/kaya/commit/de0fcd1a0f78bdeb90ef448cdc7100001ff76fe3))

### <!-- 2 -->🚜 Refactor

- *(ui)* Separate AI engine lifecycle from analysis context ([663ee20](https://github.com/kaya-go/kaya/commit/663ee205842b6048b791b8b08d80bbbdb0b3447f))

- *(ui)* Use createEngine factory to remove Tauri engine duplication ([737f5fb](https://github.com/kaya-go/kaya/commit/737f5fb7aec1d11f5c6ea6f96d1e3dcab4d948f4))

### <!-- 3 -->📚 Documentation

- *(ui)* Add comments clarifying move generation vs analysis separation ([b0dc8ef](https://github.com/kaya-go/kaya/commit/b0dc8ef6a4d8686d197362c5e464accf055e4ed5))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.9 ([4a9bf86](https://github.com/kaya-go/kaya/commit/4a9bf865cdb0747ff03e9f1973d11f6384bce59e))

## [0.1.8] - 2025-12-28

### <!-- 0 -->🚀 Features

- *(ui)* Add unified KayaConfig modal with tabs and fuzzy stone placement toggle ([5569982](https://github.com/kaya-go/kaya/commit/55699820c269a72566337bdc9be8142533b143b4))

- *(ui)* Add explanation for custom model upload feature ([97904b4](https://github.com/kaya-go/kaya/commit/97904b40c481b471bcd8892318822022dc432673))

- *(ui)* Improve AI config UX with get started banner and KataGo attribution ([d794960](https://github.com/kaya-go/kaya/commit/d794960575ddd6c397af4b9f4978db7d6aaffc4f))

### <!-- 1 -->🐛 Bug Fixes

- *(ui)* Prevent toggle switch from inheriting tablet min-height ([ef64e0c](https://github.com/kaya-go/kaya/commit/ef64e0cbf46e7aae4aebd9bb843db79e6cdb7573))

- *(linux)* Improve appimage compatibility by building on ubuntu-22.04 ([e13c7f2](https://github.com/kaya-go/kaya/commit/e13c7f257cbd4a119f370eab86a605bf688580fb))

- *(release)* Update platform condition to use ubuntu-22.04 for dependencies and build ([e32d2a5](https://github.com/kaya-go/kaya/commit/e32d2a58b38cc68208023691c2c58b0f09c73bb0))

- Remove unsupported bundleXdgOpen config option ([0eed66a](https://github.com/kaya-go/kaya/commit/0eed66a961c39606e20136eec5525e696fbf3184))

- *(i18n)* Upgrade react-i18next to v16.5.0 and fix language switching ([c10f95f](https://github.com/kaya-go/kaya/commit/c10f95f9f8051174211bfd072e6730acd0d98ba1))

### <!-- 2 -->🚜 Refactor

- *(ui)* Rename settings to analysis options in AI config ([5656f0e](https://github.com/kaya-go/kaya/commit/5656f0e51a52336c35d8fdd312f3038f934377a2))

### <!-- 3 -->📚 Documentation

- Add github release download count badge ([2090486](https://github.com/kaya-go/kaya/commit/2090486b70384b8c6581a0557f988a86d4d69a02))

- *(i18n)* Clarify that only .onnx models are supported for custom upload ([f66f13e](https://github.com/kaya-go/kaya/commit/f66f13eca1d12f0d40c82d4ca82daf9d7ed90157))

- Add contributing guide with setup instructions ([b19113c](https://github.com/kaya-go/kaya/commit/b19113c33c5dfba83f878240f43bddabd48018da))

- Add issue and pull request templates ([bc355b8](https://github.com/kaya-go/kaya/commit/bc355b839792ff67501e0258a5dc65644d931f1c))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Add stale bot to close inactive issues and PRs ([a5584c1](https://github.com/kaya-go/kaya/commit/a5584c13bc4cf48278043971aad2f2231ca5f0f0))

- Release v0.1.8 ([b253e76](https://github.com/kaya-go/kaya/commit/b253e7660f577b7c2432a5b5ea52773f1f635cd1))

## [0.1.7] - 2025-12-28

### <!-- 0 -->🚀 Features

- *(ui)* Show analysis panel by default ([fa82ea3](https://github.com/kaya-go/kaya/commit/fa82ea3704b5c20edd3d766c823a36ff14a76b16))

### <!-- 1 -->🐛 Bug Fixes

- *(ui)* Fix light mode styling for various UI components ([c3984a5](https://github.com/kaya-go/kaya/commit/c3984a5fec08ee07c5d50687af82e7de5c0ec935))

- Edit toolbar layout and scroll behavior at 1440px width ([725eff9](https://github.com/kaya-go/kaya/commit/725eff9d50b4318a45610e62ae113990ac895528))

- *(ui)* Add padding to win rate y-axis limits in analysis chart ([95f2775](https://github.com/kaya-go/kaya/commit/95f277547664fd85b1fa0da2d6259c45611df4eb))

- *(ui)* Increase bottom padding for x-axis labels in analysis chart ([3b0228f](https://github.com/kaya-go/kaya/commit/3b0228fda4d28db1c30a225bc3545e6c1a913959))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Add CLA assistant workflow and contributor license agreement ([50dee15](https://github.com/kaya-go/kaya/commit/50dee152e2e0fe778eb55c3bc73723e637f910c3))

- Release v0.1.7 ([0def89d](https://github.com/kaya-go/kaya/commit/0def89d4db7814951bbaba5cc795cd0f6acfc97e))

## [0.1.6] - 2025-12-27

### <!-- 0 -->🚀 Features

- *(desktop)* Improve updater UI with dev mode testing and better styling ([644f04e](https://github.com/kaya-go/kaya/commit/644f04e6031b1807c6698cce48a8bbe3eeedfbfc))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.6 ([075b95d](https://github.com/kaya-go/kaya/commit/075b95d7c801f7003d0ffe25077389411fa51ef1))

## [0.1.5] - 2025-12-27

### <!-- 0 -->🚀 Features

- *(ai)* Hierarchical model selector with quantization options ([38ca0ed](https://github.com/kaya-go/kaya/commit/38ca0ed2a3797889c8d8f87b3273b9a4349449cd))

- *(ai)* Add smart backend fallback with settings persistence ([57c4c8c](https://github.com/kaya-go/kaya/commit/57c4c8ce422a9dd2c2c4e4f80f718c233322b0f7))

### <!-- 1 -->🐛 Bug Fixes

- Delete cached model from tauri filesystem when model is deleted ([829f7cc](https://github.com/kaya-go/kaya/commit/829f7ccf9c749c75f52e01cae57364ac3c5e99bb))

### <!-- 2 -->🚜 Refactor

- *(ai)* Simplify model definitions with url generation helper ([dc3743c](https://github.com/kaya-go/kaya/commit/dc3743c0f8b0aa331fee29a896e7b3f19bcfe0aa))

- *(ai)* Improve expand/collapse handling in AIAnalysisConfig ([fd258c6](https://github.com/kaya-go/kaya/commit/fd258c6d5029d568cdb39392a557f59014769d91))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.5 ([61b078f](https://github.com/kaya-go/kaya/commit/61b078f8e401b3f82ce4fe5ec9a3e30ce00f87ee))

## [0.1.4] - 2025-12-27

### <!-- 0 -->🚀 Features

- *(ai)* Pin katago models to specific hugging face commit hash ([47ff9bc](https://github.com/kaya-go/kaya/commit/47ff9bc144d68bd083e01f3df52c4e1f7bc6fc30))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.4 ([9e7fb1d](https://github.com/kaya-go/kaya/commit/9e7fb1d2adbf4643897d5b8c33189ba8cc854fa6))

## [0.1.3] - 2025-12-16

### <!-- 0 -->🚀 Features

- *(ui)* Create new game on paste with game name as filename ([8be79df](https://github.com/kaya-go/kaya/commit/8be79df1cbec73d609142bfe0faeacbb346d9ff8))

### <!-- 1 -->🐛 Bug Fixes

- *(desktop)* Use tauri clipboard plugin to avoid paste permission popup ([15de470](https://github.com/kaya-go/kaya/commit/15de4709ef802f3e81c1cb6eea311a0c497ccccf))

- Preserve analysis cache when loading SGF with embedded analysis ([9af0088](https://github.com/kaya-go/kaya/commit/9af0088874345c2492d7a92969a33936d59afd19))

- *(ai-engine)* Always display black win rate in analysis bar ([1bff38f](https://github.com/kaya-go/kaya/commit/1bff38f8ce7317f1ce670605960e7bce1ed783a7))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.3 ([6376203](https://github.com/kaya-go/kaya/commit/63762035e74558f656e79731f9fb48af49340484))

## [0.1.2] - 2025-12-14

### <!-- 0 -->🚀 Features

- Migrate model hosting from GitHub to Hugging Face ([13fa7e7](https://github.com/kaya-go/kaya/commit/13fa7e731b747462b15c9c91ae4ee467baff3077))

- *(ai)* Add latest KataGo model and improve model library UX ([c1cf500](https://github.com/kaya-go/kaya/commit/c1cf5005709893f1b23c583b327baea8e237b678))

- *(ai)* Add recommended and default badges to first model ([6d8d935](https://github.com/kaya-go/kaya/commit/6d8d935d38839318f7da514dc9c369ec8be6bab1))

### <!-- 2 -->🚜 Refactor

- *(ai)* Use neutral model descriptions with 4 variants ([ed3f591](https://github.com/kaya-go/kaya/commit/ed3f591dfecbb2b4baf778f3b1743afefa3848d7))

- *(ai)* Format recommended badge rendering and improve default model selection logic ([a818916](https://github.com/kaya-go/kaya/commit/a8189161d72d3f982a1505fc45a3f0ce396d5cd7))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.2 ([c44393b](https://github.com/kaya-go/kaya/commit/c44393b85ecc337627bfa9cf3c7eb41615f65eb3))

## [0.1.1] - 2025-12-13

### <!-- 0 -->🚀 Features

- *(desktop)* Add landing page and home button for mobile/tablet layout ([83a76f3](https://github.com/kaya-go/kaya/commit/83a76f35f6e00d3ced09593cd5426a56069dbf39))

### <!-- 1 -->🐛 Bug Fixes

- *(i18n)* Wait for translations to load before showing updater text ([2c19515](https://github.com/kaya-go/kaya/commit/2c195158dfdef000a0169fe746e23ca4bd284ceb))

- *(i18n)* Add missing translation keys for landing, editToolbar, and scoring ([e5bb31f](https://github.com/kaya-go/kaya/commit/e5bb31fe2e70f1ce8e61a3f76cb71edf28c45d12))

- Landing page library button now opens library tab on mobile ([376a415](https://github.com/kaya-go/kaya/commit/376a415354d996892d3f6ce6ae11f597ee8caa94))

- *(i18n)* Rename 'Configuration IA' to 'Configuration de l'analyse' in french ([d14e04c](https://github.com/kaya-go/kaya/commit/d14e04c18857c1b475b22c00de3731d3d6e1f3c9))

### <!-- 3 -->📚 Documentation

- Add screenshot to readme ([befd978](https://github.com/kaya-go/kaya/commit/befd978b112d5a92cf9cb6317bb29e7a20573979))

- Add multi-language and mobile/tablet support to features ([de4d3ac](https://github.com/kaya-go/kaya/commit/de4d3ac98a737c0d091c4f4831f1edc60ac0a401))

- Add release badge and tech stack badges with logos ([4f0f7a5](https://github.com/kaya-go/kaya/commit/4f0f7a5b8c1ce772eb158047c417d1f23c468a99))

- Replace text links with styled action buttons ([e3fdb65](https://github.com/kaya-go/kaya/commit/e3fdb65db6736eccd6c63289660ce6c72b022376))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Release v0.1.1 ([3eb79dd](https://github.com/kaya-go/kaya/commit/3eb79ddd1b082ebbd114dcfe11bcb6f69e71cb24))

## [0.1.0] - 2025-12-13

### <!-- 1 -->🐛 Bug Fixes

- Disable debug info stripping for release builds ([635fd32](https://github.com/kaya-go/kaya/commit/635fd3253415765a4b6bc0b88ffe0daa1ad7a8fc))

### <!-- 7 -->⚙️ Miscellaneous Tasks

- Initial commit ([97a2457](https://github.com/kaya-go/kaya/commit/97a245746ac87df64284a9d6e31c35b3e3f0ba5e))

- Release v0.1.0 ([aacf98c](https://github.com/kaya-go/kaya/commit/aacf98cccb32cf78f2557fd51de6ee0f90fd0bd0))

<!-- generated by git-cliff -->
